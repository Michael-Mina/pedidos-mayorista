from app.database import SessionLocal
from app import models

db = SessionLocal()
try:
    print(f"Users: {db.query(models.User).count()}")
    print(f"Sedes: {db.query(models.Sede).count()}")
    print(f"Categories: {db.query(models.Categoria).count()}")
    print(f"Cortes: {db.query(models.Corte).count()}")
    print(f"Pedidos: {db.query(models.Pedido).count()}")
    print(f"TipoCortes: {db.query(models.TipoCorte).count()}")
except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
