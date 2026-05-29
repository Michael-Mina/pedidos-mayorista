"""Migración: tabla app_roles y users.role como VARCHAR. Ejecutar una vez en producción."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text

from app.database import engine, SessionLocal
from app import role_catalog


def main():
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS app_roles (
                    id SERIAL PRIMARY KEY,
                    code VARCHAR(48) UNIQUE NOT NULL,
                    label VARCHAR(120) NOT NULL,
                    panel VARCHAR(24) NOT NULL DEFAULT 'mayorista',
                    is_system BOOLEAN DEFAULT FALSE,
                    is_hidden BOOLEAN DEFAULT FALSE,
                    can_assign BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                """
            )
        )
        try:
            conn.execute(
                text("ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(48) USING role::text;")
            )
        except Exception as exc:
            print(f"Aviso ALTER users.role (puede ya ser VARCHAR): {exc}")

    db = SessionLocal()
    try:
        role_catalog.seed_builtin_roles(db)
        print("Roles del sistema sembrados.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
