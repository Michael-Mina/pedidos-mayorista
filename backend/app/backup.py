"""
Respaldo y restauración de PostgreSQL y archivos estáticos de la aplicación.

Requiere las herramientas cliente de PostgreSQL (pg_dump, psql) en PATH o en PG_DUMP_PATH.
"""

from __future__ import annotations

import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import zipfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from dotenv import load_dotenv
from sqlalchemy import MetaData, inspect, text
from sqlalchemy.engine.url import make_url
from sqlalchemy.schema import CreateTable

from .database import engine

load_dotenv()

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_PROJECT_ROOT = _BACKEND_ROOT.parent
_DEFAULT_BACKUP_DIR = _PROJECT_ROOT / "backups"
_STATIC_DIRS = (
    _BACKEND_ROOT / "static" / "cortes",
    _BACKEND_ROOT / "static" / "uploads",
)
_MANIFEST_VERSION = 1


@dataclass(frozen=True)
class DbConnectionParams:
    host: str
    port: str
    user: str
    password: str
    database: str


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if url:
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        return url
    user = os.getenv("DB_USER", "postgres")
    password = os.getenv("DB_PASS", "password")
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "5432")
    name = os.getenv("DB_NAME", "supertiendas_db")
    return f"postgresql://{user}:{password}@{host}:{port}/{name}"


def get_db_connection_params() -> DbConnectionParams:
    parsed = make_url(_database_url())
    return DbConnectionParams(
        host=parsed.host or "localhost",
        port=str(parsed.port or 5432),
        user=parsed.username or "postgres",
        password=parsed.password or "",
        database=parsed.database or "supertiendas_db",
    )


def get_backup_dir() -> Path:
    raw = os.getenv("BACKUP_DIR", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return _DEFAULT_BACKUP_DIR.resolve()


def _retention_days() -> int:
    try:
        return max(1, int(os.getenv("BACKUP_RETENTION_DAYS", "30")))
    except ValueError:
        return 30


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def _run_name() -> str:
    return f"backup_{_timestamp()}"


def _find_pg_tool(base_name: str) -> str:
    """Resuelve pg_dump o psql: env, PATH o instalación típica en Windows."""
    env_key = "PG_DUMP_PATH" if base_name == "pg_dump" else "PSQL_PATH"
    if base_name == "pg_dump":
        explicit = os.getenv("PG_DUMP_PATH", "").strip()
    else:
        explicit = os.getenv("PSQL_PATH", "").strip() or os.getenv("PG_DUMP_PATH", "").strip()

    if explicit:
        p = Path(explicit)
        if p.is_file():
            return str(p)
        if p.is_dir():
            candidate = p / f"{base_name}.exe" if os.name == "nt" else p / base_name
            if candidate.is_file():
                return str(candidate)

    found = shutil.which(base_name)
    if found:
        return found

    if os.name == "nt":
        program_files = [
            os.environ.get("ProgramFiles", r"C:\Program Files"),
            os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
        ]
        for root in program_files:
            pg_root = Path(root) / "PostgreSQL"
            if not pg_root.is_dir():
                continue
            for version_dir in sorted(pg_root.iterdir(), reverse=True):
                bin_dir = version_dir / "bin"
                exe = bin_dir / f"{base_name}.exe"
                if exe.is_file():
                    return str(exe)

    raise FileNotFoundError(
        f"No se encontró '{base_name}'. Instale las herramientas cliente de PostgreSQL "
        f"o defina PG_DUMP_PATH / PSQL_PATH apuntando al binario o a la carpeta bin."
    )


def _pg_dump_args(params: DbConnectionParams, extra: list[str]) -> list[str]:
    pg_dump = _find_pg_tool("pg_dump")
    return [
        pg_dump,
        "--host",
        params.host,
        "--port",
        params.port,
        "--username",
        params.user,
        "--dbname",
        params.database,
        "--no-owner",
        "--no-acl",
        *extra,
    ]


def _run_pg_dump(params: DbConnectionParams, extra: list[str], output_file: Path) -> None:
    env = os.environ.copy()
    if params.password:
        env["PGPASSWORD"] = params.password
    cmd = _pg_dump_args(params, extra)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    with output_file.open("wb") as out:
        result = subprocess.run(
            cmd,
            stdout=out,
            stderr=subprocess.PIPE,
            env=env,
            check=False,
        )
    if result.returncode != 0:
        if output_file.exists():
            output_file.unlink(missing_ok=True)
        err = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"pg_dump falló (código {result.returncode}): {err}")


