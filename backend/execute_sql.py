import os
from sqlalchemy import text
from app.database import engine

print("Dropping public schema...")

with engine.connect() as conn:
    trans = conn.begin()
    try:
        conn.execute(text("DROP SCHEMA public CASCADE;"))
        conn.execute(text("CREATE SCHEMA public;"))
        trans.commit()
        print("Schema dropped and recreated.")
    except Exception as e:
        trans.rollback()
        print(f"Error recreating schema: {e}")

print("Executing init_db.sql...")
init_sql_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "init_db.sql")
with open(init_sql_path, "r", encoding="utf-8") as f:
    sql = f.read()

with engine.connect() as conn:
    trans = conn.begin()
    try:
        conn.execute(text(sql))
        trans.commit()
        print("init_db.sql executed successfully.")
    except Exception as e:
        trans.rollback()
        print(f"Error executing SQL: {e}")
