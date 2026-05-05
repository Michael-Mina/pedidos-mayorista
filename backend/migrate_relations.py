import os
import sys

# Agrega la ruta de la aplicación para poder importar los módulos
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine
from app.models import Base

print("Actualizando base de datos para incluir nueva tabla de asociación...")
try:
    Base.metadata.create_all(bind=engine)
    print("¡Base de datos actualizada correctamente!")
except Exception as e:
    print(f"Error al actualizar: {e}")
