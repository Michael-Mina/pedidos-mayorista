"""
Restaura un respaldo creado con backup_db.py.

Uso:
  python restore_db.py --list
  python restore_db.py backups/backup_20260525_120000
  python restore_db.py --latest
  python restore_db.py --latest --drop-schema   # vacía public antes (destructivo)
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app import backup  # noqa: E402


def _resolve_backup_path(name: str | None, use_latest: bool) -> Path:
    root = backup.get_backup_dir()
    if use_latest:
        items = backup.list_backups(root)
        if not items:
            raise FileNotFoundError(f"No hay respaldos en {root}")
        return Path(items[0]["path"])
    if not name:
        raise ValueError("Indique la carpeta del respaldo o use --latest")
    path = Path(name)
    if not path.is_absolute():
        path = root / path
    if not path.is_dir():
        raise FileNotFoundError(f"No existe la carpeta de respaldo: {path}")
    return path.resolve()


def main() -> int:
    parser = argparse.ArgumentParser(description="Restaurar respaldo de BD y estáticos")
    parser.add_argument("backup", nargs="?", help="Carpeta backup_YYYYMMDD_HHMMSS o nombre dentro de backups/")
    parser.add_argument("--latest", action="store_true", help="Usar el respaldo más reciente")
    parser.add_argument("--list", action="store_true", help="Listar respaldos disponibles")
    parser.add_argument("--schema-only", action="store_true", help="Solo restaurar schema.sql")
    parser.add_argument("--data-only", action="store_true", help="Solo restaurar data.sql")
    parser.add_argument("--no-static", action="store_true", help="No restaurar static.zip")
    parser.add_argument(
        "--drop-schema",
        action="store_true",
        help="Borra el esquema public antes de restaurar (destructivo)",
    )
    parser.add_argument("-y", "--yes", action="store_true", help="No pedir confirmación")
    args = parser.parse_args()

    if args.list:
        for item in backup.list_backups():
            print(f"{item['path']}  ({item.get('created_at', '?')})")
        return 0

    try:
        backup_path = _resolve_backup_path(args.backup, args.latest)
    except (FileNotFoundError, ValueError) as exc:
        print(exc, file=sys.stderr)
        return 1

    if not args.yes:
        print(f"Se restaurará desde: {backup_path}")
        if args.drop_schema:
            print("ADVERTENCIA: --drop-schema eliminará todas las tablas actuales.")
        answer = input("¿Continuar? [s/N]: ").strip().lower()
        if answer not in ("s", "si", "sí", "y", "yes"):
            print("Cancelado.")
            return 0

    schema_only = args.schema_only
    data_only = args.data_only
    if schema_only and data_only:
        print("Elija solo uno: --schema-only o --data-only")
        return 1

    try:
        result = backup.restore_backup(
            backup_path,
            restore_schema=not data_only,
            restore_data=not schema_only,
            restore_static=not args.no_static,
            drop_schema_first=args.drop_schema,
        )
    except Exception as exc:
        print(f"Error al restaurar: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(result, indent=2, ensure_ascii=False))
    print("\nRestauración completada.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
