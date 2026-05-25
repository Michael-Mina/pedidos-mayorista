"""Datos mínimos en Render (idempotente). Activa con SEED_ON_STARTUP=true."""
import os

from . import auth, models
from .database import SessionLocal

DEMO_USER = "mayorista_test"
DEMO_PASS = "test123"


def run_if_enabled() -> None:
    if os.getenv("SEED_ON_STARTUP", "").lower() not in ("1", "true", "yes"):
        return
    db = SessionLocal()
    try:
        sede = db.query(models.Sede).first()
        if not sede:
            sede = models.Sede(nombre="Sede Central", ciudad="Bogotá")
            db.add(sede)
            db.commit()
            db.refresh(sede)

        if db.query(models.TipoCorte).count() == 0:
            for name in ("Mariposa", "Delgado", "Grueso"):
                db.add(models.TipoCorte(nombre=name))
            db.commit()

        user = (
            db.query(models.User)
            .filter(models.User.username == DEMO_USER)
            .first()
        )
        pwd_hash = auth.get_password_hash(DEMO_PASS)
        if not user:
            db.add(
                models.User(
                    username=DEMO_USER,
                    role=models.UserRole.MAYORISTA,
                    sede_id=sede.id,
                    password_hash=pwd_hash,
                )
            )
            db.commit()
            print(f"[startup_seed] Creado {DEMO_USER} / {DEMO_PASS}")
        else:
            user.password_hash = pwd_hash
            user.sede_id = sede.id
            db.commit()
            print(f"[startup_seed] Contraseña actualizada: {DEMO_USER} / {DEMO_PASS}")
    except Exception as err:
        print(f"[startup_seed] Error: {err}")
    finally:
        db.close()
