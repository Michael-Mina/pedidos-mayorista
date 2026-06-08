from fastapi import FastAPI, Depends, HTTPException, Query, Body, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from pathlib import Path
from datetime import date
import os
import socketio
import threading

from . import models, schemas, crud, database, auth, background_tasks, catalogo_res, startup_seed, backup, report_excel, catalog_excel, role_catalog, db_reset, notifications
from .database import engine, get_db, SessionLocal

# 1. Initialize FastAPI app
app = FastAPI(title="Pedidos Mayorista API")

# 2. CORS Configuration
def _build_cors_origins():
    raw = os.getenv("CORS_ORIGINS", "*").strip()
    origins: list[str] = []
    if raw and raw != "*":
        origins = [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
    else:
        origins = ["*"]
    for key in ("RENDER_EXTERNAL_URL", "PUBLIC_API_URL"):
        extra = os.getenv(key, "").strip().rstrip("/")
        if extra and extra not in origins:
            origins.append(extra)
    # Sitio estático Render (por si CORS_ORIGINS no enlazó el frontend)
    for known in (
        "https://pedidos-mayorista-web.onrender.com",
        "http://localhost:5173",
        "http://localhost:3000",
    ):
        if known not in origins:
            origins.append(known)
    return origins or ["*"]


_cors_origins = _build_cors_origins()
_use_credentials = "*" not in _cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_use_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# 3. Socket.io Setup
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, app)

# 4. Create database tables
models.Base.metadata.create_all(bind=engine)

# 4a. Pequeñas migraciones idempotentes (Render no corre Alembic)
def _ensure_pedidos_columns():
    """Asegura columnas nuevas sin romper despliegues."""
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS problema_reportado TEXT;"))
            conn.execute(text("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS problema_respuesta TEXT;"))
            conn.execute(text("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS reporte_mensajes TEXT;"))
    except Exception as exc:
        # No abortar el arranque por un ALTER TABLE (p.ej. permisos / tabla no existe aún)
        print(f"[migrations] Aviso al asegurar columnas pedidos: {exc}")

_ensure_pedidos_columns()


def _ensure_catalog_sede_columns():
    """Catálogo por sede: categorías, cortes y tipos de corte."""
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE categorias ADD COLUMN IF NOT EXISTS sede_id INTEGER REFERENCES sedes(id);"))
            conn.execute(text("ALTER TABLE cortes ADD COLUMN IF NOT EXISTS sede_id INTEGER REFERENCES sedes(id);"))
            conn.execute(text("ALTER TABLE tipos_corte ADD COLUMN IF NOT EXISTS sede_id INTEGER REFERENCES sedes(id);"))
            conn.execute(text(
                "UPDATE categorias SET sede_id = (SELECT MIN(id) FROM sedes) "
                "WHERE sede_id IS NULL AND EXISTS (SELECT 1 FROM sedes);"
            ))
            conn.execute(text(
                "UPDATE cortes SET sede_id = (SELECT MIN(id) FROM sedes) "
                "WHERE sede_id IS NULL AND EXISTS (SELECT 1 FROM sedes);"
            ))
            conn.execute(text(
                "UPDATE tipos_corte SET sede_id = (SELECT MIN(id) FROM sedes) "
                "WHERE sede_id IS NULL AND EXISTS (SELECT 1 FROM sedes);"
            ))
            # Compatibilidad con installs previos: antes la unicidad estaba mal definida como global (nombre).
            # Esto genera errores al importar/crear con mismo nombre en otra sede.
            conn.execute(text("ALTER TABLE categorias DROP CONSTRAINT IF EXISTS categorias_nombre_key;"))
            conn.execute(text("ALTER TABLE categorias DROP CONSTRAINT IF EXISTS ix_categorias_nombre;"))
            conn.execute(text("DROP INDEX IF EXISTS ix_categorias_nombre;"))

            conn.execute(text("ALTER TABLE tipos_corte DROP CONSTRAINT IF EXISTS tipos_corte_nombre_key;"))
            conn.execute(text("ALTER TABLE tipos_corte DROP CONSTRAINT IF EXISTS ix_tipos_corte_nombre;"))
            conn.execute(text("DROP INDEX IF EXISTS ix_tipos_corte_nombre;"))
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_categoria_sede_nombre "
                "ON categorias (sede_id, nombre) WHERE sede_id IS NOT NULL;"
            ))
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_tipo_corte_sede_nombre "
                "ON tipos_corte (sede_id, nombre) WHERE sede_id IS NOT NULL;"
            ))
    except Exception as exc:
        print(f"[migrations] Aviso al asegurar catálogo por sede: {exc}")


_ensure_catalog_sede_columns()


