import platform
from sqlalchemy import text
from app.database import engine

def add_columns():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN nombre VARCHAR"))
        except Exception as e: 
            print("nombre:", e)
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN apellido VARCHAR"))
        except Exception as e: 
            print("apellido:", e)
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN numero_carnicero VARCHAR"))
        except Exception as e: 
            print("numero:", e)
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_available BOOLEAN DEFAULT TRUE"))
        except Exception as e: 
            print("is_available:", e)
        conn.commit()
    print("Migrated database.")

if __name__ == "__main__":
    add_columns()
