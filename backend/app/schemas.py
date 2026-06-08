import json
from pydantic import BaseModel, ConfigDict, field_validator
from datetime import datetime, date
from typing import List, Optional
from .models import PedidoEstado

class SedeBase(BaseModel):
    nombre: str
    ciudad: Optional[str] = "Centro de Operación"
    slug: Optional[str] = None
    notificacion_canal: Optional[str] = "ambos"
    whatsapp_telefono: Optional[str] = None
    ultramsg_instance_id: Optional[str] = None
    ultramsg_token: Optional[str] = None

class SedeCreate(SedeBase):
    id: Optional[int] = None
    password: str

class SedeUpdate(BaseModel):
    nombre: Optional[str] = None
    ciudad: Optional[str] = None
    password: Optional[str] = None
    slug: Optional[str] = None
    notificacion_canal: Optional[str] = None
    whatsapp_telefono: Optional[str] = None
    ultramsg_instance_id: Optional[str] = None
    ultramsg_token: Optional[str] = None

class Sede(SedeBase):
    id: int
    slug: Optional[str] = None
    notificacion_canal: str = "ambos"
    model_config = ConfigDict(from_attributes=True)


class SedePublicInfo(BaseModel):
    id: int
    nombre: str
    slug: str
    ciudad: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class NotificationLog(BaseModel):
    id: int
    pedido_id: Optional[int] = None
    canal: str
    destino: str
    estado_pedido: str
    status: str
    error: Optional[str] = None
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class WhatsappTestRequest(BaseModel):
    telefono: str
    ultramsg_instance_id: Optional[str] = None
    ultramsg_token: Optional[str] = None


class WhatsappTestResponse(BaseModel):
    ok: bool
    message: str

class AppRoleBase(BaseModel):
    code: str
    label: str
    panel: str
    can_assign: bool = True


class AppRoleCreate(AppRoleBase):
    pass


class AppRoleUpdate(BaseModel):
    label: Optional[str] = None
    panel: Optional[str] = None
    can_assign: Optional[bool] = None
    is_enabled: Optional[bool] = None


class AppRole(AppRoleBase):
    id: int
    is_system: bool = False
    is_hidden: bool = False
    is_enabled: bool = True
    model_config = ConfigDict(from_attributes=True)


class UserBase(BaseModel):
    username: str
    role: str
    sede_id: int
    session_active: Optional[int] = 0
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    numero_carnicero: Optional[str] = None
    is_available: Optional[bool] = True


class UserUpdate(BaseModel):
    username: str
    role: str
    sede_id: int
    password: Optional[str] = None
    session_active: Optional[int] = None

    @field_validator("sede_id", mode="before")
    @classmethod
    def coerce_sede_id(cls, v):
        if v is None or v == "":
            raise ValueError("sede_id es obligatorio")
        return int(v)

class CarniceroCreate(UserBase):
    password: str

class CarniceroUpdate(BaseModel):
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    numero_carnicero: Optional[str] = None
    is_available: Optional[bool] = None
    password: Optional[str] = None

class User(UserBase):
    id: int
    role_label: Optional[str] = None
    panel: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class UserBrief(BaseModel):
    """Usuario embebido en pedidos (sede_id puede ser nulo en cuentas legacy)."""
    id: int
    username: str
    role: str
    sede_id: Optional[int] = None
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    numero_carnicero: Optional[str] = None
    is_available: Optional[bool] = True
    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

class LoginRequest(BaseModel):
    username: str
    password: str

class PasswordVerifyRequest(BaseModel):
    password: str

class CategoriaBase(BaseModel):
    nombre: str
    imagen_url: Optional[str] = None
    popularidad_score: float = 0.0

class Categoria(CategoriaBase):
    id: int
    sede_id: int
    model_config = ConfigDict(from_attributes=True)

class TipoCorteBase(BaseModel):
    nombre: str

class TipoCorte(TipoCorteBase):
    id: int
    sede_id: int
    model_config = ConfigDict(from_attributes=True)

