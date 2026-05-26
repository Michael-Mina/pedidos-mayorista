# Respaldo y restauración — Pedidos Mayorista

Sistema de copias de seguridad para:

1. **Estructura de la base de datos** (`schema.sql`) — tablas, índices, constraints.
2. **Datos de la aplicación** (`data.sql`) — filas en formato `INSERT`.
3. **Archivos estáticos** (`static.zip`) — imágenes en `backend/static/cortes/` y `uploads/`.
4. **Metadatos** (`manifest.json`) — fecha, base de datos, archivos incluidos.

Opcionalmente, por línea de comandos, puede generarse `full.sql` (esquema + datos en un solo archivo).

---

## Resumen: dos formas de respaldar

| Forma | Dónde | Resultado | Retención en servidor |
|-------|--------|-----------|------------------------|
| **Panel Admin → Respaldo** | Navegador, usuario `admin` | ZIP descargado al PC | No guarda en `backups/` |
| **Script `backup_db.py`** | Terminal en `backend/` | Carpeta en `backups/backup_*` | Sí, con limpieza automática |

Ambas usan `pg_dump` / la misma lógica en `backend/app/backup.py`.

---

## Requisitos

- PostgreSQL con **herramientas cliente**: `pg_dump` y `psql`.
- Windows: instale [PostgreSQL](https://www.postgresql.org/download/windows/) o defina en `.env`:

```env
PG_DUMP_PATH=C:\Program Files\PostgreSQL\16\bin
```

- Conexión: `DATABASE_URL` (Render) o `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`, `DB_PORT` (local). Ver [.env.example](../.env.example).

---

## Panel Admin (recomendado en el día a día)

1. Inicie sesión como **administrador** (ej. `admin1` / `12345678` si usó el seed).
2. Menú lateral → **Respaldo**.
3. Espere el indicador de estado (servidor listo / sin `pg_dump`).
4. Pulse **Descargar respaldo ZIP**.

El ZIP contiene los mismos archivos que un respaldo por script, empaquetados para guardar en disco o nube.

### API (solo administrador)

Requiere header `Authorization: Bearer <token>` (el front lo envía tras el login).

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/admin/backup/status` | `{ pg_dump_available, database }` |
| GET | `/admin/backup/download` | Respuesta `application/zip` |

Ejemplo con curl (tras login):

```powershell
$token = "SU_TOKEN_JWT"
curl -H "Authorization: Bearer $token" -o respaldo.zip "http://localhost:8000/admin/backup/download"
```

### Seguridad

- Solo usuarios con rol **`admin`** pueden llamar estas rutas (`auth.require_admin`).
- El ZIP incluye **datos sensibles** (usuarios, pedidos, hashes de contraseña). Guárdelo cifrado o en almacenamiento privado.
- No suba respaldos al repositorio Git (`backups/` está en `.gitignore`).

---

## Línea de comandos: crear respaldo

Desde `backend/` con el venv activado:

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python backup_db.py
```

Cada ejecución crea:

```text
backups/backup_YYYYMMDD_HHMMSS/
├── manifest.json
├── schema.sql
├── data.sql
└── static.zip    # si hay imágenes
```

### Variantes

| Comando | Descripción |
|---------|-------------|
| `python backup_db.py` | Estructura + datos + estáticos |
| `python backup_db.py --schema-only` | Solo estructura |
| `python backup_db.py --data-only` | Solo datos |
| `python backup_db.py --full` | Además `full.sql` |
| `python backup_db.py --no-static` | Sin imágenes |
| `python backup_db.py --list` | Listar respaldos en disco |

---

## Restaurar

### Desde carpeta `backups/` (script local)

```powershell
python restore_db.py --list
python restore_db.py --latest
python restore_db.py backups\backup_20260525_143022
python restore_db.py --latest --drop-schema -y
```

| Opción | Uso |
|--------|-----|
| `--latest` | El respaldo más reciente en `backups/` |
| `--schema-only` / `--data-only` | Restauración parcial |
| `--no-static` | No restaurar imágenes |
| `--drop-schema` | **Destructivo:** vacía `public` antes del esquema |
| `-y` | Sin confirmación |

### Desde ZIP descargado en Admin

1. Descomprima el ZIP en una carpeta (ej. `restaurar\`).
2. Debe quedar `manifest.json`, `schema.sql`, `data.sql` y opcionalmente `static.zip` en la misma carpeta.
3. Restaure con la ruta a esa carpeta:

```powershell
python restore_db.py "D:\copias\restaurar" --drop-schema -y
```

Si el ZIP tenía una subcarpeta interna, apunte a la carpeta que contiene `manifest.json`.

---

## Variables de entorno

| Variable | Por defecto | Descripción |
|----------|-------------|-------------|
| `BACKUP_DIR` | `../backups` (raíz del proyecto) | Destino de `backup_db.py` |
| `BACKUP_RETENTION_DAYS` | `30` | Elimina carpetas `backup_*` antiguas |
| `PG_DUMP_PATH` | PATH / Program Files | Carpeta `bin` o ruta a `pg_dump.exe` |
| `PSQL_PATH` | Igual que pg_dump | Ruta a `psql` si difiere |

---

## Render (producción)

En Render **no** se instala `postgresql-client` en el build (provoca fallo de deploy). El API usa **respaldo por Python** (SQLAlchemy) cuando `pg_dump` no está disponible.

En Admin verá: *Servidor listo · modo Python (sin pg_dump)* — el ZIP se genera igual.

Si el botón está deshabilitado:

1. Compruebe conexión a la BD (`DATABASE_URL` en el servicio API).
2. Pruebe `GET https://SU-API.onrender.com/admin/backup/status` → `backup_available: true`.
3. Alternativa local: copie `DATABASE_URL` a `backend/.env` y ejecute `python backup_db.py` (usa `pg_dump` si está instalado).

**Nota:** en Render el disco del contenedor es **efímero**; las imágenes nuevas en `static/` pueden perderse al redeploy. Incluya siempre `static.zip` en el respaldo y guarde copias fuera del servidor.

### Respaldos programados

**Windows (Programador de tareas):**

- Programa: `D:\Pedidos mayorista\backend\venv\Scripts\python.exe`
- Argumentos: `backup_db.py`
- Iniciar en: `D:\Pedidos mayorista\backend`

**Cron (Linux):**

```cron
0 2 * * * cd /ruta/pedidos-mayorista/backend && ./venv/bin/python backup_db.py >> /var/log/pedidos-backup.log 2>&1
```

---

## Archivos del sistema de backup

| Archivo | Rol |
|---------|-----|
| `backend/app/backup.py` | Lógica pg_dump, ZIP, restauración |
| `backend/app/auth.py` | `require_admin` para rutas `/admin/backup/*` |
| `backend/backup_db.py` | CLI crear respaldo |
| `backend/restore_db.py` | CLI restaurar |
| `frontend/src/services/api/index.js` | `downloadAdminBackup()` |
| `frontend/src/pages/Admin/Admin.jsx` | Pestaña **Respaldo** |

---

## Buenas prácticas

- Probar restauración en un entorno de **prueba** antes de depender del respaldo en producción.
- Copias en otro disco o nube (OneDrive, S3, etc.).
- Nuevo respaldo tras migraciones (`migrate_*.py`) o cambios grandes de datos.
- Definir **RPO** (pérdida máxima de datos) y **RTO** (tiempo de recuperación) según la frecuencia del respaldo.

---

## Solución de problemas

| Problema | Qué hacer |
|----------|-----------|
| `No se encontró pg_dump` | Instalar cliente PostgreSQL o `PG_DUMP_PATH` |
| Admin: botón deshabilitado | El API no tiene `pg_dump`; redeploy con `render.yaml` actualizado o usar script local |
| `401` / `403` en descarga | Iniciar sesión como **admin**; token en `localStorage` |
| `password authentication failed` | Revisar `DATABASE_URL` / `DB_*` en `backend/.env` |
| Restaurar datos falla por FK | `restore_db.py --drop-schema` y luego restauración completa |
| `static.zip` vacío | Normal si no hay archivos en `static/cortes` ni `uploads` |
| ZIP del Admin muy grande | Normal con muchos pedidos/imágenes; espere o use `--no-static` por CLI |
