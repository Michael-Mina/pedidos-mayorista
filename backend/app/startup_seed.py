"""Datos mínimos en Render (idempotente). Activa con SEED_ON_STARTUP=true."""
import os

from sqlalchemy import text

from . import auth, models, role_catalog
from .database import SessionLocal, engine

DEMO_USER = "mayorista_test"
DEMO_PASS = "test123"
ADMIN_USER = "admin1"
ADMIN_PASS = "12345678"
MASTER_USER = os.getenv("MASTER_USERNAME", "master")
MASTER_PASS = os.getenv("MASTER_PASSWORD", "Master@2026Pedidos")


def _upsert_user(db, *, username: str, password: str, role, sede_id: int, **extra):
    user = db.query(models.User).filter(models.User.username == username).first()
    pwd_hash = auth.get_password_hash(password)
    if not user:
        db.add(
            models.User(
                username=username,
                role=role,
                sede_id=sede_id,
                password_hash=pwd_hash,
                **extra,
            )
        )
        print(f"[startup_seed] Creado {username} / {password}")
    else:
        user.password_hash = pwd_hash
        user.role = role
        user.sede_id = sede_id
        for key, val in extra.items():
            setattr(user, key, val)
        print(f"[startup_seed] Actualizado {username} / {password}")
    db.commit()


def _ensure_master_role_enum() -> None:
    """PostgreSQL: permite el valor 'master' en el enum de roles (idempotente)."""
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'master'"))
            conn.commit()
    except Exception:
        pass


def ensure_master_user() -> None:
    """Crea o actualiza el usuario master si no existe."""
    _ensure_master_role_enum()
    db = SessionLocal()
    try:
        master = db.query(models.User).filter(
            models.User.role == models.UserRole.MASTER.value
        ).first()
        if master:
            master.password_hash = auth.get_password_hash(MASTER_PASS)
            master.session_active = 1
            master.session_approved = 1
            db.commit()
            return

        role_catalog.seed_builtin_roles(db)
        sede = db.query(models.Sede).first()
        if not sede:
            sede = models.Sede(nombre="__interno__", ciudad="Sistema")
            db.add(sede)
            db.commit()
            db.refresh(sede)
        _upsert_user(
            db,
            username=MASTER_USER,
            password=MASTER_PASS,
            role=models.UserRole.MASTER.value,
            sede_id=sede.id,
            session_active=1,
            session_approved=1,
        )
    except Exception as err:
        print(f"[startup_seed] Error usuario master: {err}")
    finally:
        db.close()


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

        _upsert_user(
            db,
            username=DEMO_USER,
            password=DEMO_PASS,
            role=models.UserRole.MAYORISTA.value,
            sede_id=sede.id,
        )
        _upsert_user(
            db,
            username=ADMIN_USER,
            password=ADMIN_PASS,
            role=models.UserRole.ADMIN.value,
            sede_id=sede.id,
            session_active=1,
            session_approved=1,
        )
        ensure_master_user()
    except Exception as err:
        print(f"[startup_seed] Error: {err}")
    finally:
        db.close()
