"""Catálogo de roles de la aplicación (sistema + personalizados por master)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from . import models

# Roles predefinidos al arrancar / migrar
BUILTIN_ROLES = [
    {
        "code": "admin",
        "label": "Administrador",
        "panel": "admin",
        "is_system": True,
        "is_hidden": False,
        "can_assign": True,
    },
    {
        "code": "master",
        "label": "Master",
        "panel": "admin",
        "is_system": True,
        "is_hidden": True,
        "can_assign": False,
    },
    {
        "code": "mayorista",
        "label": "Mayorista",
        "panel": "mayorista",
        "is_system": True,
        "is_hidden": False,
        "can_assign": True,
    },
    {
        "code": "jefe_carnes",
        "label": "Supervisor",
        "panel": "jefe",
        "is_system": True,
        "is_hidden": False,
        "can_assign": True,
    },
    {
        "code": "sede_butcher",
        "label": "Tablet sede",
        "panel": "sede",
        "is_system": True,
        "is_hidden": True,
        "can_assign": False,
    },
    {
        "code": "carnicero",
        "label": "Carnicero",
        "panel": "sede",
        "is_system": True,
        "is_hidden": True,
        "can_assign": False,
    },
]

PANEL_HOME = {
    "admin": "/admin",
    "mayorista": "/mayorista",
    "jefe": "/jefe",
    "sede": "/sede",
}

PANEL_LABELS = {
    "admin": "Panel de administración",
    "mayorista": "Panel de pedidos",
    "jefe": "Panel de supervisor",
    "sede": "Tablet sede",
}


def normalize_role_code(code: str) -> str:
    text = (code or "").strip().lower().replace(" ", "_")
    allowed = "abcdefghijklmnopqrstuvwxyz0123456789_"
    return "".join(c for c in text if c in allowed)


def seed_builtin_roles(db: Session) -> None:
    """Solo crea el rol master en instalaciones nuevas; no sobrescribe el catálogo existente."""
    if db.query(models.AppRole).count() > 0:
        return
    master_spec = next((s for s in BUILTIN_ROLES if s["code"] == "master"), None)
    if master_spec:
        db.add(models.AppRole(**master_spec))
    db.commit()


def get_role_row(db: Session, code: str) -> models.AppRole | None:
    if not code:
        return None
    return db.query(models.AppRole).filter(models.AppRole.code == code).first()


def resolve_panel(db: Session, role_code: str) -> str:
    row = get_role_row(db, role_code)
    if row and row.panel:
        return row.panel
    # Respaldo si aún no migró catálogo
    legacy = {
        "admin": "admin",
        "master": "admin",
        "mayorista": "mayorista",
        "jefe_carnes": "jefe",
        "sede_butcher": "sede",
        "carnicero": "sede",
    }
    return legacy.get(role_code, "mayorista")


def user_response_extra(db: Session, user: models.User) -> dict:
    row = get_role_row(db, user.role)
    panel = resolve_panel(db, user.role)
    return {
        "role_label": row.label if row else user.role,
        "panel": panel,
        "panel_label": PANEL_LABELS.get(panel, panel),
    }


def list_roles_for_master(db: Session) -> list[models.AppRole]:
    return db.query(models.AppRole).order_by(models.AppRole.is_system.desc(), models.AppRole.label).all()


def list_assignable_roles(db: Session) -> list[models.AppRole]:
    return (
        db.query(models.AppRole)
        .filter(
            models.AppRole.can_assign == True,
            models.AppRole.is_hidden == False,
            models.AppRole.is_enabled == True,
        )
        .order_by(models.AppRole.label)
        .all()
    )


# Cuentas de operación en planta: no son usuarios del panel de administración
NON_PANEL_USER_ROLES = frozenset(
    {
        models.UserRole.CARNICERO.value,
        models.UserRole.SEDE_BUTCHER.value,
        models.UserRole.MASTER.value,
    }
)


def excluded_role_codes_for_user_list(db: Session) -> frozenset[str]:
    """Códigos de rol que no deben aparecer en GET /users (comparación en minúsculas)."""
    codes = set(NON_PANEL_USER_ROLES)
    try:
        rows = (
            db.query(models.AppRole.code)
            .filter((models.AppRole.is_hidden == True) | (models.AppRole.panel == "sede"))
            .all()
        )
        codes.update(r[0] for r in rows if r[0])
    except Exception:
        pass
    return frozenset(normalize_role_code(c) for c in codes if c)


def role_is_excluded_from_user_list(db: Session, role_code: str | None) -> bool:
    if not role_code:
        return False
    return normalize_role_code(role_code) in excluded_role_codes_for_user_list(db)
