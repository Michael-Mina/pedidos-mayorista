from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from . import models, schemas
from datetime import datetime, timezone

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
        role=models.UserRole.SEDE_BUTCHER,
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
                models.User.role == models.UserRole.SEDE_BUTCHER
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
            models.User.role == models.UserRole.SEDE_BUTCHER
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
    query = db.query(models.Corte)
    if categoria_id:
        query = query.filter(models.Corte.categoria_id == categoria_id)
    return query.all()

def create_corte(db: Session, corte: schemas.CorteBase):
    db_corte = models.Corte(**corte.model_dump())
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

# Analytics
def get_stats_orders_by_sede(db: Session):
    return db.query(
        models.Sede.nombre, 
        func.count(models.Pedido.id).label('count')
    ).join(models.Pedido).group_by(models.Sede.nombre).all()

def get_stats_top_cuts(db: Session):
    return db.query(
        models.Corte.nombre,
        func.sum(models.DetallePedido.cantidad_kg).label('total_kg')
    ).join(models.DetallePedido).group_by(models.Corte.nombre).order_by(func.sum(models.DetallePedido.cantidad_kg).desc()).limit(5).all()

# User Management
def get_users(db: Session):
    return db.query(models.User).filter(
        models.User.role != models.UserRole.CARNICERO,
        models.User.role != models.UserRole.SEDE_BUTCHER
    ).all()

def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()

def update_user(db: Session, user_id: int, user: schemas.UserBase):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if db_user:
        db_user.username = user.username
        db_user.role = user.role
        db_user.sede_id = user.sede_id
        db_user.session_active = user.session_active
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
    return db.query(models.User).filter(
        models.User.role == models.UserRole.CARNICERO,
        models.User.sede_id == sede_id
    ).all()

def delete_user(db: Session, user_id: int):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if db_user:
        db.delete(db_user)
        db.commit()
    return db_user

def create_carnicero(db: Session, carnicero_data, pw_hash: str):
    db_user = models.User(
        username=carnicero_data.username,
        role=models.UserRole.CARNICERO,
        sede_id=carnicero_data.sede_id,
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
    db_user = db.query(models.User).filter(models.User.id == user_id, models.User.role == models.UserRole.CARNICERO).first()
    if db_user:
        db_user.is_available = is_available
        db.commit()
        db.refresh(db_user)
    return db_user

def update_carnicero(db: Session, user_id: int, carnicero_data: schemas.CarniceroUpdate, password_hash: str = None):
    db_user = db.query(models.User).filter(models.User.id == user_id, models.User.role == models.UserRole.CARNICERO).first()
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
def get_pedidos_by_sede(db: Session, sede_id: str):
    return db.query(models.Pedido)\
        .options(
            joinedload(models.Pedido.carnicero),
            joinedload(models.Pedido.mayorista),
            joinedload(models.Pedido.sede),
            joinedload(models.Pedido.detalles).joinedload(models.DetallePedido.corte),
            joinedload(models.Pedido.detalles).joinedload(models.DetallePedido.tipo_corte)
        )\
        .filter(models.Pedido.sede_id == sede_id)\
        .order_by(models.Pedido.updated_at.desc()).all()

def create_pedido(db: Session, pedido: schemas.PedidoCreate):
    db_pedido = models.Pedido(
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
    db.refresh(db_pedido)
    return db_pedido

def update_pedido_estado(db: Session, pedido_id: int, estado: str, carnicero_id: int = None):
    # Load with relationships to ensure returning full object
    db_pedido = db.query(models.Pedido)\
        .options(
            joinedload(models.Pedido.carnicero),
            joinedload(models.Pedido.sede),
            joinedload(models.Pedido.detalles).joinedload(models.DetallePedido.corte),
            joinedload(models.Pedido.detalles).joinedload(models.DetallePedido.tipo_corte)
        )\
        .filter(models.Pedido.id == pedido_id).first()
        
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
        db.refresh(db_pedido)
    return db_pedido

def report_pedido_problema(db: Session, pedido_id: int, problema: str):
    db_pedido = db.query(models.Pedido).filter(models.Pedido.id == pedido_id).first()
    if db_pedido:
        db_pedido.problema_reportado = problema
        db.commit()
        db.refresh(db_pedido)
    return db_pedido

# Butcher Availability CRUD
def get_butchers_by_sede(db: Session, sede_id: str):
    """Get all butchers (carniceros) for a specific sede"""
    return db.query(models.User).filter(
        models.User.role == models.UserRole.CARNICERO,
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