def _ensure_cliente_panel_columns() -> None:
    """Slug de sede, pedidos cliente y tablas de turnos/notificaciones."""
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE sedes ADD COLUMN IF NOT EXISTS slug VARCHAR;"))
            conn.execute(text("ALTER TABLE sedes ADD COLUMN IF NOT EXISTS notificacion_canal VARCHAR DEFAULT 'ambos';"))
            conn.execute(text("UPDATE sedes SET notificacion_canal = 'ambos' WHERE notificacion_canal IS NULL;"))
            conn.execute(text("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_telefono VARCHAR;"))
            conn.execute(text("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS origen VARCHAR DEFAULT 'mayorista';"))
            conn.execute(text("UPDATE pedidos SET origen = 'mayorista' WHERE origen IS NULL;"))
            conn.execute(text("ALTER TABLE pedidos ALTER COLUMN mayorista_id DROP NOT NULL;"))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS turno_tickets (
                    id SERIAL PRIMARY KEY,
                    sede_id INTEGER NOT NULL REFERENCES sedes(id),
                    numero INTEGER NOT NULL,
                    estado VARCHAR(24) NOT NULL DEFAULT 'esperando',
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    called_at TIMESTAMPTZ,
                    finished_at TIMESTAMPTZ,
                    CONSTRAINT uq_turno_sede_numero UNIQUE (sede_id, numero)
                );
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS notification_logs (
                    id SERIAL PRIMARY KEY,
                    pedido_id INTEGER REFERENCES pedidos(id),
                    canal VARCHAR(24) NOT NULL,
                    destino VARCHAR(64) NOT NULL,
                    estado_pedido VARCHAR(32) NOT NULL,
                    status VARCHAR(24) NOT NULL,
                    error TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_sedes_slug ON sedes (slug) WHERE slug IS NOT NULL;"
            ))
    except Exception as exc:
        print(f"[migrations] Aviso al asegurar panel clientes: {exc}")

    try:
        from . import slug_utils
        with SessionLocal() as db:
            changed = False
            for sede in db.query(models.Sede).all():
                if not sede.slug:
                    sede.slug = slug_utils.make_unique_slug(db, sede.nombre, exclude_sede_id=sede.id)
                    changed = True
            if changed:
                db.commit()
                print("[migrations] Slugs de sedes generados")
    except Exception as exc:
        print(f"[migrations] Aviso al backfill de slugs: {exc}")


_ensure_cliente_panel_columns()


def _ensure_app_roles_columns() -> None:
    """Migraciones app_roles en transacciones separadas (evita rollback si falla users.role)."""
    stmts = [
        """
        CREATE TABLE IF NOT EXISTS app_roles (
            id SERIAL PRIMARY KEY,
            code VARCHAR(48) UNIQUE NOT NULL,
            label VARCHAR(120) NOT NULL,
            panel VARCHAR(24) NOT NULL DEFAULT 'mayorista',
            is_system BOOLEAN DEFAULT FALSE,
            is_hidden BOOLEAN DEFAULT FALSE,
            can_assign BOOLEAN DEFAULT TRUE,
            is_enabled BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """,
        "ALTER TABLE app_roles ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT TRUE;",
        "UPDATE app_roles SET is_enabled = TRUE WHERE is_enabled IS NULL;",
    ]
    for sql in stmts:
        try:
            with engine.begin() as conn:
                conn.execute(text(sql))
        except Exception as exc:
            print(f"[migrations] Aviso app_roles: {exc}")

    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(48) USING role::text;"
                )
            )
    except Exception as exc:
        print(f"[migrations] Aviso users.role: {exc}")


_ensure_app_roles_columns()


def _normalize_legacy_user_roles() -> None:
    """Unifica roles guardados como enum en mayúsculas (p. ej. JEFE_CARNES → jefe_carnes)."""
    try:
        with SessionLocal() as db:
            changed = False
            for user in db.query(models.User).all():
                normalized = role_catalog.normalize_role_code(user.role or "")
                if user.role != normalized:
                    user.role = normalized
                    changed = True
            if changed:
                db.commit()
                print("[migrations] Roles de usuarios normalizados a minúsculas")
    except Exception as exc:
        print(f"[migrations] Aviso al normalizar roles de usuarios: {exc}")


try:
    with SessionLocal() as _db:
        role_catalog.seed_builtin_roles(_db)
        role_catalog.ensure_operational_roles(_db)
except Exception as _roles_err:
    print(f"[role_catalog] Aviso al sembrar roles: {_roles_err}")

_normalize_legacy_user_roles()

# 4b. Archivos estáticos (imágenes de cortes en el servidor)
_STATIC_ROOT = Path(__file__).resolve().parent.parent / "static"
_STATIC_ROOT.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_STATIC_ROOT)), name="static")

# 4c. Catálogo de res (opcional; desactivado por defecto en producción limpia)
if os.getenv("SEED_CATALOGO", "").lower() in ("1", "true", "yes"):
    try:
        with SessionLocal() as _db:
            for sede in _db.query(models.Sede).all():
                catalogo_res.ensure_cortes_res(_db, sede_id=sede.id)
                catalogo_res.migrar_cortes_res_existentes_a_local(_db, sede_id=sede.id)
    except Exception as _seed_err:
        print(f"[catalogo_res] Aviso al sincronizar catálogo: {_seed_err}")

startup_seed.ensure_master_user()
startup_seed.run_if_enabled()

# 5. Start background popularity task
threading.Thread(target=background_tasks.popularity_background_task, args=(SessionLocal,), daemon=True).start()

# --- Socket.io Events ---
@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")

