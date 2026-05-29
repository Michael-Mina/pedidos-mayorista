"""Crea o actualiza el usuario master en producción (Shell de Render)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.startup_seed import MASTER_PASS, MASTER_USER, ensure_master_user


if __name__ == "__main__":
    ensure_master_user()
    print(f"Usuario master listo: {MASTER_USER} / {MASTER_PASS}")
