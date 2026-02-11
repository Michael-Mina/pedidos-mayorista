"""
Database migration script to add butcher_availability table
Run this script to add the new table for daily butcher availability management
"""

from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./test.db")
engine = create_engine(DATABASE_URL)

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS butcher_availability (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    butcher_id INTEGER NOT NULL,
    sede_id VARCHAR NOT NULL,
    date DATE NOT NULL,
    is_available BOOLEAN DEFAULT 1,
    set_by_manager_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (butcher_id) REFERENCES users(id),
    FOREIGN KEY (sede_id) REFERENCES sedes(id),
    FOREIGN KEY (set_by_manager_id) REFERENCES users(id),
    UNIQUE (butcher_id, date)
);
"""

if __name__ == "__main__":
    print("Creating butcher_availability table...")
    with engine.connect() as conn:
        conn.execute(text(CREATE_TABLE_SQL))
        conn.commit()
    print("✅ Table created successfully!")