@sio.on("join_room")
async def join_room(sid, room_name):
    await sio.enter_room(sid, room_name)
    print(f"Client {sid} joined room: {room_name}")


async def _emit_pedido_rooms(event: str, payload, sede_id: str):
    """Notifica a la sede del pedido y a la sala del jefe de carnes (manager)."""
    await sio.emit(event, payload, room=f"sede_{sede_id}")
    await sio.emit(event, payload, room="manager")


def _turno_display_payload(db: Session, sede_id: int) -> dict:
    data = crud.get_turno_display(db, sede_id)
    return schemas.TurnoDisplay(
        actual=schemas.TurnoTicket.model_validate(data["actual"]) if data["actual"] else None,
        proximos=[schemas.TurnoTicket.model_validate(t) for t in data["proximos"]],
        ultimo_atendido=schemas.TurnoTicket.model_validate(data["ultimo_atendido"]) if data["ultimo_atendido"] else None,
    ).model_dump(mode="json")


async def _emit_turn_update(db: Session, sede_id: int):
    payload = _turno_display_payload(db, sede_id)
    await sio.emit("turn_update", payload, room=f"sede_{sede_id}")
    await sio.emit("turn_update", payload, room="manager")


def _resolve_sede_by_slug(db: Session, slug: str) -> models.Sede:
    sede = crud.get_sede_by_slug(db, slug)
    if not sede:
        raise HTTPException(status_code=404, detail="Sede no encontrada")
    return sede


async def _emit_carnicero_update(sede_id: int, action: str, carnicero: dict):
    """Notifica cambios de carniceros a la tablet sede y al panel supervisor."""
    payload = {"action": action, "sede_id": sede_id, "carnicero": carnicero}
    await sio.emit("carnicero_update", payload, room=f"sede_{sede_id}")
    await sio.emit("carnicero_update", payload, room="manager")


# --- API Routes ---

def _parse_stats_date(value: Optional[str]) -> Optional[date]:
    if not value or not value.strip():
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Fecha inválida: {value}. Use YYYY-MM-DD.")


@app.get("/")
def read_root():
    return {"message": "Pedidos Mayorista API is running", "docs": "/docs"}


def _user_api(db: Session, user: models.User) -> schemas.User:
    sede_id = user.sede_id
    if sede_id is None:
        sede = db.query(models.Sede).first()
        if sede:
            user.sede_id = sede.id
            db.commit()
            db.refresh(user)
            sede_id = user.sede_id

    try:
        data = schemas.User.model_validate(user).model_dump()
    except Exception:
        data = {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "sede_id": sede_id if sede_id is not None else 0,
            "session_active": user.session_active if user.session_active is not None else 0,
            "nombre": user.nombre,
            "apellido": user.apellido,
            "numero_carnicero": user.numero_carnicero,
            "is_available": user.is_available if user.is_available is not None else True,
        }
    data.update(role_catalog.user_response_extra(db, user))
    if data.get("sede_id") is None:
        data["sede_id"] = sede_id if sede_id is not None else 0
    return schemas.User(**data)


