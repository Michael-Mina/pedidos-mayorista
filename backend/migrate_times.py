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
        
        # Add columns if they do not exist
        cur.execute("""
            ALTER TABLE pedidos 
            ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP WITH TIME ZONE;
        """)
        
        conn.commit()
        cur.close()
        conn.close()
        print("Migración de tiempos (started_at, finished_at) completada con éxito.")
    except Exception as e:
        print(f"Error en la migración: {e}")

if __name__ == "__main__":
    migrate()
