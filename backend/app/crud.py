from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_
from . import models, schemas, reporte_mensajes, role_catalog
from datetime import datetime, timezone, date, time

# Sede CRUD
def get_sedes(db: Session):
    return db.query(models.Sede).all()

def create_sede(db: Session, sede: schemas.SedeCreate):
    from . import auth
    # Create Sede
    sede_data = sede.model_dump(exclude_none=True, exclude={"password"})
    db_sede = models.Sede(**sede_data)
    db.add(db_sede)
    db.commit()
    db.refresh(db_sede)
    
    # Create associated Tablet User (Sede Name as username)
    pw_hash = auth.get_password_hash(sede.password)
    db_user = models.User(
        username=db_sede.nombre,
        role=models.UserRole.SEDE_BUTCHER.value,
        sede_id=db_sede.id,
        password_hash=pw_hash,
        session_active=0
    )
    db.add(db_user)
    db.commit()
    
    return db_sede

def update_sede(db: Session, sede_id: int, sede: schemas.SedeUpdate):
    from . import auth
    db_sede = db.query(models.Sede).filter(models.Sede.id == sede_id).first()
    if db_sede:
        if sede.nombre: db_sede.nombre = sede.nombre
        if sede.ciudad: db_sede.ciudad = sede.ciudad
        db.commit()
        db.refresh(db_sede)
        
        # Update associated User if password or name provided
        if sede.password or sede.nombre:
            db_user = db.query(models.User).filter(
                models.User.sede_id == sede_id,
                models.User.role == models.UserRole.SEDE_BUTCHER.value
            ).first()
            if db_user:
                if sede.nombre: db_user.username = sede.nombre
                if sede.password: db_user.password_hash = auth.get_password_hash(sede.password)
                db.commit()
    return db_sede

def delete_sede(db: Session, sede_id: int):
    db_sede = db.query(models.Sede).filter(models.Sede.id == sede_id).first()
    if db_sede:
        # Delete associated tablet user (by sede_id for safety)
        db.query(models.User).filter(
            models.User.sede_id == sede_id,
            models.User.role == models.UserRole.SEDE_BUTCHER.value
        ).delete()
        
        db.delete(db_sede)
        db.commit()
    return db_sede

# Category CRUD
def get_categories(db: Session):
    return db.query(models.Categoria).order_by(models.Categoria.popularidad_score.desc()).all()

def create_category(db: Session, cat: schemas.CategoriaBase):
    db_cat = models.Categoria(**cat.model_dump())
    db.add(db_cat)
    db.commit()
    db.refresh(db_cat)
    return db_cat

def update_category(db: Session, cat_id: int, cat: schemas.CategoriaBase):
    db_cat = db.query(models.Categoria).filter(models.Categoria.id == cat_id).first()
    if db_cat:
        db_cat.nombre = cat.nombre
        db_cat.imagen_url = cat.imagen_url
        db.commit()
        db.refresh(db_cat)
    return db_cat

def delete_category(db: Session, cat_id: int):
    db_cat = db.query(models.Categoria).filter(models.Categoria.id == cat_id).first()
    if db_cat:
        db.delete(db_cat)
        db.commit()
    return db_cat

# Cuts CRUD
def get_cortes(db: Session, categoria_id: int = None):
    query = db.query(models.Corte).options(joinedload(models.Corte.tipos_corte))
    if categoria_id:
        query = query.filter(models.Corte.categoria_id == categoria_id)
    return query.all()

def create_corte(db: Session, corte: schemas.CorteBase):
    corte_data = corte.model_dump(exclude={"tipos_corte_ids"})
    db_corte = models.Corte(**corte_data)
    
    if corte.tipos_corte_ids:
        tipos = db.query(models.TipoCorte).filter(models.TipoCorte.id.in_(corte.tipos_corte_ids)).all()
        db_corte.tipos_corte = tipos
        
    db.add(db_corte)
    db.commit()
    db.refresh(db_corte)
    return db_corte

