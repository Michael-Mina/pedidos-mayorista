# Configuración de Supertiendas Cañaveral - Gestión de Pedidos

Este proyecto es una aplicación full-stack para la gestión de pedidos de carnicería en tiempo real.

## Requisitos Previos

- Python 3.9+
- Node.js 18+
- PostgreSQL

## Configuración y Recreación de la Base de Datos (PostgreSQL)

> [!NOTE]
> La base de datos `supertiendas_db` ya ha sido creada e inicializada con todas las tablas y datos necesarios. Las credenciales están en el archivo `.env` en la raíz del proyecto.

Si necesitas recrear la base de datos desde cero (borrar todo y empezar de nuevo):

### Opción 1: Recreación Automatizada (Recomendada)

Este método utiliza SQLAlchemy para borrar y recrear el esquema basado en los modelos actuales de Python.

1. **Asegúrate de tener el entorno virtual activo:**
   - Windows: `backend\venv\Scripts\activate`
   - Linux/Mac: `source backend/venv/bin/activate`

2. **Ejecutar script de limpieza:**
   ```bash
   python backend/reset_db.py
   ```
   *Este comando borrará todas las tablas y las volverá a crear vacías.*

3. **Cargar datos iniciales (o de prueba):**
   ```bash
   python backend/setup_initial_data.py
   ```
   *Esto creará una sede central, categorías básicas y un usuario de prueba: `mayorista_test / test123`.*

### Opción 2: Recreación Manual (SQL)

Si prefieres usar SQL puro (via psql o pgAdmin):

1. **Eliminar y Crear base de datos:**
   ```sql
   DROP DATABASE IF EXISTS supertiendas_db;
   CREATE DATABASE supertiendas_db;
   ```

2. **Ejecutar el script de inicialización:**
   Importa o ejecuta el contenido de `init_db.sql` en la nueva base de datos.
   ```bash
   psql -U tu_usuario -d supertiendas_db -f init_db.sql
   ```

### Otros Scripts Útiles:
- `python backend/create_admin.py`: Crea un usuario administrador interactivo.
- `python backend/migrate_db.py`: Ejecuta migraciones menores (si se requiere).

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
