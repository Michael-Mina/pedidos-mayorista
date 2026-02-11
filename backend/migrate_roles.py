from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")
if not DB_URL:
    # Try constructing from parts if DATABASE_URL is not set
    DB_USER = os.getenv("DB_USER", "postgres")
    DB_PASS = os.getenv("DB_PASS", "postgres")
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = os.getenv("DB_PORT", "5432")
    DB_NAME = os.getenv("DB_NAME", "pedidos_db")
    DB_URL = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(DB_URL)

with engine.connect() as conn:
    print("Adding session_approved column...")
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN session_approved INTEGER DEFAULT 1;"))
    except Exception as e:
        print(f"session_approved error: {e}")
        
    print("Adding session_active column...")
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN session_active INTEGER DEFAULT 0;"))
    except Exception as e:
        print(f"session_active error: {e}")
    
    conn.commit()
    print("Done.")
