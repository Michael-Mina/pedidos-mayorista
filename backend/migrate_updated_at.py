import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASS", "password")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "supertiendas_db")

def migrate():
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASS,
            host=DB_HOST,
            port=DB_PORT
        )
        cur = conn.cursor()
        
        # Add updated_at column if it does not exist
        cur.execute("""
            ALTER TABLE pedidos 
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
        """)
        
        # Populate existing rows if they are null (though default should handle it)
        cur.execute("UPDATE pedidos SET updated_at = timestamp WHERE updated_at IS NULL;")
        
        conn.commit()
        cur.close()
        conn.close()
        print("Migración completada con éxito.")
    except Exception as e:
        print(f"Error en la migración: {e}")

if __name__ == "__main__":
    migrate()