class CorteBase(BaseModel):
    categoria_id: int
    nombre: str
    imagen_url: Optional[str] = None
    tipos_corte_ids: Optional[List[int]] = []

class Corte(CorteBase):
    id: int
    sede_id: int
    tipos_corte: List[TipoCorte] = []
    model_config = ConfigDict(from_attributes=True)

class DetallePedidoBase(BaseModel):
    corte_id: int
    tipo_corte_id: int
    cantidad_kg: float
    observaciones: Optional[str] = None

class DetallePedidoCreate(DetallePedidoBase):
    pass

class DetallePedido(DetallePedidoBase):
    id: int
    pedido_id: int
    corte: Optional[Corte] = None
    tipo_corte: Optional[TipoCorte] = None
    model_config = ConfigDict(from_attributes=True)

class PedidoBase(BaseModel):
    cliente_nombre: str
    sede_id: int
    observaciones: Optional[str] = None

class PedidoCreate(PedidoBase):
    mayorista_id: int
    detalles: List[DetallePedidoCreate]


class PedidoClienteCreate(BaseModel):
    cliente_nombre: str
    cliente_telefono: str
    observaciones: Optional[str] = None
    detalles: List[DetallePedidoCreate]

    @field_validator("cliente_telefono")
    @classmethod
    def validate_telefono(cls, v: str) -> str:
        cleaned = "".join(ch for ch in (v or "") if ch.isdigit() or ch == "+").strip()
        if len(cleaned.replace("+", "")) < 7:
            raise ValueError("Ingrese un número de teléfono válido")
        return cleaned


class PedidoClienteEstado(BaseModel):
    id: int
    numero_pedido: Optional[str] = None
    estado: PedidoEstado
    cliente_nombre: str
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)

class ReporteMensaje(BaseModel):
    rol: str  # mayorista | carniceria
    texto: str
    at: Optional[str] = None


class Pedido(PedidoBase):
    id: int
    numero_pedido: Optional[str] = None
    mayorista_id: Optional[int] = None
    cliente_telefono: Optional[str] = None
    origen: str = "mayorista"
    mayorista: Optional[UserBrief] = None
    carnicero_id: Optional[int] = None
    carnicero: Optional[UserBrief] = None
    sede: Optional[Sede] = None
    estado: PedidoEstado
    timestamp: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    updated_at: datetime
    problema_reportado: Optional[str] = None
    problema_respuesta: Optional[str] = None
    reporte_mensajes: Optional[List[ReporteMensaje]] = None
    detalles: List[DetallePedido]
    model_config = ConfigDict(from_attributes=True)

    @field_validator("reporte_mensajes", mode="before")
    @classmethod
    def parse_reporte_mensajes(cls, v):
        if v is None or v == "":
            return None
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                return parsed if isinstance(parsed, list) else None
            except json.JSONDecodeError:
                return None
        return v

class PedidoProblemaReport(BaseModel):
    """Cuerpo JSON para PUT /pedidos/{id}/problema (evita límites de URL del query param)."""

    problema: str

class PedidoProblemaRespuesta(BaseModel):
    """Cuerpo JSON para PUT /pedidos/{id}/problema/respuesta."""

    respuesta: str

class ButcherAvailabilityBase(BaseModel):
    butcher_id: int
    sede_id: int
    date: date
    is_available: bool = True

class ButcherAvailabilityCreate(ButcherAvailabilityBase):
    set_by_manager_id: int

class ButcherAvailability(ButcherAvailabilityBase):
    id: int
    set_by_manager_id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ButcherAvailabilityBulkUpdate(BaseModel):
    date: date
    availabilities: List[dict]  # [{butcher_id: int, is_available: bool}]

class ApproveSedesRequest(BaseModel):
    sede_ids: List[int]


class TurnoTicket(BaseModel):
    id: int
    sede_id: int
    numero: int
    estado: str
    created_at: datetime
    called_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class TurnoDisplay(BaseModel):
    actual: Optional[TurnoTicket] = None
    proximos: List[TurnoTicket] = []
    ultimo_atendido: Optional[TurnoTicket] = None
    proximo_numero: int
