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
    cat = (
        db.query(models.Categoria)
        .filter(models.Categoria.sede_id == sede.id, models.Categoria.nombre == "Res")
        .first()
    )
    if not cat:
        cat = models.Categoria(nombre="Res", sede_id=sede.id)
        db.add(cat)
        db.commit()
        db.refresh(cat)
    
    # 3. Ensure Corte exists
    corte = (
        db.query(models.Corte)
        .filter(models.Corte.sede_id == sede.id, models.Corte.nombre == "Lomo")
        .first()
    )
    if not corte:
        corte = models.Corte(nombre="Lomo", categoria_id=cat.id, sede_id=sede.id)
        db.add(corte)
        db.commit()
        db.refresh(corte)
    
    # 4. Ensure TiposCorte exist
    if (
        db.query(models.TipoCorte)
        .filter(models.TipoCorte.sede_id == sede.id)
        .count()
        == 0
    ):
        for tname in ["Mariposa", "Delgado", "Grueso"]:
            db.add(models.TipoCorte(nombre=tname, sede_id=sede.id))
        db.commit()

    # 5. Usuario mayorista de prueba (siempre idempotente por username)
    demo_user = "mayorista_test"
    muser = db.query(models.User).filter(models.User.username == demo_user).first()
    demo_hash = auth.get_password_hash("test123")
    if not muser:
        muser = models.User(
            username=demo_user,
            role=models.UserRole.MAYORISTA,
            sede_id=sede.id,
            password_hash=demo_hash,
        )
        db.add(muser)
    else:
        muser.password_hash = demo_hash
        muser.sede_id = sede.id
    db.commit()

    # 6. Usuario administrador
    admin_user = "admin1"
    auser = db.query(models.User).filter(models.User.username == admin_user).first()
    admin_hash = auth.get_password_hash("12345678")
    if not auser:
        auser = models.User(
            username=admin_user,
            role=models.UserRole.ADMIN,
            sede_id=sede.id,
            password_hash=admin_hash,
            session_active=1,
            session_approved=1,
        )
        db.add(auser)
    else:
        auser.password_hash = admin_hash
        auser.role = models.UserRole.ADMIN
        auser.sede_id = sede.id
    db.commit()

    print("Initial data setup complete.")
    print(f"Mayorista: {demo_user} / test123")
    print(f"Admin: {admin_user} / 12345678")
    print(f"Sede ID: {sede.id}")
    print(f"Category ID: {cat.id}")

except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