def _pg_dump_usable() -> bool:
    try:
        _find_pg_tool("pg_dump")
        return True
    except FileNotFoundError:
        return False


def _reflect_metadata() -> MetaData:
    metadata = MetaData()
    metadata.reflect(bind=engine, schema="public")
    return metadata


def _sql_literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            return f"'{value.isoformat()}'"
        return f"'{value.isoformat()}'"
    if isinstance(value, (bytes, bytearray)):
        return f"'\\x{value.hex()}'"
    escaped = str(value).replace("'", "''")
    return f"'{escaped}'"


def _dump_schema_python(output_file: Path) -> None:
    metadata = _reflect_metadata()
    lines = [
        "-- Respaldo de estructura (SQLAlchemy, sin pg_dump)",
        "SET client_encoding = 'UTF8';",
        "",
    ]
    for table in metadata.sorted_tables:
        ddl = str(CreateTable(table).compile(dialect=engine.dialect))
        lines.append(f"{ddl};")
        lines.append("")
    output_file.write_text("\n".join(lines), encoding="utf-8")


def _dump_data_python(output_file: Path) -> None:
    metadata = _reflect_metadata()
    inspector = inspect(engine)
    lines = [
        "-- Respaldo de datos (INSERT, sin pg_dump)",
        "SET client_encoding = 'UTF8';",
        "",
    ]
    with engine.connect() as conn:
        for table in metadata.sorted_tables:
            pk = inspector.get_pk_constraint(table.name).get("constrained_columns") or []
            order_cols = list(pk) if pk else [c.name for c in table.columns[:1]]
            order_sql = ", ".join(f'"{c}"' for c in order_cols) if order_cols else "1"
            rows = conn.execute(
                text(f'SELECT * FROM "{table.name}" ORDER BY {order_sql}')
            ).mappings().all()
            if not rows:
                continue
            col_names = list(rows[0].keys())
            cols_sql = ", ".join(f'"{c}"' for c in col_names)
            lines.append(f"-- {table.name}")
            for row in rows:
                vals = ", ".join(_sql_literal(row[c]) for c in col_names)
                lines.append(f'INSERT INTO "{table.name}" ({cols_sql}) VALUES ({vals});')
            lines.append("")
    output_file.write_text("\n".join(lines), encoding="utf-8")


def dump_schema(params: DbConnectionParams, output_file: Path) -> None:
    if _pg_dump_usable():
        _run_pg_dump(params, ["--schema-only"], output_file)
    else:
        _dump_schema_python(output_file)


def dump_data(params: DbConnectionParams, output_file: Path) -> None:
    if _pg_dump_usable():
        _run_pg_dump(params, ["--data-only", "--inserts"], output_file)
    else:
        _dump_data_python(output_file)


def dump_full(params: DbConnectionParams, output_file: Path) -> None:
    if _pg_dump_usable():
        _run_pg_dump(params, [], output_file)
    else:
        _dump_schema_python(output_file)
        data_tmp = output_file.parent / f".{output_file.stem}_data_tmp.sql"
        try:
            _dump_data_python(data_tmp)
            with output_file.open("a", encoding="utf-8") as out:
                out.write("\n")
                out.write(data_tmp.read_text(encoding="utf-8"))
        finally:
            data_tmp.unlink(missing_ok=True)


