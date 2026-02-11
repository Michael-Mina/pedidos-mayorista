from app.database import SessionLocal
from app import models, schemas, crud

db = SessionLocal()
try:
    # Try to get first category
    cat = db.query(models.Categoria).first()
    if not cat:
        print("Error: No categories found. Please create a category first.")
    else:
        print(f"Using category: {cat.nombre} (ID: {cat.id})")
        corte_data = schemas.CorteBase(
            nombre="Test Corte",
            categoria_id=cat.id,
            imagen_url="http://example.com/image.jpg"
        )
        new_corte = crud.create_corte(db, corte_data)
        print(f"Successfully created corte: {new_corte.nombre}")
except Exception as e:
    print(f"Error creating corte: {e}")
finally:
    db.close()
