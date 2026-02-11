from sqlalchemy.orm import Session
from sqlalchemy import func
from . import models
import time

def update_popularity_scores(db: Session):
    """
    Recalculates popularity scores for all categories based on order frequency.
    This can be called periodically.
    """
    print("Recalculating popularity scores...")
    # Get total kg ordered per category
    stats = db.query(
        models.Corte.categoria_id,
        func.sum(models.DetallePedido.cantidad_kg).label('total')
    ).join(models.DetallePedido, models.Corte.id == models.DetallePedido.corte_id)\
     .group_by(models.Corte.categoria_id).all()
    
    for cat_id, total in stats:
        category = db.query(models.Categoria).filter(models.Categoria.id == cat_id).first()
        if category:
            category.popularidad_score = float(total)
    
    db.commit()
    print("Popularity scores updated.")

def popularity_background_task(SessionLocal):
    """
    Simple background loop to update popularity every hour (adjusted for demo).
    """
    while True:
        db = SessionLocal()
        try:
            update_popularity_scores(db)
        except Exception as e:
            print(f"Error updating popularity: {e}")
        finally:
            db.close()
        
        # In production, this would be daily or weekly. For this app, let's say every 10 mins.
        time.sleep(600) 
