# Pedidos Mayorista

Sistema web para **pedidos de carnicería en tiempo real**: el mayorista arma pedidos por sede, la carnicería los prepara y el jefe de carnes/admin los supervisa. Incluye notificaciones en vivo (WebSockets), catálogo de cortes con imágenes en el servidor y numeración de pedidos por sede.

## Documentación formal (Word)

| Documento | Descripción |
|-----------|-------------|
| **[docs/DOC-PEDIDOS-MAYORISTA-001-Documentacion-Completa.docx](docs/DOC-PEDIDOS-MAYORISTA-001-Documentacion-Completa.docx)** | Documentación completa en Word: requisitos, arquitectura, API, WebSockets, ISO, Ley 1581, tablas y brechas |

Regenerar el Word: `python docs/scripts/generar_documentacion_word.py` (requiere `pip install python-docx`).

## Despliegue en Render (producción)

Guía paso a paso: **[docs/RENDER.md](docs/RENDER.md)**  
Blueprint en la raíz: **`render.yaml`** (API + frontend estático + PostgreSQL).

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
    - [Rearmar la base en otro equipo o servidor](#rearmar-la-base-en-otro-equipo-o-servidor)
11. [Problemas frecuentes](#problemas-frecuentes)

---

## Roles y pantallas

| Rol (`user.role`) | Ruta | Qué hace |
|-------------------|------|----------|
| `mayorista` | `/mayorista` | Crea pedidos, elige cortes, ve historial de su sede |
| `sede_butcher` / `carnicero` | `/sede` | Recibe pedidos, asigna carnicero, marca en proceso / finalizado |
| `jefe_carnes` | `/jefe` | Monitor de pedidos, historial, disponibilidad de personal |
| `admin` | `/admin` | Usuarios, sedes, productos, estadísticas filtrables y respaldo |

Tras el login, la app redirige automáticamente según el rol.

**Usuarios de prueba** (si ejecutaste `setup_initial_data.py` o `SEED_ON_STARTUP=true` en Render):

| Rol | Usuario | Contraseña | Ruta |
|-----|---------|------------|------|
| Mayorista | `mayorista_test` | `test123` | `/mayorista` |
| Admin | `admin1` | `12345678` | `/admin` |

Scripts: `python setup_initial_data.py` o `python create_admin.py` (desde `backend/`).

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
python reset_db.py
python setup_initial_data.py
python create_master.py
```

> Para migrar datos desde otro servidor o rearmar la BD en otro equipo, ver [Rearmar la base en otro equipo o servidor](#rearmar-la-base-en-otro-equipo-o-servidor).

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
| `BACKUP_DIR` | Backend (opc.) | Carpeta de respaldos por script (default: `backups/`) |
| `BACKUP_RETENTION_DAYS` | Backend (opc.) | Días de retención de carpetas `backup_*` (default: `30`) |
| `PG_DUMP_PATH` | Backend (opc.) | Ruta a `pg_dump` si no está en PATH |

---

## Estructura del proyecto

```text
Pedidos mayorista/
├── backend/
│   ├── app/
│   │   ├── main.py           # Rutas API + Socket.IO + /admin/backup/*
│   │   ├── models.py         # Tablas (usuarios, pedidos, cortes…)
│   │   ├── crud.py           # Lógica de negocio y numeración de pedidos
│   │   ├── auth.py           # JWT + require_admin
│   │   ├── backup.py         # pg_dump, ZIP, restauración
│   │   └── catalogo_res.py   # Catálogo de cortes de res (servidor)
│   ├── static/cortes/res/    # Imágenes de productos servidas por /static/...
│   ├── backup_db.py          # CLI: crear respaldo en backups/
│   ├── restore_db.py         # CLI: restaurar desde backups/
│   ├── setup_initial_data.py # Sede, categoría Res, usuario mayorista_test
│   ├── reset_db.py           # Borra y recrea tablas (¡destructivo!)
│   └── requirements.txt
├── backups/                  # Respaldos locales (ignorado por Git)
├── frontend/
│   └── src/pages/            # Login, Mayorista, Sede, JefeCarnes, Admin (+ pestaña Respaldo)
├── docs/BACKUP.md            # Guía de respaldo y restauración
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

### Panel Admin — estadísticas y respaldo

En **Admin → Panel de Control**, el resumen admite filtros combinables:

| Filtro | Opciones |
|--------|----------|
| **Periodo** | Todo el tiempo, hoy, últimos 7/30 días, este mes, **personalizado (desde / hasta)** |
| **Comparar sedes** | **Todas las sedes** o **sedes específicas** (una o varias con casillas) |

- **Todas las sedes:** gráfico de pedidos por sede en el periodo elegido.
- **Una sede específica:** gráfico por estado (pendiente, en proceso, finalizado).
- **Varias sedes:** gráfico comparando pedidos entre las sedes seleccionadas.

API de estadísticas (parámetros opcionales `date_from`, `date_to` en `YYYY-MM-DD`; `sede_ids` repetible o `sede_id` para una sede):

- `GET /stats/orders-by-sede`
- `GET /stats/top-cuts`
- `GET /stats/orders-by-estado?sede_id=…` (solo con una sede)

En **Admin → Respaldo** se descarga un ZIP de la base de datos y archivos estáticos (ver [docs/BACKUP.md](docs/BACKUP.md)).

En **Admin → Panel → Excel** se descarga un reporte profesional (`.xlsx`) con los mismos filtros del dashboard: hoja *Dashboard* (KPIs, gráficos de barras y torta), *Detalle pedidos* (tabla) y *Filtros* (metadatos).

Endpoint: `GET /admin/report/excel` (solo admin; parámetros `date_from`, `date_to`, `sede_ids`, `period_label`, `sede_label`).

---

## Seguridad

- Las contraseñas **no se guardan en texto plano**.
- En base de datos se almacena **`password_hash`** (hash irreversible con **PBKDF2-SHA256** vía Passlib).
- El login compara con `verify_password`; no es posible “leer” la contraseña original desde la BD.
- Las sesiones usan **JWT**; configura un `SECRET_KEY` fuerte en producción.
- La descarga de respaldos (`/admin/backup/*`) exige rol **admin** y token Bearer.

### Respaldo de datos

- **Admin → Respaldo:** descarga un ZIP (estructura BD + datos + imágenes).
- **Admin → Panel → Excel:** reporte `.xlsx` con KPIs, tablas, gráficos y detalle de pedidos según filtros activos.
- **Terminal:** `python backup_db.py` / `python restore_db.py` (ver [docs/BACKUP.md](docs/BACKUP.md)).

---

## Scripts útiles

Ejecutar desde la carpeta `backend` con el venv activado:

| Script | Uso |
|--------|-----|
| `setup_initial_data.py` | Datos mínimos: sede, categoría, tipos de corte, `mayorista_test`, `admin1` |
| `create_master.py` | Usuario master (`master` / contraseña en `.env`) |
| `reset_db.py` | **Borra todas las tablas** y las recrea vacías |
| `create_admin.py` | Crear usuario administrador (interactivo) |
| `seed_cortes_res_servidor.py` | Insertar/actualizar cortes de res en BD |
| `descargar_imagenes_res.py` | Generar/descargar imágenes y actualizar URLs |
| `migrate_db.py` y otros `migrate_*.py` | Migraciones puntuales (solo si las necesitas) |
| `backup_db.py` | Respaldo de estructura BD, datos e imágenes estáticas |
| `restore_db.py` | Restaurar desde una carpeta en `backups/` |

Guía completa: [docs/BACKUP.md](docs/BACKUP.md). Desde el panel **Admin → Respaldo** puede descargar el ZIP sin usar la terminal.

---

## Base de datos

### Creación automática al arrancar

Al iniciar uvicorn, FastAPI ejecuta `create_all`: crea tablas que falten según los modelos actuales. No inserta usuarios ni catálogo por sí solo.

### Reinicio completo (mismo equipo, desarrollo)

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python reset_db.py
python setup_initial_data.py
python create_master.py
```

En Linux/macOS:

```bash
cd backend
source venv/bin/activate
python reset_db.py
python setup_initial_data.py
python create_master.py
```

Luego arranca el API una vez para que sincronice el catálogo de res (`catalogo_res.py`):

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

### Rearmar la base en otro equipo o servidor

Usa esta guía cuando clones el proyecto en **otro PC**, cambies de servidor PostgreSQL o migres desde **producción (Render)** a **local** (o al revés).

#### Requisitos previos en el destino

1. **PostgreSQL** instalado y en ejecución (12 o superior).
2. **Python 3.9+** con el venv del backend (`pip install -r requirements.txt`).
3. Archivo **`backend/.env`** apuntando al PostgreSQL **del nuevo lugar**:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=supertiendas_db
DB_USER=postgres
DB_PASS=tu_contraseña
SECRET_KEY=una_clave_larga_y_unica
```

En Render u otro hosting, suele bastar con `DATABASE_URL` (el backend la prioriza sobre `DB_*`).

4. Herramientas cliente PostgreSQL (`psql`, `pg_dump`) en PATH o en `.env`:

```env
PG_DUMP_PATH=C:\Program Files\PostgreSQL\17\bin
```

---

#### Opción A — Base vacía con datos de prueba (instalación nueva)

Para un entorno de desarrollo o demo **sin** copiar pedidos ni usuarios reales.

**1. Crear la base de datos** (una sola vez), en pgAdmin o `psql`:

```sql
CREATE DATABASE supertiendas_db;
```

Windows (si `psql` no está en PATH):

```powershell
$env:PGPASSWORD='tu_contraseña'
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE supertiendas_db;"
```

**2. Crear tablas y datos mínimos** (desde `backend/` con venv activado):

```powershell
python reset_db.py
python setup_initial_data.py
python create_master.py
```

**3. Arrancar el API** (sincroniza catálogo de res e imágenes en BD):

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Usuarios creados:**

| Rol | Usuario | Contraseña |
|-----|---------|------------|
| Mayorista | `mayorista_test` | `test123` |
| Admin | `admin1` | `12345678` |
| Master | `master` | `Master@2026Pedidos` (o `MASTER_USERNAME` / `MASTER_PASSWORD` en `.env`) |

Opcional — forzar descarga de imágenes de productos:

```powershell
python descargar_imagenes_res.py
```

---

#### Opción B — Copiar datos reales desde otro servidor (respaldo)

Para **migrar** sedes, usuarios, pedidos, catálogo e imágenes tal como estaban.

**En el servidor de origen**

1. **Panel Admin → Respaldo** → descargar ZIP, **o**
2. Terminal en `backend/`:

```powershell
python backup_db.py
```

El respaldo queda en `backups/backup_YYYYMMDD_HHMMSS/` (o un ZIP si lo descargaste desde Admin).

**En el equipo o servidor de destino**

1. Clona el repo e instala dependencias del backend (ver [Inicio rápido](#inicio-rápido-desarrollo-local)).
2. Configura `backend/.env` con la conexión al PostgreSQL **nuevo**.
3. Crea la base vacía si no existe:

```sql
CREATE DATABASE supertiendas_db;
```

4. Copia la carpeta del respaldo (o descomprime el ZIP) al destino. Debe contener `manifest.json`, `schema.sql`, `data.sql` y opcionalmente `static.zip`.
5. Restaura (desde `backend/`):

```powershell
python restore_db.py --list
python restore_db.py "D:\ruta\al\respaldo" --drop-schema -y
```

Si descomprimiste un ZIP de Admin, apunta a la carpeta que **contiene** `manifest.json` (a veces hay una subcarpeta dentro del ZIP).

6. Arranca el API y el frontend. Los usuarios y contraseñas serán los del servidor de origen.

Guía detallada: [docs/BACKUP.md](docs/BACKUP.md).

---

#### Opción C — Render (producción) u otro hosting

**Base nueva en Render**

1. Crea el servicio PostgreSQL en Render y enlázalo al API (`DATABASE_URL` se inyecta solo).
2. Despliega el API; al arrancar se crean las tablas (`create_all`).
3. En el **Shell** del servicio API:

```bash
python setup_initial_data.py
python create_master.py
```

O define `SEED_ON_STARTUP=true` en variables de entorno y redeploy (crea `mayorista_test`, `admin1` y actualiza contraseñas al arrancar).

**Traer datos de Render a tu PC**

1. En Render → PostgreSQL → copia **External Database URL**.
2. Pégala en `backend/.env` como `DATABASE_URL=...` (temporalmente).
3. Ejecuta `python backup_db.py` en tu máquina local.
4. Cambia `.env` al PostgreSQL local y restaura con `restore_db.py` (Opción B).

**Subir un respaldo local a Render**

1. Crea la BD en Render y despliega el API (tablas vacías o con `reset_db.py` vía Shell si hace falta).
2. Copia `DATABASE_URL` de Render a `backend/.env` en tu PC.
3. `python restore_db.py "ruta\al\respaldo" --drop-schema -y`
4. Sube `static/` al servicio o incluye `static.zip` en el respaldo (se restaura en `backend/static/`).

Más pasos de deploy: [docs/RENDER.md](docs/RENDER.md).

---

#### Resumen rápido

| Objetivo | Comandos principales |
|----------|----------------------|
| BD vacía + demo en otro PC | `CREATE DATABASE` → `reset_db.py` → `setup_initial_data.py` → `create_master.py` → arrancar API |
| Migrar todo desde otro servidor | `backup_db.py` (origen) → copiar carpeta/ZIP → `restore_db.py --drop-schema -y` (destino) |
| Borrar y empezar de cero (mismo PC) | `reset_db.py` → `setup_initial_data.py` → `create_master.py` |
| Solo esquema SQL manual | Ver `init_db.sql` o [README_SETUP.md](README_SETUP.md) |

> **Importante:** `reset_db.py` y `restore_db.py --drop-schema` **borran todos los datos** de la base destino. Confirma la conexión en `.env` antes de ejecutarlos.

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

Uso interno — Pedidos Mayorista.
