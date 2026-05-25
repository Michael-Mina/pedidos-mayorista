"""Crea o actualiza usuario admin en producción (Shell de Render)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app import models
from app.auth import get_password_hash

ADMIN_USER = "admin1"
ADMIN_PASS = "12345678"


def create_initial_data():
    db = SessionLocal()
    try:
        sede = db.query(models.Sede).first()
        if not sede:
            print("Creando Sede Central...")
            sede = models.Sede(nombre="Sede Central", ciudad="Bogotá")
            db.add(sede)
            db.commit()
            db.refresh(sede)

        user = (
            db.query(models.User)
            .filter(models.User.username == ADMIN_USER)
            .first()
        )
        pwd_hash = get_password_hash(ADMIN_PASS)
        if not user:
            db.add(
                models.User(
                    username=ADMIN_USER,
                    password_hash=pwd_hash,
                    role=models.UserRole.ADMIN,
                    sede_id=sede.id,
                    session_active=1,
                    session_approved=1,
                )
            )
            db.commit()
            print(f"Admin creado: {ADMIN_USER} / {ADMIN_PASS}")
        else:
            user.password_hash = pwd_hash
            user.role = models.UserRole.ADMIN
            db.commit()
            print(f"Admin actualizado: {ADMIN_USER} / {ADMIN_PASS}")
    except Exception as e:
        import traceback

        traceback.print_exc()
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    create_initial_data()
