"""Datos mínimos en BD vacía (Render primer despliegue). Idempotente."""
import os

from . import auth, models
from .database import SessionLocal


def run_if_enabled() -> None:
    if os.getenv("SEED_ON_STARTUP", "").lower() not in ("1", "true", "yes"):
        return
    db = SessionLocal()
    try:
        if db.query(models.User).count() > 0:
            return
        sede = models.Sede(nombre="Sede Central", ciudad="Bogotá")
        db.add(sede)
        db.commit()
        db.refresh(sede)

        if db.query(models.TipoCorte).count() == 0:
            for name in ("Mariposa", "Delgado", "Grueso"):
                db.add(models.TipoCorte(nombre=name))
            db.commit()

        db.add(
            models.User(
                username="mayorista_test",
                role=models.UserRole.MAYORISTA,
                sede_id=sede.id,
                password_hash=auth.get_password_hash("test123"),
            )
        )
        db.commit()
        print("[startup_seed] Usuario mayorista_test / test123 creado.")
    except Exception as err:
        print(f"[startup_seed] Error: {err}")
    finally:
        db.close()