@app.post("/register", response_model=schemas.User)
def register_user(user: schemas.UserBase, password: Optional[str] = None, db: Session = Depends(get_db)):
    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    if user.role == models.UserRole.MASTER.value:
        raise HTTPException(status_code=400, detail="No se puede registrar el rol master desde la API")
    try:
        crud.validate_assignable_role(db, user.role)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # If no password is provided (e.g., for butchers), use a dummy password
    actual_password = password if password else "nopassword_carnicero_default"
    password_hash = auth.get_password_hash(actual_password)
    
    new_user = models.User(
        username=user.username,
        role=user.role,
        sede_id=user.sede_id,
        password_hash=password_hash
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return _user_api(db, new_user)

@app.post("/login", response_model=schemas.Token)
def login(login_data: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = crud.get_user_by_username(db, username=login_data.username)
    if not user or not auth.verify_password(login_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    # If user is a sede (butcher shop), ensure session is active
    if user.role == models.UserRole.SEDE_BUTCHER.value:
        # Always set to active (1) for direct access
        if user.session_active != 1:
            user.session_active = 1
            db.commit()
            db.refresh(user)

    role_row = role_catalog.get_role_row(db, user.role)
    if role_row and not role_catalog.role_is_enabled(db, user.role):
        raise HTTPException(status_code=403, detail="Su rol está deshabilitado. Contacte al administrador.")
    
    access_token = auth.create_access_token(data={"sub": user.username})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": _user_api(db, user),
    }

@app.post("/logout")
async def logout(user_id: int, db: Session = Depends(get_db)):
    """Logout endpoint that revokes session for sedes"""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Deactivate session
    if user.role == models.UserRole.SEDE_BUTCHER.value:
        crud.update_session_status(db, user_id, 0)
        # Notify via socket
        await sio.emit("sede_logout", {"user_id": user_id}, room=f"sede_{user.sede_id}")
    
    return {"success": True, "message": "Logged out successfully"}

# DEPRECATED: /approve-sedes endpoint removed

@app.put("/users/{user_id}", response_model=schemas.User)
def update_user(user_id: int, user: schemas.UserUpdate, db: Session = Depends(get_db)):
    db_user = crud.get_user(db, user_id=user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    password_hash = None
    if user.password:
        password_hash = auth.get_password_hash(user.password)
    try:
        updated = crud.update_user(
            db=db,
            user_id=user_id,
            user=schemas.UserBase(
                username=user.username,
                role=user.role,
                sede_id=user.sede_id,
                session_active=user.session_active if user.session_active is not None else db_user.session_active,
            ),
            password_hash=password_hash,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar usuario: {e}")
    if updated is None:
        raise HTTPException(status_code=404, detail="User not found")
    return updated

@app.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    return crud.delete_user(db, user_id)

@app.get("/sedes", response_model=List[schemas.Sede])
def read_sedes(db: Session = Depends(get_db)):
    return crud.get_sedes(db)

@app.post("/sedes", response_model=schemas.Sede)
def create_sede(
    sede: schemas.SedeCreate,
    db: Session = Depends(get_db),
    _master: models.User = Depends(auth.require_master),
):
    return crud.create_sede(db, sede)

@app.put("/sedes/{sede_id}", response_model=schemas.Sede)
def update_sede(
    sede_id: int,
    sede: schemas.SedeUpdate,
    db: Session = Depends(get_db),
    _master: models.User = Depends(auth.require_master),
):
    return crud.update_sede(db, sede_id, sede)

@app.delete("/sedes/{sede_id}")
def delete_sede(
    sede_id: int,
    db: Session = Depends(get_db),
    _master: models.User = Depends(auth.require_master),
):
    return crud.delete_sede(db, sede_id)

@app.get("/categorias", response_model=List[schemas.Categoria])
def read_categories(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_catalog_reader),
):
    return crud.get_categories(db, current_user.sede_id)

@app.post("/categorias", response_model=schemas.Categoria)
def create_category(
    cat: schemas.CategoriaBase,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_catalog_manager),
):
    return crud.create_category(db, cat, current_user.sede_id)

@app.put("/categorias/{cat_id}", response_model=schemas.Categoria)
def update_category(
    cat_id: int,
    cat: schemas.CategoriaBase,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_catalog_manager),
):
    updated = crud.update_category(db, cat_id, cat, current_user.sede_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Categoría no encontrada en esta sede")
    return updated

@app.delete("/categorias/{cat_id}")
def delete_category(
    cat_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_catalog_manager),
):
    deleted = crud.delete_category(db, cat_id, current_user.sede_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Categoría no encontrada en esta sede")
    return {"ok": True}

@app.get("/cortes", response_model=List[schemas.Corte])
def read_cortes(
    categoria_id: int = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_catalog_reader),
):
    return crud.get_cortes(db, current_user.sede_id, categoria_id)

@app.post("/cortes", response_model=schemas.Corte)
def create_corte_endpoint(
    corte: schemas.CorteBase,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_catalog_manager),
):
    try:
        return crud.create_corte(db, corte, current_user.sede_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

@app.put("/cortes/{corte_id}", response_model=schemas.Corte)
def update_corte_endpoint(
    corte_id: int,
    corte: schemas.CorteBase,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_catalog_manager),
):
    try:
        updated = crud.update_corte(db, corte_id, corte, current_user.sede_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not updated:
        raise HTTPException(status_code=404, detail="Producto no encontrado en esta sede")
    return updated

@app.delete("/cortes/{corte_id}")
def delete_corte_endpoint(
    corte_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_catalog_manager),
):
    deleted = crud.delete_corte(db, corte_id, current_user.sede_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Producto no encontrado en esta sede")
    return {"ok": True}

@app.get("/tipos-corte", response_model=List[schemas.TipoCorte])
def read_tipos_corte(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_catalog_reader),
):
    return crud.get_tipos_corte(db, current_user.sede_id)

@app.post("/tipos-corte", response_model=schemas.TipoCorte)
def create_tipo_corte_endpoint(
    tipo: schemas.TipoCorteBase,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_catalog_manager),
):
    return crud.create_tipo_corte(db, tipo, current_user.sede_id)