def _zip_static_dirs(target_zip: Path) -> int:
    """Empaqueta carpetas estáticas; devuelve cantidad de archivos incluidos."""
    target_zip.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with zipfile.ZipFile(target_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for static_dir in _STATIC_DIRS:
            if not static_dir.is_dir():
                continue
            for path in static_dir.rglob("*"):
                if path.is_file():
                    arcname = path.relative_to(_BACKEND_ROOT)
                    zf.write(path, arcname.as_posix())
                    count += 1
    return count


def _write_manifest(run_dir: Path, manifest: dict[str, Any]) -> Path:
    path = run_dir / "manifest.json"
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def cleanup_old_backups(backup_root: Path | None = None, retention_days: int | None = None) -> int:
    """Elimina carpetas backup_* más antiguas que el período de retención."""
    root = backup_root or get_backup_dir()
    days = retention_days if retention_days is not None else _retention_days()
    if not root.is_dir():
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    removed = 0
    pattern = re.compile(r"^backup_\d{8}_\d{6}$")
    for entry in root.iterdir():
        if not entry.is_dir() or not pattern.match(entry.name):
            continue
        mtime = datetime.fromtimestamp(entry.stat().st_mtime, tz=timezone.utc)
        if mtime < cutoff:
            shutil.rmtree(entry, ignore_errors=True)
            removed += 1
    return removed


def create_backup(
    *,
    include_schema: bool = True,
    include_data: bool = True,
    include_static: bool = True,
    include_full: bool = False,
    backup_dir: Path | None = None,
    cleanup: bool = True,
) -> dict[str, Any]:
    """
    Crea un respaldo en backups/backup_YYYYMMDD_HHMMSS/.

    Por defecto genera:
    - schema.sql (solo estructura)
    - data.sql (solo datos, INSERT)
    - static.zip (imágenes y uploads)
    """
    params = get_db_connection_params()
    root = backup_dir or get_backup_dir()
    run_dir = root / _run_name()
    run_dir.mkdir(parents=True, exist_ok=True)

    files: dict[str, str] = {}
    errors: list[str] = []

    if include_schema:
        path = run_dir / "schema.sql"
        try:
            dump_schema(params, path)
            files["schema"] = path.name
        except Exception as exc:
            errors.append(f"schema: {exc}")

    if include_data:
        path = run_dir / "data.sql"
        try:
            dump_data(params, path)
            files["data"] = path.name
        except Exception as exc:
            errors.append(f"data: {exc}")

    if include_full:
        path = run_dir / "full.sql"
        try:
            dump_full(params, path)
            files["full"] = path.name
        except Exception as exc:
            errors.append(f"full: {exc}")

    static_files_count = 0
    if include_static:
        path = run_dir / "static.zip"
        try:
            static_files_count = _zip_static_dirs(path)
            if static_files_count > 0:
                files["static"] = path.name
            elif path.exists():
                path.unlink(missing_ok=True)
        except Exception as exc:
            errors.append(f"static: {exc}")

    manifest: dict[str, Any] = {
        "version": _MANIFEST_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "database": params.database,
        "host": params.host,
        "backup_method": "pg_dump" if _pg_dump_usable() else "python",
        "files": files,
        "static_files_count": static_files_count,
    }
    if errors:
        manifest["errors"] = errors
    _write_manifest(run_dir, manifest)

    removed = 0
    if cleanup:
        removed = cleanup_old_backups(root)

    return {
        "backup_dir": str(run_dir),
        "manifest": manifest,
        "retention_removed": removed,
        "ok": len(errors) == 0 and bool(files),
    }


def _run_psql_file(params: DbConnectionParams, sql_file: Path) -> None:
    psql = _find_pg_tool("psql")
    env = os.environ.copy()
    if params.password:
        env["PGPASSWORD"] = params.password
    cmd = [
        psql,
        "--host",
        params.host,
        "--port",
        params.port,
        "--username",
        params.user,
        "--dbname",
        params.database,
        "--single-transaction",
        "--set",
        "ON_ERROR_STOP=1",
        "--file",
        str(sql_file),
    ]
    result = subprocess.run(cmd, stderr=subprocess.PIPE, env=env, check=False)
    if result.returncode != 0:
        err = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"psql falló al ejecutar {sql_file.name}: {err}")


def _extract_static_zip(zip_path: Path) -> int:
    count = 0
    with zipfile.ZipFile(zip_path, "r") as zf:
        for name in zf.namelist():
            if name.endswith("/"):
                continue
            target = _BACKEND_ROOT / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(name) as src, target.open("wb") as dst:
                shutil.copyfileobj(src, dst)
            count += 1
    return count


def load_manifest(backup_path: Path) -> dict[str, Any]:
    path = backup_path if backup_path.is_dir() else backup_path.parent
    manifest_file = path / "manifest.json"
    if not manifest_file.is_file():
        raise FileNotFoundError(f"No hay manifest.json en {path}")
    return json.loads(manifest_file.read_text(encoding="utf-8"))


def restore_backup(
    backup_path: Path,
    *,
    restore_schema: bool = True,
    restore_data: bool = True,
    restore_static: bool = True,
    drop_schema_first: bool = False,
) -> dict[str, Any]:
    """
    Restaura desde una carpeta backup_* o un archivo dentro de ella.

    Si drop_schema_first=True, vacía el esquema public antes de aplicar schema.sql
    (equivalente a execute_sql.py, destructivo).
    """
    run_dir = backup_path if backup_path.is_dir() else backup_path.parent
    manifest = load_manifest(run_dir)
    files = manifest.get("files", {})
    params = get_db_connection_params()
    restored: list[str] = []

    if drop_schema_first:
        from sqlalchemy import text
        from .database import engine

        with engine.connect() as conn:
            trans = conn.begin()
            conn.execute(text("DROP SCHEMA public CASCADE;"))
            conn.execute(text("CREATE SCHEMA public;"))
            conn.execute(text("GRANT ALL ON SCHEMA public TO public;"))
            trans.commit()
        restored.append("schema_reset")

    if restore_schema and "schema" in files:
        _run_psql_file(params, run_dir / files["schema"])
        restored.append("schema")

    if restore_data and "data" in files:
        _run_psql_file(params, run_dir / files["data"])
        restored.append("data")

    if restore_static and "static" in files:
        n = _extract_static_zip(run_dir / files["static"])
        restored.append(f"static ({n} archivos)")

    return {
        "backup_dir": str(run_dir),
        "manifest_created_at": manifest.get("created_at"),
        "restored": restored,
    }


