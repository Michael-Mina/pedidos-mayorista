# Gestión de Pedidos - Supertiendas Cañaveral

Este proyecto es una aplicación full-stack diseñada para la gestión de pedidos de carnicería en tiempo real para Supertiendas Cañaveral.

## Estructura del Proyecto

- `backend/`: API FastAPI con SQLAlchemy y WebSockets (Socket.IO).
- `frontend/`: Aplicación React + Vite con estilos CSS puros.
- `init_db.sql`: Script de inicialización de base de datos SQL.

## Documentación de Configuración

Para obtener instrucciones detalladas sobre la instalación, configuración del entorno y ejecución:

👉 **[Ver GUÍA DE CONFIGURACIÓN (README_SETUP.md)](./README_SETUP.md)**

## Recreación de la Base de Datos

Si necesitas limpiar y recrear la base de datos de manera rápida, sigue estos pasos:

1. **Activar el entorno virtual:**
   ```bash
   # Windows
   backend\venv\Scripts\activate
   ```

2. **Borrar y Recrear tablas:**
   ```bash
   python backend/reset_db.py
   ```

3. **Cargar datos iniciales:**
   ```bash
   python backend/setup_initial_data.py
   ```

Para más detalles, consulta la sección "Configuración y Recreación" en el [README_SETUP.md](./README_SETUP.md).

## Licencia
Propiedad de Supertiendas Cañaveral.
