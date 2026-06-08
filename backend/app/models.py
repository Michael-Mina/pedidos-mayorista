from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Enum, Text, Date, Boolean, UniqueConstraint, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
import enum

corte_tipocorte_association = Table(
    'corte_tipocorte', Base.metadata,
    Column('corte_id', Integer, ForeignKey('cortes.id', ondelete="CASCADE")),
    Column('tipo_corte_id', Integer, ForeignKey('tipos_corte.id', ondelete="CASCADE"))
)
class UserRole(str, enum.Enum):
    """Códigos de rol conocidos (también existen roles personalizados en app_roles)."""
    ADMIN = "admin"
    MASTER = "master"
    MAYORISTA = "mayorista"
    CARNICERO = "carnicero"
    JEFE_CARNES = "jefe_carnes"
    SEDE_BUTCHER = "sede_butcher"


class RolePanel(str, enum.Enum):
    ADMIN = "admin"
    MAYORISTA = "mayorista"
    JEFE = "jefe"
    SEDE = "sede"


class AppRole(Base):
    __tablename__ = "app_roles"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(48), unique=True, index=True, nullable=False)
    label = Column(String(120), nullable=False)
    panel = Column(String(24), nullable=False, default="mayorista")
    is_system = Column(Boolean, default=False)
    is_hidden = Column(Boolean, default=False)
    can_assign = Column(Boolean, default=True)
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PedidoEstado(str, enum.Enum):
    PENDIENTE = "pendiente"
    EN_PROCESO = "en_proceso"
    FINALIZADO = "finalizado"


class TurnoEstado(str, enum.Enum):
    ESPERANDO = "esperando"
    EN_ATENCION = "en_atencion"
    ATENDIDO = "atendido"


class Sede(Base):
    __tablename__ = "sedes"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, unique=True, index=True)
    ciudad = Column(String)
    slug = Column(String, unique=True, index=True, nullable=True)
    notificacion_canal = Column(String, default="ambos", nullable=False)
    whatsapp_telefono = Column(String, nullable=True)
    ultramsg_instance_id = Column(String, nullable=True)
    ultramsg_token = Column(String, nullable=True)

    users = relationship("User", back_populates="sede")
    pedidos = relationship("Pedido", back_populates="sede")
    turnos = relationship("TurnoTicket", back_populates="sede")

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    role = Column(String(48), index=True, nullable=False)
    sede_id = Column(Integer, ForeignKey("sedes.id"))
    
    # Nuevos campos para Carnicero / Empleados
    nombre = Column(String, nullable=True)
    apellido = Column(String, nullable=True)
    numero_carnicero = Column(String, nullable=True)
    is_available = Column(Boolean, default=True)
    
    session_approved = Column(Integer, default=1) # 1 for auto-approved, 0 for pending?
    # Actually, the user wants Jefe to approve.
    # Let's use Boolean or Integer. 
    session_active = Column(Integer, default=0) # 0: inactive/waiting, 1: active

    sede = relationship("Sede", back_populates="users")
    pedidos_mayorista = relationship("Pedido", foreign_keys="Pedido.mayorista_id", back_populates="mayorista")
    pedidos_carnicero = relationship("Pedido", foreign_keys="Pedido.carnicero_id", back_populates="carnicero")

class Categoria(Base):
    __tablename__ = "categorias"
    id = Column(Integer, primary_key=True, index=True)
    sede_id = Column(Integer, ForeignKey("sedes.id"), nullable=False, index=True)
    nombre = Column(String, index=True)
    imagen_url = Column(String, nullable=True)
    popularidad_score = Column(Float, default=0.0)

    sede = relationship("Sede", backref="categorias")
    cortes = relationship("Corte", back_populates="categoria")

    __table_args__ = (UniqueConstraint("sede_id", "nombre", name="uq_categoria_sede_nombre"),)

class Corte(Base):
    __tablename__ = "cortes"
    id = Column(Integer, primary_key=True, index=True)
    sede_id = Column(Integer, ForeignKey("sedes.id"), nullable=False, index=True)
    categoria_id = Column(Integer, ForeignKey("categorias.id"))
    nombre = Column(String, index=True)
    imagen_url = Column(String, nullable=True)

    sede = relationship("Sede", backref="cortes")
    categoria = relationship("Categoria", back_populates="cortes")
    detalles = relationship("DetallePedido", back_populates="corte")
    tipos_corte = relationship("TipoCorte", secondary=corte_tipocorte_association, backref="cortes")

