"""Vacía la BD y deja solo master. Uso: python reset_database.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.db_reset import reset_to_master_only


if __name__ == "__main__":
    if os.getenv("CONFIRM_DB_RESET", "").lower() not in ("1", "true", "yes"):
        print("ADVERTENCIA: esto borra TODOS los datos.")
        print("Ejecute con CONFIRM_DB_RESET=true para continuar.")
        sys.exit(1)

    db = SessionLocal()
    try:
        result = reset_to_master_only(db)
        access = result["access"]
        print(result["message"])
        print(f"Usuario: {access['username']}")
        print(f"Contraseña: {access['password']}")
    finally:
        db.close()