def update_corte(db: Session, corte_id: int, corte: schemas.CorteBase):
    db_corte = db.query(models.Corte).filter(models.Corte.id == corte_id).first()
    if db_corte:
        db_corte.nombre = corte.nombre
        db_corte.categoria_id = corte.categoria_id
        db_corte.imagen_url = corte.imagen_url
        
        if corte.tipos_corte_ids is not None:
            tipos = db.query(models.TipoCorte).filter(models.TipoCorte.id.in_(corte.tipos_corte_ids)).all()
            db_corte.tipos_corte = tipos
            
        db.commit()
        db.refresh(db_corte)
    return db_corte

def delete_corte(db: Session, corte_id: int):
    db_corte = db.query(models.Corte).filter(models.Corte.id == corte_id).first()
    if db_corte:
        db.delete(db_corte)
        db.commit()
    return db_corte

def get_tipos_corte(db: Session):
    return db.query(models.TipoCorte).all()

def create_tipo_corte(db: Session, tipo: schemas.TipoCorteBase):
    db_tipo = models.TipoCorte(**tipo.model_dump())
    db.add(db_tipo)
    db.commit()
    db.refresh(db_tipo)
    return db_tipo

def update_tipo_corte(db: Session, tipo_id: int, tipo: schemas.TipoCorteBase):
    db_tipo = db.query(models.TipoCorte).filter(models.TipoCorte.id == tipo_id).first()
    if db_tipo:
        db_tipo.nombre = tipo.nombre
        db.commit()
        db.refresh(db_tipo)
    return db_tipo

def delete_tipo_corte(db: Session, tipo_id: int):
    db_tipo = db.query(models.TipoCorte).filter(models.TipoCorte.id == tipo_id).first()
    if db_tipo:
        db.delete(db_tipo)
        db.commit()
    return db_tipo

# Analytics
def _pedido_timestamp_bounds(date_from: date | None, date_to: date | None) -> tuple[datetime | None, datetime | None]:
    start = datetime.combine(date_from, time.min, tzinfo=timezone.utc) if date_from else None
    end = datetime.combine(date_to, time.max, tzinfo=timezone.utc) if date_to else None
    return start, end


def _pedido_join_conditions(date_from: date | None = None, date_to: date | None = None):
    conditions = [models.Pedido.sede_id == models.Sede.id]
    start, end = _pedido_timestamp_bounds(date_from, date_to)
    if start is not None:
        conditions.append(models.Pedido.timestamp >= start)
    if end is not None:
        conditions.append(models.Pedido.timestamp <= end)
    return and_(*conditions)


def _apply_pedido_date_filter(q, date_from: date | None = None, date_to: date | None = None):
    start, end = _pedido_timestamp_bounds(date_from, date_to)
    if start is not None:
        q = q.filter(models.Pedido.timestamp >= start)
    if end is not None:
        q = q.filter(models.Pedido.timestamp <= end)
    return q


