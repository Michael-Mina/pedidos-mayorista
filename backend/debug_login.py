import traceback
from app.database import SessionLocal
from app import crud

db = SessionLocal()
try:
    user = crud.get_user_by_username(db, username="admin1")
    print("User found:", user.username if user else None)
except Exception as e:
    print("CRASH!")
    traceback.print_exc()
finally:
    db.close()
