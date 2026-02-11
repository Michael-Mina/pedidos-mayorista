# Configuración de Supertiendas Cañaveral - Gestión de Pedidos

Este proyecto es una aplicación full-stack para la gestión de pedidos de carnicería en tiempo real.

## Requisitos Previos

- Python 3.9+
- Node.js 18+
- PostgreSQL

## Configuración de la Base de Datos (PostgreSQL en Windows)

> [!NOTE]
> **CONFIGURACIÓN AUTOMATIZADA COMPLETADA**: La base de datos `supertiendas_db` ya ha sido creada e inicializada con todas las tablas y datos necesarios. Ya se ha configurado el archivo `.env` con las credenciales correspondientes.

Si necesitas recrear la base de datos manualmente:
1. ... (continuación de pasos anteriores como referencia)

## Configuración del Backend (Python)

1. **Crear entorno virtual:**
   ```bash
   cd backend
   python -m venv venv
   ```

2. **Activar entorno virtual:**
   - Windows: `venv\Scripts\activate`
   - Linux/Mac: `source venv/bin/activate`

3. **Instalar dependencias:**
   ```bash
   pip install fastapi uvicorn sqlalchemy psycopg2-binary python-dotenv python-jose[cryptography] passlib[bcrypt] python-multipart fastapi-socketio
   ```

4. **Variables de Entorno:**
   Copia el archivo `.env.example` de la raíz a un nuevo archivo `.env` en la carpeta `backend` (o raíz) y configura tus credenciales de PostgreSQL.

5. **Migraciones / Creación de Base de Datos:**
   El sistema está configurado para crear las tablas automáticamente al iniciar si se utiliza SQLAlchemy `create_all`.

## Configuración del Frontend (React + Vite)

1. **Instalar dependencias:**
   ```bash
   cd frontend
   npm install
   ```

2. **Iniciar servidor de desarrollo:**
   ```bash
   npm run dev
   ```

## Ejecución del Proyecto

1. **Backend:**
   ```bash
   uvicorn app.main:app --reload
   ```

2. **Frontend:**
   Ya estará corriendo con el comando anterior en `http://localhost:5173`.

---

## Comunicación en Tiempo Real
El proyecto utiliza WebSockets para notificar cambios de estado en los pedidos:
- **Evento `new_order`**: Emitido cuando un mayorista crea un pedido.
- **Evento `order_update`**: Emitido cuando el estado de un pedido cambia.