def pg_tools_available() -> bool:
    return _pg_dump_usable()


def backup_available() -> bool:
    """True si pg_dump existe o la BD responde (respaldo por Python en Render)."""
    if _pg_dump_usable():
        return True
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def _zip_directory(source_dir: Path) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in source_dir.rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(source_dir).as_posix())
    return buffer.getvalue()


def build_backup_download() -> tuple[bytes, str]:
    """
    Genera un ZIP listo para descargar (estructura BD + datos + estáticos).
    Devuelve (contenido, nombre_archivo).
    """
    content, filename, _ = build_backup_part("zip")
    return content, filename


def build_backup_part(part: str) -> tuple[bytes, str, str]:
    """
    Genera un archivo de respaldo individual o el ZIP completo.
    part: schema | data | static | manifest | zip
    Devuelve (contenido, nombre_archivo, media_type).
    """
    if not backup_available():
        raise FileNotFoundError(
            "No se puede conectar a la base de datos para generar el respaldo."
        )

    allowed = {"schema", "data", "static", "manifest", "zip"}
    if part not in allowed:
        raise ValueError(f"Parte de respaldo no válida: {part}")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    if part == "zip":
        with tempfile.TemporaryDirectory(prefix="backup_dl_") as tmp:
            tmp_root = Path(tmp)
            result = create_backup(backup_dir=tmp_root, cleanup=False)
            if not result["ok"]:
                errors = result.get("manifest", {}).get("errors", ["Error desconocido"])
                raise RuntimeError("; ".join(errors))
            run_dir = Path(result["backup_dir"])
            filename = f"pedidos_mayorista_backup_{stamp}.zip"
            return _zip_directory(run_dir), filename, "application/zip"

    include_schema = part == "schema"
    include_data = part == "data"
    include_static = part == "static"
    include_all_for_manifest = part == "manifest"

    with tempfile.TemporaryDirectory(prefix="backup_dl_") as tmp:
        tmp_root = Path(tmp)
        result = create_backup(
            backup_dir=tmp_root,
            cleanup=False,
            include_schema=include_schema or include_all_for_manifest,
            include_data=include_data or include_all_for_manifest,
            include_static=include_static or include_all_for_manifest,
        )
        if not result["ok"] and part != "manifest":
            errors = result.get("manifest", {}).get("errors", ["Error desconocido"])
            raise RuntimeError("; ".join(errors))

        run_dir = Path(result["backup_dir"])
        part_files = {
            "schema": ("schema.sql", "application/sql"),
            "data": ("data.sql", "application/sql"),
            "static": ("static.zip", "application/zip"),
            "manifest": ("manifest.json", "application/json"),
        }
        filename_on_disk, media_type = part_files[part]
        path = run_dir / filename_on_disk
        if not path.is_file():
            if part == "static":
                raise FileNotFoundError("No hay archivos estáticos para incluir en el respaldo.")
            errors = result.get("manifest", {}).get("errors", [])
            raise RuntimeError(errors[0] if errors else f"No se generó {filename_on_disk}")

        download_name = f"pedidos_mayorista_{part}_{stamp}{path.suffix}"
        return path.read_bytes(), download_name, media_type


def list_backups(backup_dir: Path | None = None) -> list[dict[str, Any]]:
    root = backup_dir or get_backup_dir()
    if not root.is_dir():
        return []
    pattern = re.compile(r"^backup_\d{8}_\d{6}$")
    entries: list[dict[str, Any]] = []
    for path in sorted(root.iterdir(), reverse=True):
        if not path.is_dir() or not pattern.match(path.name):
            continue
        try:
            manifest = load_manifest(path)
        except OSError:
            manifest = {}
        entries.append(
            {
                "name": path.name,
                "path": str(path),
                "created_at": manifest.get("created_at"),
                "database": manifest.get("database"),
                "files": list(manifest.get("files", {}).keys()),
            }
        )
    return entries
