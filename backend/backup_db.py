"""
Crea un respaldo de la base de datos (estructura + datos) y archivos estáticos.

Uso (desde backend/, con venv activado):
  python backup_db.py
  python backup_db.py --schema-only
  python backup_db.py --data-only
  python backup_db.py --full
  python backup_db.py --list
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app import backup  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Respaldo de PostgreSQL y archivos estáticos")
    parser.add_argument("--schema-only", action="store_true", help="Solo estructura (schema.sql)")
    parser.add_argument("--data-only", action="store_true", help="Solo datos (data.sql)")
    parser.add_argument("--no-static", action="store_true", help="Omitir static.zip")
    parser.add_argument("--full", action="store_true", help="Además generar full.sql (esquema + datos)")
    parser.add_argument("--no-cleanup", action="store_true", help="No eliminar respaldos antiguos")
    parser.add_argument("--list", action="store_true", help="Listar respaldos existentes")
    args = parser.parse_args()

    if args.list:
        items = backup.list_backups()
        if not items:
            print("No hay respaldos en", backup.get_backup_dir())
            return 0
        for item in items:
            files = ", ".join(item.get("files") or [])
            print(f"{item['name']}  ({item.get('created_at', '?')})  [{files}]")
        return 0

    schema_only = args.schema_only
    data_only = args.data_only
    if schema_only and data_only:
        print("Elija solo uno: --schema-only o --data-only")
        return 1

    result = backup.create_backup(
        include_schema=not data_only,
        include_data=not schema_only,
        include_static=not args.no_static,
        include_full=args.full,
        cleanup=not args.no_cleanup,
    )

    print(json.dumps(result, indent=2, ensure_ascii=False))
    if not result["ok"]:
        print("\nEl respaldo terminó con errores. Revise manifest.errors.", file=sys.stderr)
        return 1
    print(f"\nRespaldo guardado en: {result['backup_dir']}")
    if result.get("retention_removed"):
        print(f"Respaldo(s) antiguo(s) eliminado(s): {result['retention_removed']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
