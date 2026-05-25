# Gestión de pedidos — Supertiendas Cañaveral

Sistema web para **pedidos de carnicería en tiempo real**: el mayorista arma pedidos por sede, la carnicería los prepara y el jefe de carnes/admin los supervisa. Incluye notificaciones en vivo (WebSockets), catálogo de cortes con imágenes en el servidor y numeración de pedidos por sede.

## Documentación formal (Word)

| Documento | Descripción |
|-----------|-------------|
| **[docs/DOC-PEDIDOS-MAYORISTA-001-Documentacion-Completa.docx](docs/DOC-PEDIDOS-MAYORISTA-001-Documentacion-Completa.docx)** | Documentación completa en Word: requisitos, arquitectura, API, WebSockets, ISO, Ley 1581, tablas y brechas |

Regenerar el Word: `python docs/scripts/generar_documentacion_word.py` (requiere `pip install python-docx`).

---

## Contenido

1. [Roles y pantallas](#roles-y-pantallas)
2. [Stack técnico](#stack-técnico)
3. [Requisitos](#requisitos)
4. [Inicio rápido (desarrollo local)](#inicio-rápido-desarrollo-local)
5. [Variables de entorno](#variables-de-entorno)
6. [Estructura del proyecto](#estructura-del-proyecto)
7. [Comportamiento del negocio](#comportamiento-del-negocio)
8. [Seguridad](#seguridad)
9. [Scripts útiles](#scripts-útiles)
10. [Base de datos](#base-de-datos)
11. [Problemas frecuentes](#problemas-frecuentes)

---

## Roles y pantallas

| Rol (`user.role`) | Ruta | Qué hace |
|-------------------|------|----------|
| `mayorista` | `/mayorista` | Crea pedidos, elige cortes, ve historial de su sede |
| `sede_butcher` / `carnicero` | `/sede` | Recibe pedidos, asigna carnicero, marca en proceso / finalizado |
| `jefe_carnes` | `/jefe` | Monitor de pedidos, historial, disponibilidad de personal |
| `admin` | `/admin` | Usuarios, sedes, productos, categorías, estadísticas |

Tras el login, la app redirige automáticamente según el rol.

**Usuario de prueba** (si ejecutaste `setup_initial_data.py`):

- Usuario: `mayorista_test`
- Contraseña: `test123`

Para crear un administrador: `python backend/create_admin.py`

---

## Stack técnico

| Capa | Tecnología |
|------|------------|
| Backend | FastAPI, SQLAlchemy, PostgreSQL |
| Tiempo real | Socket.IO (`fastapi-socketio`) |
| Frontend | React 19, Vite, React Router |
| Estilos | CSS Modules (diseño responsivo) |
| Auth | JWT + hash de contraseñas (Passlib PBKDF2) |

---

## Requisitos

- **Python** 3.9 o superior  
- **Node.js** 18 o superior  
- **PostgreSQL** 12+ (servicio en ejecución)  
- **npm** (incluido con Node)

---

## Inicio rápido (desarrollo local)

### 1. Clonar / abrir el proyecto

```text
D:\Pedidos mayorista\
├── backend\      ← API
├── frontend\     ← interfaz web
└── .env.example  ← plantilla de configuración
```

### 2. Base de datos PostgreSQL

Crea la base (una sola vez), por ejemplo en pgAdmin o `psql`:

```sql
CREATE DATABASE supertiendas_db;
```

### 3. Variables de entorno

Copia la plantilla y edita usuario/contraseña de PostgreSQL:

```powershell
copy .env.example .env
copy .env.example backend\.env
```

El backend lee `backend/.env` (o variables del sistema). El frontend usa `frontend/.env` (ya trae `VITE_API_URL` y `VITE_WS_URL` apuntando a `http://localhost:8000`).

### 4. Backend (terminal 1)

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Primera vez o BD vacía — datos mínimos de prueba:

```powershell
python setup_initial_data.py
```

Arrancar API:

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Frontend (terminal 2)

```powershell
cd frontend
npm install
npm run dev
```

### URLs locales

| Servicio | URL |
|----------|-----|
| Aplicación web | http://localhost:5173 |
| API | http://localhost:8000 |
| Documentación API (Swagger) | http://localhost:8000/docs |

---

## Variables de entorno

Archivo de referencia: [.env.example](.env.example)

| Variable | Dónde | Descripción |
|----------|--------|-------------|
| `DB_HOST` | Backend | Host PostgreSQL (ej. `localhost`) |
| `DB_PORT` | Backend | Puerto (ej. `5432`) |
| `DB_NAME` | Backend | Nombre de BD (ej. `supertiendas_db`) |
| `DB_USER` / `DB_PASS` | Backend | Credenciales PostgreSQL |
| `SECRET_KEY` | Backend | Clave para firmar JWT (**cambiar en producción**) |
| `ALGORITHM` | Backend | Algoritmo JWT (por defecto `HS256`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Backend | Duración del token (ej. `480`) |
| `VITE_API_URL` | Frontend | URL del API (ej. `http://localhost:8000`) |
| `VITE_WS_URL` | Frontend | URL WebSocket (misma que el API en local) |
| `PUBLIC_API_URL` | Backend (opc.) | URL pública para enlaces de imágenes estáticas |

---

## Estructura del proyecto

```text
Pedidos mayorista/
├── backend/
│   ├── app/
│   │   ├── main.py           # Rutas API + Socket.IO + archivos estáticos
│   │   ├── models.py         # Tablas (usuarios, pedidos, cortes…)
│   │   ├── crud.py           # Lógica de negocio y numeración de pedidos
│   │   ├── auth.py           # Hash de contraseñas y JWT
│   │   └── catalogo_res.py   # Catálogo de cortes de res (servidor)
│   ├── static/cortes/res/    # Imágenes de productos servidas por /static/...
│   ├── setup_initial_data.py # Sede, categoría Res, usuario mayorista_test
│   ├── reset_db.py           # Borra y recrea tablas (¡destructivo!)
│   └── requirements.txt
├── frontend/
│   └── src/pages/            # Login, Mayorista, Sede, JefeCarnes, Admin
├── init_db.sql               # Esquema SQL alternativo (opcional)
└── README.md                 # Este archivo
```

---

## Comportamiento del negocio

### Numeración de pedidos

- Cada pedido tiene un **`numero_pedido`** visible (ej. `#12`).
- La secuencia es **por sede** y **no se reinicia cada día**: el siguiente número es el máximo histórico de esa sede + 1.
- Sedes distintas tienen contadores independientes.

### Catálogo de carnes (res)

- Los cortes viven en **PostgreSQL** (tablas `categorias` y `cortes`).
- Las imágenes se guardan en `backend/static/cortes/res/` y se exponen en `/static/cortes/res/...`.
- Al arrancar el API se sincroniza el catálogo definido en código (`app/catalogo_res.py`), sin depender de JSON local.

Para forzar imágenes y URLs en BD:

```powershell
cd backend
.\venv\Scripts\python.exe descargar_imagenes_res.py
```

### Tiempo real (WebSockets)

| Evento | Cuándo |
|--------|--------|
| `new_order` | Un mayorista crea un pedido |
| `order_update` | Cambia el estado de un pedido |
| `availability_update` | Cambia disponibilidad de carniceros (jefe de carnes) |

Las sedes se unen a la sala `sede_{id}` para recibir avisos de su punto de venta.

---

## Seguridad

- Las contraseñas **no se guardan en texto plano**.
- En base de datos se almacena **`password_hash`** (hash irreversible con **PBKDF2-SHA256** vía Passlib).
- El login compara con `verify_password`; no es posible “leer” la contraseña original desde la BD.
- Las sesiones usan **JWT**; configura un `SECRET_KEY` fuerte en producción.

---

## Scripts útiles

Ejecutar desde la carpeta `backend` con el venv activado:

| Script | Uso |
|--------|-----|
| `setup_initial_data.py` | Datos mínimos: sede, categoría, `mayorista_test` |
| `reset_db.py` | **Borra todas las tablas** y las recrea vacías |
| `create_admin.py` | Crear usuario administrador (interactivo) |
| `seed_cortes_res_servidor.py` | Insertar/actualizar cortes de res en BD |
| `descargar_imagenes_res.py` | Generar/descargar imágenes y actualizar URLs |
| `migrate_db.py` y otros `migrate_*.py` | Migraciones puntuales (solo si las necesitas) |

---

## Base de datos

### Creación automática al arrancar

Al iniciar uvicorn, FastAPI ejecuta `create_all`: crea tablas que falten según los modelos actuales.

### Reinicio completo (desarrollo)

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python reset_db.py
python setup_initial_data.py
```

### Alternativa con SQL manual

Ver `init_db.sql` o la sección histórica en [README_SETUP.md](README_SETUP.md) (misma información, formato extendido).

---

## Problemas frecuentes

**No conecta a PostgreSQL**

- Verifica que el servicio PostgreSQL esté activo.
- Revisa `DB_USER`, `DB_PASS`, `DB_PORT` y que exista la base `supertiendas_db`.

**El front no llega al API**

- Backend en `http://localhost:8000` (prueba `/docs`).
- `frontend/.env` debe tener `VITE_API_URL=http://localhost:8000`.
- Reinicia `npm run dev` después de cambiar `.env`.

**Login falla**

- Ejecuta `python setup_initial_data.py` o crea admin con `create_admin.py`.
- Confirma que el usuario no esté deshabilitado en BD.

**Imágenes de productos no se ven**

- Comprueba que el backend sirva estáticos: `http://localhost:8000/static/cortes/res/`.
- Ejecuta `descargar_imagenes_res.py` si faltan archivos en `backend/static/`.

**Puerto 8000 o 5173 ocupado**

- Cierra otras instancias del API o de Vite, o cambia el puerto en uvicorn / Vite.

---

## Licencia

Uso interno — Supertiendas Cañaveral.