@app.put("/tipos-corte/{tipo_id}", response_model=schemas.TipoCorte)
def update_tipo_corte_endpoint(
    tipo_id: int,
    tipo: schemas.TipoCorteBase,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_catalog_manager),
):
    updated = crud.update_tipo_corte(db, tipo_id, tipo, current_user.sede_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Tipo de corte no encontrado en esta sede")
    return updated

@app.delete("/tipos-corte/{tipo_id}")
def delete_tipo_corte_endpoint(
    tipo_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_catalog_manager),
):
    deleted = crud.delete_tipo_corte(db, tipo_id, current_user.sede_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Tipo de corte no encontrado en esta sede")
    return {"ok": True}


@app.get("/catalogo/excel/export")
def export_catalog_excel(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_catalog_manager),
):
    sede = db.query(models.Sede).filter(models.Sede.id == current_user.sede_id).first()
    sede_nombre = sede.nombre if sede else f"sede_{current_user.sede_id}"
    try:
        content, filename = catalog_excel.build_catalog_export(db, current_user.sede_id, sede_nombre)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error al exportar catálogo: {exc}")
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/catalogo/excel/plantilla")
def download_catalog_template(
    _current_user: models.User = Depends(auth.require_catalog_manager),
):
    content, filename = catalog_excel.build_catalog_template("plantilla")
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/catalogo/excel/import")
async def import_catalog_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_catalog_manager),
):
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Suba un archivo Excel (.xlsx)")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    try:
        result = catalog_excel.import_catalog_from_excel(db, current_user.sede_id, content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error al importar catálogo: {exc}")
    return result


# --- Panel público de clientes (sin auth) ---

@app.get("/public/sedes/{slug}/info", response_model=schemas.SedePublicInfo)
def public_sede_info(slug: str, db: Session = Depends(get_db)):
    sede = _resolve_sede_by_slug(db, slug)
    return schemas.SedePublicInfo.model_validate(sede)


@app.get("/public/sedes/{slug}/catalogo/categorias", response_model=List[schemas.Categoria])
def public_catalog_categorias(slug: str, db: Session = Depends(get_db)):
    sede = _resolve_sede_by_slug(db, slug)
    return crud.get_categories(db, sede.id)


@app.get("/public/sedes/{slug}/catalogo/cortes", response_model=List[schemas.Corte])
def public_catalog_cortes(
    slug: str,
    categoria_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    sede = _resolve_sede_by_slug(db, slug)
    return crud.get_cortes(db, sede.id, categoria_id)


@app.get("/public/sedes/{slug}/catalogo/tipos-corte", response_model=List[schemas.TipoCorte])
def public_catalog_tipos_corte(slug: str, db: Session = Depends(get_db)):
    sede = _resolve_sede_by_slug(db, slug)
    return crud.get_tipos_corte(db, sede.id)


@app.post("/public/sedes/{slug}/turnos", response_model=schemas.TurnoTicket)
async def public_create_turno(slug: str, db: Session = Depends(get_db)):
    sede = _resolve_sede_by_slug(db, slug)
    turno = crud.create_turno_ticket(db, sede.id)
    await _emit_turn_update(db, sede.id)
    return turno


@app.get("/public/sedes/{slug}/turnos/display", response_model=schemas.TurnoDisplay)
def public_turno_display(slug: str, db: Session = Depends(get_db)):
    sede = _resolve_sede_by_slug(db, slug)
    data = crud.get_turno_display(db, sede.id)
    return schemas.TurnoDisplay(
        actual=schemas.TurnoTicket.model_validate(data["actual"]) if data["actual"] else None,
        proximos=[schemas.TurnoTicket.model_validate(t) for t in data["proximos"]],
        ultimo_atendido=schemas.TurnoTicket.model_validate(data["ultimo_atendido"]) if data["ultimo_atendido"] else None,
    )


@app.post("/public/sedes/{slug}/pedidos", response_model=schemas.Pedido)
async def public_create_pedido_cliente(
    slug: str,
    pedido: schemas.PedidoClienteCreate,
    db: Session = Depends(get_db),
):
    sede = _resolve_sede_by_slug(db, slug)
    try:
        db_pedido = crud.create_pedido_cliente(db, sede.id, pedido)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    notifications.send_pedido_status_notification(db, db_pedido, "pendiente")
    payload = schemas.Pedido.model_validate(db_pedido).model_dump(mode="json")
    await _emit_pedido_rooms("new_order", payload, db_pedido.sede_id)
    return db_pedido


@app.get("/public/sedes/{slug}/pedidos/{pedido_id}/estado", response_model=schemas.PedidoClienteEstado)
def public_pedido_estado(
    slug: str,
    pedido_id: int,
    telefono: str = Query(..., min_length=7),
    db: Session = Depends(get_db),
):
    sede = _resolve_sede_by_slug(db, slug)
    pedido = crud.get_pedido_cliente_estado(db, pedido_id, telefono)
    if not pedido or pedido.sede_id != sede.id:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    return schemas.PedidoClienteEstado.model_validate(pedido)


# --- Gestión de turnos (staff) ---

@app.get("/sedes/{sede_id}/turnos", response_model=List[schemas.TurnoTicket])
def list_turnos_sede(
    sede_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_turno_staff),
):
    auth.assert_sede_access(current_user, sede_id)
    return crud.get_turnos_by_sede(db, sede_id)


@app.put("/turnos/{turno_id}/llamar", response_model=schemas.TurnoTicket)
async def llamar_turno_endpoint(
    turno_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_turno_staff),
):
    turno = db.query(models.TurnoTicket).filter(models.TurnoTicket.id == turno_id).first()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    auth.assert_sede_access(current_user, turno.sede_id)
    updated = crud.llamar_turno(db, turno_id, turno.sede_id)
    await _emit_turn_update(db, turno.sede_id)
    return updated


@app.put("/turnos/{turno_id}/atender", response_model=schemas.TurnoTicket)
async def atender_turno_endpoint(
    turno_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_turno_staff),
):
    turno = db.query(models.TurnoTicket).filter(models.TurnoTicket.id == turno_id).first()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    auth.assert_sede_access(current_user, turno.sede_id)
    updated = crud.atender_turno(db, turno_id, turno.sede_id)
    await _emit_turn_update(db, turno.sede_id)
    return updated


