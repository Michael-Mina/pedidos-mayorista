from app.database import SessionLocal
from app import models, auth, crud

def create_initial_users():
    db = SessionLocal()
    try:
        # Check if users exist
        users = [
            {"username": "admin1", "role": models.UserRole.ADMIN, "password": "12345678", "sede_id": 1},
            {"username": "mayorista1", "role": models.UserRole.MAYORISTA, "password": "12345678", "sede_id": 1},
            {"username": "carnicero1", "role": models.UserRole.CARNICERO, "password": "12345678", "sede_id": 1},
        ]

        for u in users:
            db_user = crud.get_user_by_username(db, username=u["username"])
            if not db_user:
                print(f"Creating user: {u['username']}")
                hashed_password = auth.get_password_hash(u["password"])
                new_user = models.User(
                    username=u["username"],
                    role=u["role"],
                    password_hash=hashed_password,
                    sede_id=u["sede_id"]
                )
                db.add(new_user)
        
        db.commit()
        print("Initial users created successfully.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_initial_users()
