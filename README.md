# Gestión de Pedidos - Supertiendas Cañaveral

Este proyecto es una aplicación full-stack diseñada para la gestión de pedidos de carnicería en tiempo real para Supertiendas Cañaveral.

## Estructura del Proyecto

- `backend/`: API FastAPI con SQLAlchemy y WebSockets (Socket.IO).
- `frontend/`: Aplicación React + Vite con estilos CSS puros.
- `init_db.sql`: Script de inicialización de base de datos SQL.

## Documentación de Configuración

Para obtener instrucciones detalladas sobre la instalación, configuración del entorno y ejecución:

👉 **[Ver GUÍA DE CONFIGURACIÓN (README_SETUP.md)](./README_SETUP.md)**

## Recreación e Instalación de la Base de Datos

Si necesitas instalar el proyecto en un equipo nuevo o limpiar la base de datos actual, sigue estos pasos:

### 1. Requisitos Previos
- Tener instalado **PostgreSQL**.
- Asegurarse de que el servicio de PostgreSQL esté corriendo.

### 2. Crear la Base de Datos (Manual)
Desde una terminal o herramienta como pgAdmin, ejecuta:
```sql
CREATE DATABASE supertiendas_db;
```

### 3. Configurar Variables de Entorno
Copia el archivo `.env.example` a un nuevo archivo llamado `.env` en la raíz (y asegúrate de que también esté configurado en `backend/.env` si es necesario):
```bash
cp .env.example .env
```
Edita el archivo `.env` con tus credenciales locales de PostgreSQL (`DB_USER`, `DB_PASS`, `DB_HOST`, etc.).

### 4. Inicialización con Scripts
Una vez configurado el acceso, usa los scripts integrados para construir el esquema y cargar datos iniciales:

1.  **Activar el entorno virtual:**
    ```bash
    # Windows
    backend\venv\Scripts\activate
    ```
2.  **Construir/Reiniciar Esquema (Tablas):**
    ```bash
    python backend/reset_db.py
    ```
3.  **Cargar Datos de Prueba:**
    ```bash
    python backend/setup_initial_data.py
    ```

### 5. Documentación Adicional
Para más detalles sobre la configuración del backend, frontend y solución de problemas, consulta la:
👉 **[GUÍA COMPLETA DE CONFIGURACIÓN (README_SETUP.md)](./README_SETUP.md)**

## Licencia
Propiedad de Supertiendas Cañaveral.
