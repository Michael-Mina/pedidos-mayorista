# Despliegue en Render — Pedidos Mayorista

Guía para publicar **API (FastAPI + Socket.IO)**, **frontend (React)** y **PostgreSQL** en [Render](https://render.com).

---

## Resumen de servicios

| Servicio | Nombre en Blueprint | Tipo |
|----------|---------------------|------|
| API + WebSockets | `pedidos-mayorista-api` | Web (Python) |
| Interfaz web | `pedidos-mayorista-web` | Static Site |
| Base de datos | `pedidos-mayorista-db` | PostgreSQL |

---

## Opción A — Blueprint (recomendada)

1. Sube el repo a GitHub: `https://github.com/Michael-Mina/pedidos-mayorista`
2. En Render: **New +** → **Blueprint**
3. Conecta el repositorio y la rama **`main`**
4. Render detecta `render.yaml` en la raíz
5. Pulsa **Apply** y espera el despliegue (10–20 min la primera vez)

> Si aparece `no such plan free for service type web` en el **frontend**, asegúrate de usar el `render.yaml` actualizado: el sitio estático **no** lleva `plan: free` (solo el API Python).

### Tras el primer despliegue

1. Abre el servicio **`pedidos-mayorista-api`** → copia la URL (ej. `https://pedidos-mayorista-api.onrender.com`)
2. Prueba: `https://TU-API.onrender.com/` → debe responder JSON con `"message": "... running"`
3. Prueba Swagger: `https://TU-API.onrender.com/docs`
4. Abre **`pedidos-mayorista-web`** → URL del frontend (ej. `https://pedidos-mayorista-web.onrender.com`)
5. Login de prueba (si la BD estaba vacía y `SEED_ON_STARTUP=true`):
   - Usuario: `mayorista_test`
   - Contraseña: `test123`

6. **Crea el administrador** (Shell del API en Render):
   - Servicio API → **Shell**
   ```bash
   python create_admin.py
   ```
   Sigue las preguntas en consola.

7. **Cambia la contraseña de prueba** en producción y crea usuarios reales desde `/admin`.

---

## Opción B — Crear servicios a mano

### 1. Base de datos PostgreSQL

- **New +** → **PostgreSQL**
- Name: `pedidos-mayorista-db`
- Plan: Free (o Starter)
- Guarda **Internal Database URL** y **External Database URL**

### 2. Backend (API)

- **New +** → **Web Service**
- Repo: `pedidos-mayorista`, rama `main`
- **Root Directory:** `backend`
- **Runtime:** Python 3
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

**Variables de entorno:**

| Variable | Valor |
|----------|--------|
| `DATABASE_URL` | Pegar *Internal* o *External* Database URL del paso 1 |
| `SECRET_KEY` | Generar cadena larga aleatoria |
| `ALGORITHM` | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` |
| `SEED_ON_STARTUP` | `true` (solo primer despliegue; luego `false`) |
| `CORS_ORIGINS` | URL del frontend con `https://` (cuando exista) |

Render asigna automáticamente `RENDER_EXTERNAL_URL` (URL pública del API). Las imágenes del catálogo usan esa URL.

### 3. Frontend (Static Site)

- **New +** → **Static Site**
- Mismo repo, rama `main`
- **Root Directory:** `frontend`
- **Build Command:** `npm install && npm run build`
- **Publish Directory:** `dist`

**Variables de entorno (build time):**

| Variable | Valor |
|----------|--------|
| `VITE_API_URL` | `https://pedidos-mayorista-api.onrender.com` (tu URL real del API) |
| `VITE_WS_URL` | La misma URL del API (Socket.IO usa el mismo host) |

> Importante: tras cambiar `VITE_*`, haz **Manual Deploy** del frontend para recompilar.

### 4. Rutas SPA (importante)

React Router usa rutas como `/login`, `/mayorista`. En Render hay que **reescribir** todas las rutas a `index.html`.

**En Blueprint** (ya en `render.yaml`):

```yaml
routes:
  - type: rewrite
    source: /*
    destination: /index.html
```

**Si ves 404 en `/login`**, añade la regla a mano en el dashboard:

1. Servicio **pedidos-mayorista-web** → **Redirects/Rewrites**
2. **Add Rule** → Action: **Rewrite**
3. Source: `/*` → Destination: `/index.html`
4. Guardar y **Manual Deploy** del frontend

---

## WebSockets en Render

- El cliente usa `VITE_WS_URL` (misma base que el API).
- Render soporta WebSockets en servicios Web; no hace falta configuración extra.
- En plan **Free**, el API se “duerme” tras inactividad (~50 s al despertar). La primera conexión puede tardar.

---

## Imágenes de productos

- Están en el repo: `backend/static/cortes/res/`
- Se sirven en: `https://TU-API.onrender.com/static/cortes/res/...`
- Al arrancar, `catalogo_res.py` sincroniza cortes en la BD.

Si faltan imágenes, en Shell del backend:

```bash
python descargar_imagenes_res.py
```

---

## Variables de entorno — referencia

| Variable | Dónde | Descripción |
|----------|--------|-------------|
| `DATABASE_URL` | API | Conexión PostgreSQL (Render la inyecta en Blueprint) |
| `SECRET_KEY` | API | Firma JWT — **obligatorio cambiar en producción** |
| `SEED_ON_STARTUP` | API | `true` crea `mayorista_test` si no hay usuarios |
| `CORS_ORIGINS` | API | URL del frontend o `*` |
| `VITE_API_URL` | Frontend (build) | URL pública del API |
| `VITE_WS_URL` | Frontend (build) | Igual que API para Socket.IO |

---

## Problemas frecuentes

**El frontend no conecta al API**

- Revisa `VITE_API_URL` y `VITE_WS_URL` (con `https://`)
- Vuelve a desplegar el frontend después de cambiar variables.

**Error de base de datos / SSL**

- Usa la URL que Render proporciona en el panel de PostgreSQL.
- `database.py` convierte `postgres://` → `postgresql://` automáticamente.

**Login falla**

- Ejecuta Shell: `python setup_initial_data.py` o deja `SEED_ON_STARTUP=true` y reinicia el API.
- Crea admin: `python create_admin.py`

**Las imágenes no cargan**

- Abre en el navegador: `https://TU-API.onrender.com/static/cortes/res/pecho-de-res.jpg`
- Si 404, ejecuta `descargar_imagenes_res.py` en Shell.

**CORS bloqueado**

- En el API, pon `CORS_ORIGINS` = URL exacta del frontend (con `https://`, sin barra final).

---

## Actualizar producción

```bash
git push origin main
```

Si **Auto-Deploy** está activo en cada servicio, Render reconstruye solo. Si no, **Manual Deploy** en el dashboard.

---

## Límites plan Free

- 1 BD PostgreSQL free por cuenta (a veces hay que borrar una antigua).
- El API puede dormir; el frontend estático no.
- 750 h/mes de servicio web compartidas.

Para uso en tiendas en horario punta, valora plan **Starter** en API y BD.