class TipoCorte(Base):
    __tablename__ = "tipos_corte"
    id = Column(Integer, primary_key=True, index=True)
    sede_id = Column(Integer, ForeignKey("sedes.id"), nullable=False, index=True)
    nombre = Column(String, index=True)

    sede = relationship("Sede", backref="tipos_corte")
    detalles = relationship("DetallePedido", back_populates="tipo_corte")

    __table_args__ = (UniqueConstraint("sede_id", "nombre", name="uq_tipo_corte_sede_nombre"),)

class Pedido(Base):
    __tablename__ = "pedidos"
    id = Column(Integer, primary_key=True, index=True)
    numero_pedido = Column(String, index=True, nullable=True)  # Consecutivo por sede: 1, 2, 3... (sin reinicio diario)
    mayorista_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    carnicero_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    cliente_nombre = Column(String)
    cliente_telefono = Column(String, nullable=True)
    origen = Column(String, default="mayorista", nullable=False)
    estado = Column(Enum(PedidoEstado), default=PedidoEstado.PENDIENTE)
    sede_id = Column(Integer, ForeignKey("sedes.id"))
    observaciones = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    problema_reportado = Column(Text, nullable=True)
    problema_respuesta = Column(Text, nullable=True)
    reporte_mensajes = Column(Text, nullable=True)  # JSON: [{rol, texto, at}, ...]

    mayorista = relationship("User", foreign_keys=[mayorista_id], back_populates="pedidos_mayorista")
    carnicero = relationship("User", foreign_keys=[carnicero_id], back_populates="pedidos_carnicero")
    sede = relationship("Sede", back_populates="pedidos")
    detalles = relationship("DetallePedido", back_populates="pedido")

class DetallePedido(Base):
    __tablename__ = "detalle_pedidos"
    id = Column(Integer, primary_key=True, index=True)
    pedido_id = Column(Integer, ForeignKey("pedidos.id"))
    corte_id = Column(Integer, ForeignKey("cortes.id"))
    tipo_corte_id = Column(Integer, ForeignKey("tipos_corte.id"))
    cantidad_kg = Column(Float, default=0)
    modo_cantidad = Column(String, nullable=True)  # porciones | kg | null (legacy)
    num_porciones = Column(Integer, nullable=True)
    gramos_porcion = Column(Float, nullable=True)
    observaciones = Column(Text, nullable=True)

    pedido = relationship("Pedido", back_populates="detalles")
    corte = relationship("Corte", back_populates="detalles")
    tipo_corte = relationship("TipoCorte", back_populates="detalles")

class ButcherAvailability(Base):
    __tablename__ = "butcher_availability"
    id = Column(Integer, primary_key=True, index=True)
    butcher_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    sede_id = Column(Integer, ForeignKey("sedes.id"), nullable=False)
    date = Column(Date, nullable=False)
    is_available = Column(Boolean, default=True)
    set_by_manager_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    butcher = relationship("User", foreign_keys=[butcher_id])
    manager = relationship("User", foreign_keys=[set_by_manager_id])
    sede = relationship("Sede")

    # Unique constraint: one record per butcher per date
    __table_args__ = (UniqueConstraint('butcher_id', 'date', name='_butcher_date_uc'),)


class TurnoTicket(Base):
    __tablename__ = "turno_tickets"
    id = Column(Integer, primary_key=True, index=True)
    sede_id = Column(Integer, ForeignKey("sedes.id"), nullable=False, index=True)
    numero = Column(Integer, nullable=False)
    estado = Column(Enum(TurnoEstado), default=TurnoEstado.ESPERANDO, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    called_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)

    sede = relationship("Sede", back_populates="turnos")

    __table_args__ = (UniqueConstraint("sede_id", "numero", name="uq_turno_sede_numero"),)


class NotificationLog(Base):
    __tablename__ = "notification_logs"
    id = Column(Integer, primary_key=True, index=True)
    pedido_id = Column(Integer, ForeignKey("pedidos.id"), nullable=True, index=True)
    canal = Column(String, nullable=False)
    destino = Column(String, nullable=False)
    estado_pedido = Column(String, nullable=False)
    status = Column(String, nullable=False)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
