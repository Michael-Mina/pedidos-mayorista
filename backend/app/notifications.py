"""
Notificaciones SMS/WhatsApp vía Twilio para pedidos de clientes.
Si Twilio no está configurado, registra en log sin interrumpir el flujo.
"""

from __future__ import annotations

import logging
import os
import re

from sqlalchemy.orm import Session

from . import models

logger = logging.getLogger(__name__)

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_SMS_FROM = os.getenv("TWILIO_SMS_FROM", "").strip()
TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "").strip()


def _twilio_configured() -> bool:
    return bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN)


def _normalize_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if not digits:
        return ""
    if digits.startswith("57") and len(digits) >= 12:
        return f"+{digits}"
    if len(digits) == 10:
        return f"+57{digits}"
    if phone.strip().startswith("+"):
        return phone.strip()
    return f"+{digits}"


def _message_for_estado(numero: str | None, estado: str) -> str:
    n = numero or "—"
    if estado == "pendiente":
        return f"Su pedido #{n} fue recibido y está pendiente."
    if estado == "en_proceso":
        return f"Su pedido #{n} está en preparación."
    if estado == "finalizado":
        return f"Su pedido #{n} ya está listo. Puede pasar a retirarlo."
    return f"Actualización de su pedido #{n}: {estado}."


def _channels_for_sede(sede: models.Sede | None) -> list[str]:
    canal = (sede.notificacion_canal if sede else None) or "ambos"
    if canal == "ninguno":
        return []
    if canal == "sms":
        return ["sms"]
    if canal == "whatsapp":
        return ["whatsapp"]
    return ["sms", "whatsapp"]


def _log_notification(
    db: Session,
    pedido_id: int | None,
    canal: str,
    destino: str,
    estado_pedido: str,
    status: str,
    error: str | None = None,
):
    db.add(
        models.NotificationLog(
            pedido_id=pedido_id,
            canal=canal,
            destino=destino,
            estado_pedido=estado_pedido,
            status=status,
            error=error,
        )
    )
    db.commit()


def _send_twilio(to: str, body: str, channel: str) -> tuple[bool, str | None]:
    if not _twilio_configured():
        logger.info("[notifications] Twilio no configurado. Mensaje (%s) a %s: %s", channel, to, body)
        return False, "Twilio no configurado"

    try:
        from twilio.rest import Client
    except ImportError:
        logger.warning("[notifications] Paquete twilio no instalado")
        return False, "Paquete twilio no instalado"

    client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    try:
        if channel == "whatsapp":
            if not TWILIO_WHATSAPP_FROM:
                return False, "TWILIO_WHATSAPP_FROM no configurado"
            from_addr = TWILIO_WHATSAPP_FROM
            if not from_addr.startswith("whatsapp:"):
                from_addr = f"whatsapp:{from_addr}"
            to_addr = to if to.startswith("whatsapp:") else f"whatsapp:{to}"
            client.messages.create(body=body, from_=from_addr, to=to_addr)
        else:
            if not TWILIO_SMS_FROM:
                return False, "TWILIO_SMS_FROM no configurado"
            client.messages.create(body=body, from_=TWILIO_SMS_FROM, to=to)
        return True, None
    except Exception as exc:
        logger.exception("[notifications] Error enviando %s a %s", channel, to)
        return False, str(exc)


def send_pedido_status_notification(db: Session, pedido: models.Pedido, estado: str) -> None:
    if pedido.origen != "cliente" or not pedido.cliente_telefono:
        return

    sede = pedido.sede or db.query(models.Sede).filter(models.Sede.id == pedido.sede_id).first()
    channels = _channels_for_sede(sede)
    if not channels:
        _log_notification(db, pedido.id, "ninguno", pedido.cliente_telefono, estado, "skipped", "Canal deshabilitado")
        return

    phone = _normalize_phone(pedido.cliente_telefono)
    if not phone:
        _log_notification(db, pedido.id, "ninguno", pedido.cliente_telefono, estado, "failed", "Teléfono inválido")
        return

    body = _message_for_estado(pedido.numero_pedido, estado)
    for channel in channels:
        ok, err = _send_twilio(phone, body, channel)
        _log_notification(
            db,
            pedido.id,
            channel,
            phone,
            estado,
            "sent" if ok else "failed",
            err,
        )
