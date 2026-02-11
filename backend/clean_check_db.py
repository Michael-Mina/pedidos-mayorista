from app.database import SessionLocal
from app import models

db = SessionLocal()
try:
    print("--- USERS ---")
    users = db.query(models.User).all()
    for u in users:
        print(f"ID: {u.id}, User: {u.username}, Role: {u.role}, SedeID: {u.sede_id}")
    
    print("\n--- SEDES ---")
    sedes = db.query(models.Sede).all()
    for s in sedes:
        print(f"ID: {s.id}, Name: {s.nombre}")

    print("\n--- CATEGORIES ---")
    cats = db.query(models.Categoria).all()
    for c in cats:
        print(f"ID: {c.id}, Name: {c.nombre}")

    print("\n--- CORTES ---")
    cortes = db.query(models.Corte).all()
    for c in cortes:
        print(f"ID: {c.id}, Name: {c.nombre}, CatID: {c.categoria_id}")

    print("\n--- TIPOS CORTE ---")
    tipos = db.query(models.TipoCorte).all()
    for t in tipos:
        print(f"ID: {t.id}, Name: {t.nombre}")

except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
