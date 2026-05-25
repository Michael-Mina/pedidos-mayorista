import os
import sys
from collections import defaultdict
from datetime import datetime, timezone

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import Pedido


def migrate_numeros_pedido():
    db = SessionLocal()
    try:
        pedidos = db.query(Pedido).order_by(Pedido.timestamp.asc(), Pedido.id.asc()).all()
        seq_tracker = defaultdict(int)

        for pedido in pedidos:
            date_obj = pedido.timestamp or datetime.now(timezone.utc)
            date_str = date_obj.astimezone(timezone.utc).strftime("%Y%m%d")
            sede_id = int(pedido.sede_id) if pedido.sede_id else 1

            tracker_key = f"{sede_id}-{date_str}"
            seq_tracker[tracker_key] += 1
            pedido.numero_pedido = str(seq_tracker[tracker_key])
            print(f"Asignando #{pedido.numero_pedido} al pedido ID {pedido.id} (sede {sede_id})")

        db.commit()
        print("Migración completada exitosamente.")
    except Exception as e:
        db.rollback()
        print(f"Error durante la migración: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    migrate_numeros_pedido()
