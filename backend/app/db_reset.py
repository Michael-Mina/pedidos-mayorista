"""Vacía la base de datos y deja solo el usuario master."""
from __future__ import annotations

import os

from sqlalchemy import text
from sqlalchemy.orm import Session

from . import auth, models, role_catalog
from .startup_seed import MASTER_PASS, MASTER_USER

MASTER_ROLE_SPEC = {
    "code": "master",
    "label": "Master",
    "panel": "admin",
    "is_system": True,
    "is_hidden": True,
    "can_assign": False,
    "is_enabled": True,
}


def wipe_all_data(db: Session) -> None:
    """Elimina todos los registros respetando FKs."""
    db.query(models.DetallePedido).delete(synchronize_session=False)
    db.query(models.Pedido).delete(synchronize_session=False)
    db.query(models.ButcherAvailability).delete(synchronize_session=False)
    try:
        db.execute(text("DELETE FROM corte_tipocorte"))
    except Exception:
        pass
    db.query(models.Corte).delete(synchronize_session=False)
    db.query(models.User).delete(synchronize_session=False)
    db.query(models.AppRole).delete(synchronize_session=False)
    db.query(models.Sede).delete(synchronize_session=False)
    db.query(models.Categoria).delete(synchronize_session=False)
    db.query(models.TipoCorte).delete(synchronize_session=False)
    db.commit()


def ensure_master_only(db: Session) -> dict:
    """Crea rol master, sede mínima interna y usuario master."""
    db.add(models.AppRole(**MASTER_ROLE_SPEC))
    sede = models.Sede(nombre="__interno__", ciudad="Sistema")
    db.add(sede)
    db.flush()

    master = models.User(
        username=MASTER_USER,
        role=models.UserRole.MASTER.value,
        sede_id=sede.id,
        password_hash=auth.get_password_hash(MASTER_PASS),
        session_active=1,
        session_approved=1,
    )
    db.add(master)
    db.commit()
    db.refresh(master)

    return {
        "username": MASTER_USER,
        "password": MASTER_PASS,
        "role": master.role,
        "user_id": master.id,
    }


def reset_to_master_only(db: Session) -> dict:
    wipe_all_data(db)
    access = ensure_master_only(db)
    return {
        "message": "Base de datos vaciada. Solo queda el usuario master.",
        "access": access,
        "note": "Cambie la contraseña master en Render (MASTER_PASSWORD) si usa producción.",
    }
