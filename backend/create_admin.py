import sys
import os

# Set up path to import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import engine, Base, SessionLocal
from app import models
from app.auth import get_password_hash

def create_initial_data():
    db = SessionLocal()
    try:
        # 1. Check or Create Sede Central
        existing_sede = db.query(models.Sede).filter(models.Sede.id == "001").first()
        if not existing_sede:
            print("Creating Sede Central...")
            sede = models.Sede(
                id="001",
                nombre="Sede Central",
                ciudad="General"
            )
            db.add(sede)
            db.commit()
            print("Sede '001 - Sede Central' created.")
        else:
            print("Sede '001' already exists. Skipping creation.")

        # 2. Check or Create Admin User
        target_username = "admin1"
        existing_user = db.query(models.User).filter(models.User.username == target_username).first()
        
        if not existing_user:
            print(f"Creating User '{target_username}'...")
            admin_user = models.User(
                username=target_username,
                password_hash=get_password_hash("12345678"),
                role=models.UserRole.ADMIN,
                sede_id="001",
                session_active=1,
                session_approved=1
            )
            db.add(admin_user)
            db.commit()
            print(f"User '{target_username}' created successfully.")
        else:
            print(f"User '{target_username}' already exists. Updating password...")
            existing_user.password_hash = get_password_hash("12345678")
            db.commit()
            print(f"User '{target_username}' password updated.")
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_initial_data()