@app.put("/turnos/sede/{sede_id}/siguiente", response_model=schemas.TurnoTicket)
async def llamar_siguiente_turno_endpoint(
    sede_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_turno_staff),
):
    auth.assert_sede_access(current_user, sede_id)
    updated = crud.llamar_siguiente_turno(db, sede_id)
    if not updated:
        raise HTTPException(status_code=404, detail="No hay turnos en espera")
    await _emit_turn_update(db, sede_id)
    return updated


@app.get("/users/carniceros/{sede_id}", response_model=List[schemas.User])
def get_sede_carniceros(sede_id: str, db: Session = Depends(get_db)):
    return crud.get_carniceros_by_sede(db, sede_id)

@app.post("/users/carniceros", response_model=schemas.User)
async def create_carnicero_endpoint(carnicero: schemas.CarniceroCreate, db: Session = Depends(get_db)):
    username = (carnicero.username or carnicero.numero_carnicero or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="El número de carnicero es obligatorio")
    if not carnicero.nombre or not carnicero.apellido:
        raise HTTPException(status_code=400, detail="Nombre y apellido son obligatorios")
    if not carnicero.sede_id:
        raise HTTPException(status_code=400, detail="La sede es obligatoria")
    db_user = crud.get_user_by_username(db, username=username)
    if db_user:
        raise HTTPException(
            status_code=400,
            detail=f"Ya existe un usuario con el número {username}",
        )
    try:
        password_hash = auth.get_password_hash(carnicero.password)
        created = crud.create_carnicero(db, carnicero, password_hash)
        user_out = _user_api(db, created)
        await _emit_carnicero_update(
            int(created.sede_id),
            "created",
            user_out.model_dump(mode="json"),
        )
        return user_out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/users/carniceros/{user_id}/availability", response_model=schemas.User)
async def update_carnicero_availability_endpoint(user_id: int, is_available: bool, db: Session = Depends(get_db)):
    db_user = crud.update_carnicero_availability(db, user_id, is_available)
    if not db_user:
        raise HTTPException(status_code=404, detail="Carnicero no encontrado")
    user_out = _user_api(db, db_user)
    await _emit_carnicero_update(
        int(db_user.sede_id),
        "updated",
        user_out.model_dump(mode="json"),
    )
    return user_out

@app.put("/users/carniceros/{user_id}", response_model=schemas.User)
async def update_carnicero_endpoint(user_id: int, carnicero: schemas.CarniceroUpdate, db: Session = Depends(get_db)):
    password_hash = None
    if carnicero.password:
        password_hash = auth.get_password_hash(carnicero.password)
    db_user = crud.update_carnicero(db, user_id, carnicero, password_hash)
    if not db_user:
        raise HTTPException(status_code=404, detail="Carnicero no encontrado")
    user_out = _user_api(db, db_user)
    await _emit_carnicero_update(
        int(db_user.sede_id),
        "updated",
        user_out.model_dump(mode="json"),
    )
    return user_out

@app.delete("/users/carniceros/{user_id}")
async def delete_carnicero_endpoint(user_id: int, db: Session = Depends(get_db)):
    db_user = crud.delete_user(db, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="Carnicero no encontrado")
    await _emit_carnicero_update(
        int(db_user.sede_id),
        "deleted",
        {"id": db_user.id, "sede_id": db_user.sede_id},
    )
    return {"message": "Carnicero eliminado correctamente"}

@app.get("/users", response_model=List[schemas.User])
def read_users(db: Session = Depends(get_db)):
    return [_user_api(db, u) for u in crud.get_users(db)]


