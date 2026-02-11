from app.database import SessionLocal
from app import models

db = SessionLocal()
try:
    users = db.query(models.User).all()
    for u in users:
        print(f"User: {u.username}, Role: {u.role}, SedeID: {u.sede_id}")
except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
