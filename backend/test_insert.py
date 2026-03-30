import sys, traceback
from app.database import SessionLocal
from app.models import Sede

db = SessionLocal()
s = Sede(nombre='Test3', ciudad='Test3')
db.add(s)
try:
    db.commit()
    print("Success")
except Exception as e:
    open('err.txt', 'w', encoding='utf-8').write(traceback.format_exc())
    print("Failed")