@app.get("/roles/assignable", response_model=List[schemas.AppRole])
def read_assignable_roles(
    db: Session = Depends(get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    return role_catalog.list_assignable_roles(db)


@app.get("/master/roles", response_model=List[schemas.AppRole])
def master_list_roles(
    db: Session = Depends(get_db),
    _master: models.User = Depends(auth.require_master),
):
    return role_catalog.list_roles_for_master(db)


@app.post("/master/roles", response_model=schemas.AppRole)
def master_create_role(
    body: schemas.AppRoleCreate,
    db: Session = Depends(get_db),
    _master: models.User = Depends(auth.require_master),
):
    try:
        return crud.create_app_role(
            db,
            code=body.code,
            label=body.label,
            panel=body.panel,
            can_assign=body.can_assign,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.put("/master/roles/{role_id}", response_model=schemas.AppRole)
def master_update_role(
    role_id: int,
    body: schemas.AppRoleUpdate,
    db: Session = Depends(get_db),
    _master: models.User = Depends(auth.require_master),
):
    try:
        row = crud.update_app_role(
            db,
            role_id,
            label=body.label,
            panel=body.panel,
            can_assign=body.can_assign,
            is_enabled=body.is_enabled,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not row:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    return row


@app.delete("/master/roles/{role_id}")
def master_delete_role(
    role_id: int,
    force: bool = Query(False),
    db: Session = Depends(get_db),
    _master: models.User = Depends(auth.require_master),
):
    try:
        row = crud.delete_app_role(db, role_id, force=force)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not row:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    return {"message": "Rol eliminado", "forced": force}


@app.post("/master/database/reset")
def master_reset_database(
    db: Session = Depends(get_db),
    _master: models.User = Depends(auth.require_master),
):
    """Elimina todos los datos y deja solo el usuario master."""
    try:
        return db_reset.reset_to_master_only(db)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo resetear la base: {exc}")


@app.post("/master/roles/reset")
def master_reset_roles(
    force: bool = Query(False),
    db: Session = Depends(get_db),
    _master: models.User = Depends(auth.require_master),
):
    return crud.reset_roles_catalog(db, force=force)


def _resolve_sede_ids(
    sede_id: Optional[int],
    sede_ids: Optional[List[int]],
) -> Optional[List[int]]:
    if sede_ids:
        return sede_ids
    if sede_id is not None:
        return [sede_id]
    return None


@app.get("/stats/orders-by-sede")
def get_stats_orders(
    sede_id: Optional[int] = None,
    sede_ids: Optional[List[int]] = Query(None),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
):
    result = crud.get_stats_orders_by_sede(
        db,
        sede_ids=_resolve_sede_ids(sede_id, sede_ids),
        date_from=_parse_stats_date(date_from),
        date_to=_parse_stats_date(date_to),
    )
    return [{"name": r[0], "count": r[1]} for r in result]


@app.get("/stats/orders-by-estado")
def get_stats_orders_by_estado(
    sede_id: int,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
):
    result = crud.get_stats_orders_by_estado(
        db,
        sede_id=sede_id,
        date_from=_parse_stats_date(date_from),
        date_to=_parse_stats_date(date_to),
    )
    labels = {
        "pendiente": "Pendiente",
        "en_proceso": "En proceso",
        "finalizado": "Finalizado",
    }
    return [
        {"name": labels.get(r[0].value if hasattr(r[0], "value") else str(r[0]), str(r[0])), "count": r[1]}
        for r in result
    ]


@app.get("/stats/top-cuts")
def get_stats_cuts(
    sede_id: Optional[int] = None,
    sede_ids: Optional[List[int]] = Query(None),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
):
    result = crud.get_stats_top_cuts(
        db,
        sede_ids=_resolve_sede_ids(sede_id, sede_ids),
        date_from=_parse_stats_date(date_from),
        date_to=_parse_stats_date(date_to),
    )
    return [{"name": r[0], "total_kg": float(r[1] or 0)} for r in result]

def _pedidos_to_schema_list(pedidos) -> list[schemas.Pedido]:
    return [schemas.Pedido.model_validate(p) for p in pedidos]


@app.get("/pedidos", response_model=List[schemas.Pedido])
def read_pedidos(sede_id: str = None, db: Session = Depends(get_db)):
    try:
        if sede_id:
            pedidos = crud.get_pedidos_by_sede(db, sede_id)
        else:
            pedidos = crud.get_all_pedidos(db)
        return _pedidos_to_schema_list(pedidos)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error al cargar pedidos: {exc}")

@app.post("/pedidos", response_model=schemas.Pedido)
async def create_pedido_endpoint(pedido: schemas.PedidoCreate, db: Session = Depends(get_db)):
    try:
        db_pedido = crud.create_pedido(db=db, pedido=pedido)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    # Notify Butcher in the same sede
    payload = schemas.Pedido.model_validate(db_pedido).model_dump(mode='json')
    await _emit_pedido_rooms("new_order", payload, db_pedido.sede_id)
    return db_pedido

@app.put("/pedidos/{pedido_id}/estado", response_model=schemas.Pedido)
async def update_pedido_estado_endpoint(pedido_id: int, estado: str, carnicero_id: Optional[int] = None, db: Session = Depends(get_db)):
    prev = crud._get_pedido_loaded(db, pedido_id)
    prev_estado = str(prev.estado) if prev else None
    db_pedido = crud.update_pedido_estado(db=db, pedido_id=pedido_id, estado=estado, carnicero_id=carnicero_id)
    if not db_pedido:
        raise HTTPException(status_code=404, detail="Pedido not found")
    if db_pedido.origen == "cliente" and str(estado) != prev_estado:
        notifications.send_pedido_status_notification(db, db_pedido, str(estado))
    payload = schemas.Pedido.model_validate(db_pedido).model_dump(mode='json')
    await _emit_pedido_rooms("order_update", payload, db_pedido.sede_id)
    return db_pedido

@app.put("/pedidos/{pedido_id}/problema", response_model=schemas.Pedido)
async def report_pedido_problema_endpoint(
    pedido_id: int,
    db: Session = Depends(get_db),
    problema: Optional[str] = Query(None, description="Texto del reporte (legacy; preferir cuerpo JSON)"),
    body: Optional[schemas.PedidoProblemaReport] = Body(default=None),
):
    texto = (body.problema if body else None) or problema
    if texto is None or not str(texto).strip():
        raise HTTPException(status_code=400, detail="El texto del problema es obligatorio")
    db_pedido = crud.report_pedido_problema(db=db, pedido_id=pedido_id, problema=str(texto).strip())
    if not db_pedido:
        raise HTTPException(status_code=404, detail="Pedido not found")

    payload = schemas.Pedido.model_validate(db_pedido).model_dump(mode="json")
    await _emit_pedido_rooms("order_update", payload, db_pedido.sede_id)
    await _emit_pedido_rooms(
        "order_problem",
        {"pedido_id": pedido_id, "problema": str(texto).strip()},
        db_pedido.sede_id,
    )

    return db_pedido


@app.put("/pedidos/{pedido_id}/problema/respuesta", response_model=schemas.Pedido)
async def respond_pedido_problema_endpoint(
    pedido_id: int,
    body: schemas.PedidoProblemaRespuesta,
    db: Session = Depends(get_db),
):
    respuesta = (body.respuesta or "").strip()
    if not respuesta:
        raise HTTPException(status_code=400, detail="La respuesta del reporte es obligatoria")

    db_pedido = crud.respond_pedido_problema(db=db, pedido_id=pedido_id, respuesta=respuesta)
    if not db_pedido:
        raise HTTPException(status_code=404, detail="Pedido not found")

    payload = schemas.Pedido.model_validate(db_pedido).model_dump(mode="json")
    await _emit_pedido_rooms("order_update", payload, db_pedido.sede_id)
    await _emit_pedido_rooms(
        "order_problem",
        {"pedido_id": pedido_id, "problema_respuesta": respuesta},
        db_pedido.sede_id,
    )

    return db_pedido

# Butcher Availability Endpoints
@app.get("/butchers/sede/{sede_id}", response_model=List[schemas.User])
def get_butchers_for_sede(sede_id: str, db: Session = Depends(get_db)):
    """Get all butchers for a specific sede"""
    return crud.get_butchers_by_sede(db, sede_id)

@app.get("/availability/{sede_id}/{date}")
def get_availability(sede_id: str, date: str, db: Session = Depends(get_db)):
    """Get availability records for a specific sede and date"""
    from datetime import datetime
    date_obj = datetime.strptime(date, "%Y-%m-%d").date()
    availabilities = crud.get_availability_for_date(db, sede_id, date_obj)
    return [schemas.ButcherAvailability.model_validate(a).model_dump(mode='json') for a in availabilities]

@app.post("/availability")
async def set_availability_bulk(data: schemas.ButcherAvailabilityBulkUpdate, manager_id: int, sede_id: str, db: Session = Depends(get_db)):
    """Bulk update availability for multiple butchers on a specific date"""
    results = []
    for item in data.availabilities:
        availability = crud.set_butcher_availability(
            db=db,
            butcher_id=item['butcher_id'],
            sede_id=sede_id,
            date=data.date,
            is_available=item['is_available'],
            manager_id=manager_id
        )
        results.append(availability)
    
    # Notify via socket about availability changes
    await sio.emit("availability_update", {
        "sede_id": sede_id,
        "date": str(data.date),
        "count": len(results)
    }, room=f"sede_{sede_id}")
    
    return {"success": True, "updated": len(results)}


@app.get("/admin/backup/status")
def admin_backup_status(_master: models.User = Depends(auth.require_master)):
    """Comprueba si el servidor puede generar respaldos (pg_dump)."""
    return {
        "pg_dump_available": backup.pg_tools_available(),
        "backup_available": backup.backup_available(),
        "backup_method": "pg_dump" if backup.pg_tools_available() else "python",
        "database": backup.get_db_connection_params().database,
    }


@app.get("/admin/backup/download")
def admin_backup_download(_master: models.User = Depends(auth.require_master)):
    """Genera y devuelve un ZIP con estructura BD, datos e imágenes estáticas."""
    try:
        content, filename = backup.build_backup_download()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return Response(
        content=content,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/admin/backup/download/{part}")
def admin_backup_download_part(
    part: str,
    _master: models.User = Depends(auth.require_master),
):
    """Descarga un componente del respaldo: schema, data, static o manifest."""
    try:
        content, filename, media_type = backup.build_backup_part(part)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/admin/report/excel")
def admin_report_excel(
    sede_ids: Optional[List[int]] = Query(None),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    period_label: Optional[str] = None,
    sede_label: Optional[str] = None,
    _admin: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    """Genera reporte Excel del dashboard con los filtros aplicados."""
    parsed_from = _parse_stats_date(date_from)
    parsed_to = _parse_stats_date(date_to)
    if date_from and date_to and parsed_from and parsed_to and parsed_from > parsed_to:
        raise HTTPException(status_code=400, detail="La fecha Desde debe ser anterior o igual a Hasta.")

    resolved_ids = _resolve_sede_ids(None, sede_ids)
    if sede_ids is not None and len(sede_ids) == 0:
        raise HTTPException(status_code=400, detail="Seleccione al menos una sede para el reporte.")

    try:
        content, filename = report_excel.build_dashboard_report(
            db,
            sede_ids=resolved_ids,
            date_from=parsed_from,
            date_to=parsed_to,
            period_label=period_label or "Todo el tiempo",
            sede_label=sede_label or "Todas las sedes",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error al generar reporte: {exc}")

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# Final app definition for ASGI
app = socket_app