def get_stats_orders_by_sede(
    db: Session,
    sede_ids: list[int] | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    q = (
        db.query(
            models.Sede.nombre,
            func.count(models.Pedido.id).label("count"),
        )
        .outerjoin(models.Pedido, _pedido_join_conditions(date_from, date_to))
    )
    if sede_ids:
        q = q.filter(models.Sede.id.in_(sede_ids))
    return q.group_by(models.Sede.id, models.Sede.nombre).order_by(models.Sede.nombre).all()


def get_stats_orders_by_estado(
    db: Session,
    sede_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
):
    q = db.query(
        models.Pedido.estado,
        func.count(models.Pedido.id).label("count"),
    ).filter(models.Pedido.sede_id == sede_id)
    q = _apply_pedido_date_filter(q, date_from, date_to)
    return q.group_by(models.Pedido.estado).all()


def get_stats_top_cuts(
    db: Session,
    sede_ids: list[int] | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 5,
):
    q = (
        db.query(
            models.Corte.nombre,
            func.sum(models.DetallePedido.cantidad_kg).label("total_kg"),
        )
        .join(models.DetallePedido, models.DetallePedido.corte_id == models.Corte.id)
        .join(models.Pedido, models.DetallePedido.pedido_id == models.Pedido.id)
    )
    if sede_ids:
        q = q.filter(models.Pedido.sede_id.in_(sede_ids))
    q = _apply_pedido_date_filter(q, date_from, date_to)
    return (
        q.group_by(models.Corte.nombre)
        .order_by(func.sum(models.DetallePedido.cantidad_kg).desc())
        .limit(limit)
        .all()
    )


_REPORT_PEDIDO_LOAD = (
    joinedload(models.Pedido.carnicero),
    joinedload(models.Pedido.mayorista),
    joinedload(models.Pedido.sede),
    joinedload(models.Pedido.detalles).joinedload(models.DetallePedido.corte).joinedload(models.Corte.categoria),
    joinedload(models.Pedido.detalles).joinedload(models.DetallePedido.tipo_corte),
)


def get_pedidos_for_report(
    db: Session,
    sede_ids: list[int] | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int | None = 10000,
):
    q = db.query(models.Pedido).options(*_REPORT_PEDIDO_LOAD)
    if sede_ids:
        q = q.filter(models.Pedido.sede_id.in_(sede_ids))
    q = _apply_pedido_date_filter(q, date_from, date_to)
    q = q.order_by(models.Pedido.timestamp.desc())
    if limit:
        q = q.limit(limit)
    return q.all()


_ESTADO_LABELS = {
    "pendiente": "Pendiente",
    "en_proceso": "En proceso",
    "finalizado": "Finalizado",
}


def gather_dashboard_report_data(
    db: Session,
    sede_ids: list[int] | None,
    date_from: date | None,
    date_to: date | None,
):
    """Agrega datos del dashboard para reporte Excel."""
    sede_rows = get_stats_orders_by_sede(db, sede_ids=sede_ids, date_from=date_from, date_to=date_to)
    top_cuts = get_stats_top_cuts(db, sede_ids=sede_ids, date_from=date_from, date_to=date_to, limit=10)
    orders_by_estado = []
    if sede_ids and len(sede_ids) == 1:
        raw = get_stats_orders_by_estado(db, sede_id=sede_ids[0], date_from=date_from, date_to=date_to)
        for estado, count in raw:
            key = estado.value if hasattr(estado, "value") else str(estado)
            orders_by_estado.append({"name": _ESTADO_LABELS.get(key, key), "count": count})

    sede_orders = [{"name": r[0], "count": r[1]} for r in sede_rows]
    cuts = [{"name": r[0], "total_kg": float(r[1] or 0)} for r in top_cuts]
    total_pedidos = sum(s["count"] for s in sede_orders)

    all_sedes = get_sedes(db)
    users = get_users(db)
    sede_names = (
        [s.nombre for s in all_sedes if s.id in sede_ids]
        if sede_ids
        else [s.nombre for s in all_sedes]
    )
    mayoristas = [
        u for u in users
        if u.role == models.UserRole.MAYORISTA.value
        and (not sede_ids or u.sede_id in sede_ids)
    ]
    ciudades = list({s.ciudad for s in all_sedes if s.ciudad and (not sede_ids or s.id in sede_ids)})

    pedidos = get_pedidos_for_report(db, sede_ids=sede_ids, date_from=date_from, date_to=date_to)
    total_kg_all = sum(
        sum(d.cantidad_kg or 0 for d in (p.detalles or []))
        for p in pedidos
    )

    return {
        "sede_orders": sede_orders,
        "orders_by_estado": orders_by_estado,
        "top_cuts": cuts,
        "total_pedidos": total_pedidos,
        "total_kg": total_kg_all,
        "avg_kg": round(total_kg_all / total_pedidos, 2) if total_pedidos else 0,
        "mayoristas_count": len(mayoristas),
        "ciudades_count": len(ciudades),
        "ciudades": ciudades,
        "sede_names": sede_names,
        "pedidos": pedidos,
    }

# User Management
def get_users(db: Session):
    """Usuarios asignables desde el panel admin (sin carniceros ni tablet sede)."""
    exclude = role_catalog.excluded_role_codes_for_user_list(db)
    return [
        u
        for u in db.query(models.User).all()
        if role_catalog.normalize_role_code(u.role or "") not in exclude
    ]

def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()


def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()


def update_user(db: Session, user_id: int, user: schemas.UserBase, password_hash: str | None = None):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        return None
    if role_catalog.role_is_excluded_from_user_list(db, db_user.role):
        raise ValueError("Este tipo de cuenta no se gestiona desde Usuarios")
    validate_assignable_role(db, user.role)

    duplicate = (
        db.query(models.User)
        .filter(models.User.username == user.username, models.User.id != user_id)
        .first()
    )
    if duplicate:
        raise ValueError("El nombre de usuario ya está registrado")

    db_user.username = user.username
    db_user.role = user.role
    db_user.sede_id = int(user.sede_id)
    if user.session_active is not None:
        db_user.session_active = user.session_active
    if password_hash:
        db_user.password_hash = password_hash

    db.commit()
    db.refresh(db_user)
    return db_user

def update_session_status(db: Session, user_id: int, active: int):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if db_user:
        db_user.session_active = active
        db.commit()
        db.refresh(db_user)
    return db_user

def get_carniceros_by_sede(db: Session, sede_id: str):
    sid = int(sede_id)
    return (
        db.query(models.User)
        .filter(
            models.User.role == models.UserRole.CARNICERO.value,
            models.User.sede_id == sid,
        )
        .all()
    )

def delete_user(db: Session, user_id: int):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if db_user:
        if role_catalog.role_is_excluded_from_user_list(db, db_user.role):
            raise ValueError("Este tipo de cuenta no se elimina desde Usuarios")
        db.delete(db_user)
        db.commit()
    return db_user

def create_carnicero(db: Session, carnicero_data, pw_hash: str):
    role_catalog.ensure_operational_roles(db)
    username = (carnicero_data.username or carnicero_data.numero_carnicero or "").strip()
    if not username:
        raise ValueError("El número de carnicero es obligatorio")
    if not carnicero_data.sede_id:
        raise ValueError("La sede es obligatoria")
    db_user = models.User(
        username=username,
        role=models.UserRole.CARNICERO.value,
        sede_id=int(carnicero_data.sede_id),
        nombre=carnicero_data.nombre,
        apellido=carnicero_data.apellido,
        numero_carnicero=carnicero_data.numero_carnicero,
        is_available=carnicero_data.is_available,
        password_hash=pw_hash
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_carnicero_availability(db: Session, user_id: int, is_available: bool):
    db_user = db.query(models.User).filter(models.User.id == user_id, models.User.role == models.UserRole.CARNICERO.value).first()
    if db_user:
        db_user.is_available = is_available
        db.commit()
        db.refresh(db_user)
    return db_user

def update_carnicero(db: Session, user_id: int, carnicero_data: schemas.CarniceroUpdate, password_hash: str = None):
    db_user = db.query(models.User).filter(models.User.id == user_id, models.User.role == models.UserRole.CARNICERO.value).first()
    if db_user:
        if carnicero_data.nombre is not None:
            db_user.nombre = carnicero_data.nombre
        if carnicero_data.apellido is not None:
            db_user.apellido = carnicero_data.apellido
        if carnicero_data.numero_carnicero is not None:
            db_user.numero_carnicero = carnicero_data.numero_carnicero
            db_user.username = carnicero_data.numero_carnicero # Sincronizar usuario
        if carnicero_data.is_available is not None:
            db_user.is_available = carnicero_data.is_available
        if password_hash:
            db_user.password_hash = password_hash
            
        db.commit()
        db.refresh(db_user)
    return db_user

# Pedido CRUD
_PEDIDO_LOAD_OPTIONS = (
    joinedload(models.Pedido.carnicero),
    joinedload(models.Pedido.mayorista),
    joinedload(models.Pedido.sede),
    joinedload(models.Pedido.detalles).joinedload(models.DetallePedido.corte),
    joinedload(models.Pedido.detalles).joinedload(models.DetallePedido.tipo_corte),
)


def _get_pedido_loaded(db: Session, pedido_id: int):
    return (
        db.query(models.Pedido)
        .options(*_PEDIDO_LOAD_OPTIONS)
        .filter(models.Pedido.id == pedido_id)
        .first()
    )


def get_pedidos_by_sede(db: Session, sede_id: str):
    sid = int(sede_id)
    return (
        db.query(models.Pedido)
        .options(*_PEDIDO_LOAD_OPTIONS)
        .filter(models.Pedido.sede_id == sid)
        .order_by(models.Pedido.updated_at.desc())
        .all()
    )


def get_all_pedidos(db: Session):
    return (
        db.query(models.Pedido)
        .options(*_PEDIDO_LOAD_OPTIONS)
        .order_by(models.Pedido.updated_at.desc())
        .all()
    )

def _parse_numero_pedido(value: str | None) -> int | None:
    if value is None:
        return None

    text = str(value).strip()
    if text.isdigit():
        return int(text)

    try:
        return int(text.split("-")[-1])
    except (TypeError, ValueError):
        return None

def _next_numero_pedido(db: Session, sede_id: int) -> str:
    """Consecutivo global por sede (no se reinicia cada día)."""
    numeros = (
        db.query(models.Pedido.numero_pedido)
        .filter(
            models.Pedido.sede_id == sede_id,
            models.Pedido.numero_pedido.isnot(None),
        )
        .all()
    )

    max_seq = 0
    for (numero_pedido,) in numeros:
        seq = _parse_numero_pedido(numero_pedido)
        if seq is not None:
            max_seq = max(max_seq, seq)

    return str(max_seq + 1)

def create_pedido(db: Session, pedido: schemas.PedidoCreate):
    numero_pedido = _next_numero_pedido(db, pedido.sede_id)

    db_pedido = models.Pedido(
        numero_pedido=numero_pedido,
        mayorista_id=pedido.mayorista_id,
        cliente_nombre=pedido.cliente_nombre,
        sede_id=pedido.sede_id,
        observaciones=pedido.observaciones,
        estado=models.PedidoEstado.PENDIENTE
    )
    db.add(db_pedido)
    db.commit()
    db.refresh(db_pedido)
    
    for detalle in pedido.detalles:
        db_detalle = models.DetallePedido(
            pedido_id=db_pedido.id,
            corte_id=detalle.corte_id,
            tipo_corte_id=detalle.tipo_corte_id,
            cantidad_kg=detalle.cantidad_kg,
            observaciones=detalle.observaciones
        )
        db.add(db_detalle)
    
    db.commit()
    return _get_pedido_loaded(db, db_pedido.id)

def update_pedido_estado(db: Session, pedido_id: int, estado: str, carnicero_id: int = None):
    db_pedido = _get_pedido_loaded(db, pedido_id)
        
    if db_pedido:
        db_pedido.estado = estado
        if carnicero_id:
            db_pedido.carnicero_id = carnicero_id
        
        # Record timestamps
        now = datetime.now(timezone.utc)
        if str(estado) == "en_proceso" and not db_pedido.started_at:
            db_pedido.started_at = now
        elif str(estado) == "finalizado" and not db_pedido.finished_at:
            db_pedido.finished_at = now
            
        db.commit()
        return _get_pedido_loaded(db, pedido_id)
    return None

def report_pedido_problema(db: Session, pedido_id: int, problema: str):
    db_pedido = db.query(models.Pedido).filter(models.Pedido.id == pedido_id).first()
    if not db_pedido:
        return None
    reporte_mensajes.agregar_mensaje_reporte(db_pedido, "mayorista", problema)
    db.commit()
    return (
        db.query(models.Pedido)
        .options(
            joinedload(models.Pedido.carnicero),
            joinedload(models.Pedido.mayorista),
            joinedload(models.Pedido.sede),
            joinedload(models.Pedido.detalles).joinedload(models.DetallePedido.corte),
            joinedload(models.Pedido.detalles).joinedload(models.DetallePedido.tipo_corte),
        )
        .filter(models.Pedido.id == pedido_id)
        .first()
    )

def respond_pedido_problema(db: Session, pedido_id: int, respuesta: str):
    db_pedido = db.query(models.Pedido).filter(models.Pedido.id == pedido_id).first()
    if not db_pedido:
        return None

    reporte_mensajes.agregar_mensaje_reporte(db_pedido, "carniceria", respuesta)
    db.commit()

    return (
        db.query(models.Pedido)
        .options(
            joinedload(models.Pedido.carnicero),
            joinedload(models.Pedido.mayorista),
            joinedload(models.Pedido.sede),
            joinedload(models.Pedido.detalles).joinedload(models.DetallePedido.corte),
            joinedload(models.Pedido.detalles).joinedload(models.DetallePedido.tipo_corte),
        )
        .filter(models.Pedido.id == pedido_id)
        .first()
    )

# Butcher Availability CRUD
def get_butchers_by_sede(db: Session, sede_id: str):
    """Get all butchers (carniceros) for a specific sede"""
    return db.query(models.User).filter(
        models.User.role == models.UserRole.CARNICERO.value,
        models.User.sede_id == sede_id
    ).all()

def get_availability_for_date(db: Session, sede_id: str, date):
    """Get all availability records for a specific sede and date"""
    return db.query(models.ButcherAvailability).filter(
        models.ButcherAvailability.sede_id == sede_id,
        models.ButcherAvailability.date == date
    ).all()

def set_butcher_availability(db: Session, butcher_id: int, sede_id: str, date, is_available: bool, manager_id: int):
    """Set or update availability for a butcher on a specific date"""
    # Check if record exists
    existing = db.query(models.ButcherAvailability).filter(
        models.ButcherAvailability.butcher_id == butcher_id,
        models.ButcherAvailability.date == date
    ).first()
    
    if existing:
        # Update existing record
        existing.is_available = is_available
        existing.set_by_manager_id = manager_id
        db.commit()
        db.refresh(existing)
        return existing
    else:
        # Create new record
        new_availability = models.ButcherAvailability(
            butcher_id=butcher_id,
            sede_id=sede_id,
            date=date,
            is_available=is_available,
            set_by_manager_id=manager_id
        )
        db.add(new_availability)
        db.commit()
        db.refresh(new_availability)
        return new_availability

def get_available_butchers_for_date(db: Session, sede_id: str, date):
    """Get list of available butchers for a specific date"""
    return db.query(models.User).join(
        models.ButcherAvailability,
        models.User.id == models.ButcherAvailability.butcher_id
    ).filter(
        models.ButcherAvailability.sede_id == sede_id,
        models.ButcherAvailability.date == date,
        models.ButcherAvailability.is_available == True
    ).all()

def check_butcher_available_today(db: Session, butcher_id: int):
    """Check if a butcher is marked as available for today"""
    from datetime import date
    today = date.today()
    
    availability = db.query(models.ButcherAvailability).filter(
        models.ButcherAvailability.butcher_id == butcher_id,
        models.ButcherAvailability.date == today,
        models.ButcherAvailability.is_available == True
    ).first()
    
    return availability is not None


# App roles (catálogo — gestión master)
def create_app_role(db: Session, *, code: str, label: str, panel: str, can_assign: bool = True):
    code = role_catalog.normalize_role_code(code)
    if not code:
        raise ValueError("Código de rol inválido")
    if db.query(models.AppRole).filter(models.AppRole.code == code).first():
        raise ValueError("Ya existe un rol con ese código")
    if panel not in ("admin", "mayorista", "jefe", "sede"):
        raise ValueError("Panel inválido")
    row = models.AppRole(
        code=code,
        label=label.strip(),
        panel=panel,
        is_system=False,
        is_hidden=False,
        can_assign=can_assign,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_app_role(
    db: Session,
    role_id: int,
    *,
    label: str | None = None,
    panel: str | None = None,
    can_assign: bool | None = None,
    is_enabled: bool | None = None,
):
    row = db.query(models.AppRole).filter(models.AppRole.id == role_id).first()
    if not row:
        return None

    if row.code == models.UserRole.MASTER.value:
        if is_enabled is not None and not is_enabled:
            raise ValueError("No se puede deshabilitar el rol master")
        if panel is not None and panel != row.panel:
            raise ValueError("No se puede cambiar el panel del rol master")
        if can_assign is not None and not can_assign:
            raise ValueError("No se puede quitar asignación del rol master")
        if label is not None:
            row.label = label.strip()
    else:
        if label is not None:
            row.label = label.strip()
        if panel is not None:
            if panel not in ("admin", "mayorista", "jefe", "sede"):
                raise ValueError("Panel inválido")
            row.panel = panel
        if can_assign is not None:
            row.can_assign = can_assign
        if is_enabled is not None:
            row.is_enabled = is_enabled

    db.commit()
    db.refresh(row)
    return row


def delete_users_with_role(db: Session, role_code: str) -> int:
    """Elimina usuarios con ese rol (p. ej. carniceros). Limpia referencias en pedidos."""
    code = role_catalog.normalize_role_code(role_code)
    users = db.query(models.User).filter(models.User.role == code).all()
    if not users:
        return 0
    user_ids = [u.id for u in users]
    db.query(models.ButcherAvailability).filter(
        models.ButcherAvailability.butcher_id.in_(user_ids)
    ).delete(synchronize_session=False)
    db.query(models.Pedido).filter(models.Pedido.carnicero_id.in_(user_ids)).update(
        {models.Pedido.carnicero_id: None},
        synchronize_session=False,
    )
    return db.query(models.User).filter(models.User.id.in_(user_ids)).delete(synchronize_session=False)


def delete_app_role(db: Session, role_id: int, *, force: bool = False):
    row = db.query(models.AppRole).filter(models.AppRole.id == role_id).first()
    if not row:
        return None
    if row.code == models.UserRole.MASTER.value:
        raise ValueError("No se puede eliminar el rol master")
    in_use = db.query(models.User).filter(models.User.role == row.code).count()
    if in_use > 0:
        if not force:
            hint = ""
            if role_catalog.normalize_role_code(row.code) in role_catalog.OPERATIONAL_ROLE_CODES:
                hint = " Son cuentas de operación (carniceros/tablet); use eliminar forzado."
            raise ValueError(
                f"Hay {in_use} usuario(s) con este rol. Reasígnelos, elimínelos o use eliminación forzada.{hint}"
            )
        delete_users_with_role(db, row.code)
    db.delete(row)
    db.commit()
    return row


def reset_roles_catalog(db: Session, *, force: bool = False) -> dict:
    """Elimina todos los roles excepto master."""
    deleted: list[str] = []
    skipped: list[dict] = []
    users_removed = 0
    for row in db.query(models.AppRole).filter(models.AppRole.code != models.UserRole.MASTER.value).all():
        in_use = db.query(models.User).filter(models.User.role == row.code).count()
        if in_use > 0 and not force:
            skipped.append({"code": row.code, "label": row.label, "users": in_use})
            continue
        if in_use > 0:
            users_removed += delete_users_with_role(db, row.code)
        deleted.append(row.code)
        db.delete(row)
    db.commit()
    return {"deleted": deleted, "skipped": skipped, "users_removed": users_removed}


def validate_assignable_role(db: Session, role_code: str) -> models.AppRole:
    row = role_catalog.get_role_row(db, role_code)
    if not row:
        raise ValueError("Rol no registrado")
    if not row.is_enabled:
        raise ValueError("Este rol está deshabilitado")
    if not row.can_assign or row.is_hidden:
        raise ValueError("Este rol no puede asignarse desde el panel")
    return row
