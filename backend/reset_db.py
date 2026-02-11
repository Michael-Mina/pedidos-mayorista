import sys
import os

# Set up path to import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import engine, Base
from app import models

def reset_database():
    print("Resetting database...")
    try:
        # Drop all tables
        print("Dropping all tables...")
        Base.metadata.drop_all(bind=engine)
        print("Tables dropped.")

        # Create all tables
        print("Creating all tables...")
        Base.metadata.create_all(bind=engine)
        print("Database schema updated successfully!")
    except Exception as e:
        print(f"Error resetting database: {e}")

if __name__ == "__main__":
    reset_database()
