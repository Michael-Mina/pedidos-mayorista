"""
Notificaciones para pedidos de clientes.
- WhatsApp: UltraMsg API (backend, sin abrir WhatsApp en el dispositivo).
- SMS: Twilio (opcional).
Si no hay proveedor configurado, registra en log sin interrumpir el flujo.
"""

from __future__ import annotations

import json
import logging
import os
import re
import urllib.error
import urllib.request

from sqlalchemy.orm import Session

from . import models

logger = logging.getLogger(__name__)

ULTRAMSG_INSTANCE_ID = os.getenv("ULTRAMSG_INSTANCE_ID", "").strip()
ULTRAMSG_TOKEN = os.getenv("ULTRAMSG_TOKEN", "").strip()

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_SMS_FROM = os.getenv("TWILIO_SMS_FROM", "").strip()
TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "").strip()


def _ultramsg_global_configured() -> bool:
    return bool(ULTRAMSG_INSTANCE_ID and ULTRAMSG_TOKEN)


def _ultramsg_for_sede(sede: models.Sede | None) -> tuple[str, str] | None:
    if sede and sede.ultramsg_instance_id and sede.ultramsg_token:
        return sede.ultramsg_instance_id.strip(), sede.ultramsg_token.strip()
    if _ultramsg_global_configured():
        return ULTRAMSG_INSTANCE_ID, ULTRAMSG_TOKEN
    return None


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


def _send_ultramsg_whatsapp(
    to: str,
    body: str,
    instance_id: str,
    token: str,
) -> tuple[bool, str | None]:
    url = f"https://api.ultramsg.com/{instance_id}/messages/chat"
    payload = json.dumps({
        "token": token,
        "to": to,
        "body": body,
    }).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    raw = ""
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            data = json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        try:
            err_body = exc.read().decode("utf-8")
            data = json.loads(err_body) if err_body else {}
            err_msg = data.get("error") or data.get("message") or err_body or str(exc)
        except Exception:
            err_msg = str(exc)
        logger.exception("[notifications] UltraMsg HTTP error a %s", to)
        return False, err_msg
    except Exception as exc:
        logger.exception("[notifications] Error UltraMsg a %s", to)
        return False, str(exc)

    sent = data.get("sent")
    if sent is True or str(sent).lower() == "true" or data.get("id"):
        return True, None

    err = data.get("error") or data.get("message") or raw or str(data)
    return False, str(err) if err else "Respuesta inesperada de UltraMsg"


def _send_twilio_sms(to: str, body: str) -> tuple[bool, str | None]:
    if not _twilio_configured():
        logger.info("[notifications] Twilio no configurado. SMS a %s: %s", to, body)
        return False, "Twilio no configurado"

    try:
        from twilio.rest import Client
    except ImportError:
        logger.warning("[notifications] Paquete twilio no instalado")
        return False, "Paquete twilio no instalado"

    if not TWILIO_SMS_FROM:
        return False, "TWILIO_SMS_FROM no configurado"

    client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    try:
        client.messages.create(body=body, from_=TWILIO_SMS_FROM, to=to)
        return True, None
    except Exception as exc:
        logger.exception("[notifications] Error enviando SMS a %s", to)
        return False, str(exc)


def _send_twilio_whatsapp(to: str, body: str) -> tuple[bool, str | None]:
    """Respaldo legacy si UltraMsg no está configurado."""
    if not _twilio_configured():
        return False, "Twilio no configurado"
    if not TWILIO_WHATSAPP_FROM:
        return False, "TWILIO_WHATSAPP_FROM no configurado"

    try:
        from twilio.rest import Client
    except ImportError:
        return False, "Paquete twilio no instalado"

    client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    from_addr = TWILIO_WHATSAPP_FROM
    if not from_addr.startswith("whatsapp:"):
        from_addr = f"whatsapp:{from_addr}"
    to_addr = to if to.startswith("whatsapp:") else f"whatsapp:{to}"
    try:
        client.messages.create(body=body, from_=from_addr, to=to_addr)
        return True, None
    except Exception as exc:
        logger.exception("[notifications] Error enviando WhatsApp Twilio a %s", to)
        return False, str(exc)


def _send_channel(
    phone: str,
    body: str,
    channel: str,
    sede: models.Sede | None,
) -> tuple[bool, str | None]:
    if channel == "whatsapp":
        creds = _ultramsg_for_sede(sede)
        if creds:
            return _send_ultramsg_whatsapp(phone, body, creds[0], creds[1])
        sede_label = sede.nombre if sede else "sede"
        msg = (
            f"WhatsApp no configurado para {sede_label}. "
            "Indique teléfono, Instance ID y Token UltraMsg en la sede, "
            "o variables globales ULTRAMSG_INSTANCE_ID y ULTRAMSG_TOKEN."
        )
        logger.warning("[notifications] %s", msg)
        return _send_twilio_whatsapp(phone, body) if _twilio_configured() else (False, msg)
    if channel == "sms":
        return _send_twilio_sms(phone, body)
    return False, f"Canal desconocido: {channel}"


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
        ok, err = _send_channel(phone, body, channel, sede)
        _log_notification(
            db,
            pedido.id,
            channel,
            phone,
            estado,
            "sent" if ok else "failed",
            err,
        )
