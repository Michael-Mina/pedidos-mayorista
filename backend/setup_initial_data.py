from app.database import SessionLocal
from app import models, auth

db = SessionLocal()
try:
    # 1. Ensure Sede exists
    sede = db.query(models.Sede).first()
    if not sede:
        sede = models.Sede(nombre="Sede Central", ciudad="Bogota")
        db.add(sede)
        db.commit()
        db.refresh(sede)
    
    # 2. Ensure Category exists
    cat = db.query(models.Categoria).first()
    if not cat:
        cat = models.Categoria(nombre="Res")
        db.add(cat)
        db.commit()
        db.refresh(cat)
    
    # 3. Ensure Corte exists
    corte = db.query(models.Corte).first()
    if not corte:
        corte = models.Corte(nombre="Lomo", categoria_id=cat.id)
        db.add(corte)
        db.commit()
        db.refresh(corte)
    
    # 4. Ensure TiposCorte exist
    if db.query(models.TipoCorte).count() == 0:
        for tname in ["Mariposa", "Delgado", "Grueso"]:
            db.add(models.TipoCorte(nombre=tname))
        db.commit()

    # 5. Ensure Mayorista User exists
    muser = db.query(models.User).filter(models.User.role == "mayorista").first()
    if not muser:
        muser = models.User(
            username="mayorista_test",
            role="mayorista",
            sede_id=sede.id,
            password_hash=auth.get_password_hash("test123")
        )
        db.add(muser)
        db.commit()
    
    print("Initial data setup complete.")
    print(f"Mayorista: mayorista_test / test123")
    print(f"Sede ID: {sede.id}")
    print(f"Category ID: {cat.id}")

except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
