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
import urllib.parse
import urllib.request

from sqlalchemy.orm import Session, joinedload

from . import models

logger = logging.getLogger(__name__)

ULTRAMSG_INSTANCE_ID = os.getenv("ULTRAMSG_INSTANCE_ID", "").strip()
ULTRAMSG_TOKEN = os.getenv("ULTRAMSG_TOKEN", "").strip()

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_SMS_FROM = os.getenv("TWILIO_SMS_FROM", "").strip()
TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "").strip()

_ULTRAMSG_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/121.0.0.0 Safari/537.36"
)


def _ultramsg_http_headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    """Cloudflare bloquea urllib sin User-Agent (error 1010)."""
    headers = {
        "User-Agent": _ULTRAMSG_USER_AGENT,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
        "Origin": "https://ultramsg.com",
        "Referer": "https://ultramsg.com/",
    }
    if extra:
        headers.update(extra)
    return headers


def _format_ultramsg_error(raw: str | None, err: str | None = None) -> str:
    text = (raw or err or "").strip()
    if "1010" in text or "cloudflare" in text.lower():
        return (
            "UltraMsg bloqueó la petición (Cloudflare 1010). "
            "Verifique Instance ID, Token y que la instancia esté autenticada en UltraMsg."
        )
    if err:
        return err
    if raw:
        return raw[:500]
    return "Error desconocido al contactar UltraMsg"


def _ultramsg_global_configured() -> bool:
    return bool(ULTRAMSG_INSTANCE_ID and ULTRAMSG_TOKEN)


def _normalize_instance_id(instance_id: str) -> str:
    raw = (instance_id or "").strip()
    if not raw:
        return ""
    if raw.startswith("instance"):
        return raw
    if raw.isdigit():
        return f"instance{raw}"
    return raw


def _ultramsg_for_sede(sede: models.Sede | None) -> tuple[str, str] | None:
    if sede and sede.ultramsg_instance_id and sede.ultramsg_token:
        instance = _normalize_instance_id(sede.ultramsg_instance_id)
        token = sede.ultramsg_token.strip()
        if instance and token:
            return instance, token
    if _ultramsg_global_configured():
        return _normalize_instance_id(ULTRAMSG_INSTANCE_ID), ULTRAMSG_TOKEN
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


def _ultramsg_recipients(phone: str) -> list[str]:
    """Formatos aceptados por UltraMsg para el destinatario."""
    digits = re.sub(r"\D", "", phone or "")
    if not digits:
        return []
    if len(digits) == 10:
        digits = f"57{digits}"
    recipients = [digits, f"+{digits}"]
    if not digits.endswith("@c.us"):
        recipients.append(f"{digits}@c.us")
    seen: set[str] = set()
    ordered: list[str] = []
    for item in recipients:
        if item not in seen:
            seen.add(item)
            ordered.append(item)
    return ordered


def whatsapp_configured_for_sede(sede: models.Sede | None) -> bool:
    return _ultramsg_for_sede(sede) is not None


def whatsapp_config_error(sede: models.Sede | None) -> str | None:
    if not sede:
        return "Sede no encontrada"
    canal = (sede.notificacion_canal or "ambos")
    if canal not in ("whatsapp", "ambos"):
        return None
    if _ultramsg_for_sede(sede):
        return None
    if sede.whatsapp_telefono:
        return (
            "Tiene teléfono WhatsApp pero faltan Instance ID y Token UltraMsg válidos. "
            "Verifique que guardó el Token al editar la sede."
        )
    return (
        "Configure Instance ID y Token UltraMsg en la sede "
        "(o ULTRAMSG_INSTANCE_ID y ULTRAMSG_TOKEN en el servidor)."
    )


def _fmt_kg(cantidad: float | None) -> str:
    if cantidad is None:
        return "—"
    if float(cantidad).is_integer():
        return str(int(cantidad))
    text = f"{float(cantidad):.2f}".rstrip("0").rstrip(".")
    return text or "0"


def _format_detalle_line(detalle: models.DetallePedido) -> str:
    corte = (detalle.corte.nombre if detalle.corte else None) or "Producto"
    tipo = detalle.tipo_corte.nombre if detalle.tipo_corte else None
    kg = _fmt_kg(detalle.cantidad_kg)
    if tipo:
        line = f"• {corte} ({tipo}): {kg} kg"
    else:
        line = f"• {corte}: {kg} kg"
    obs = (detalle.observaciones or "").strip()
    if obs:
        line += f" — {obs}"
    return line


def _message_pedido_breve(pedido: models.Pedido, estado: str) -> str:
    nombre = (pedido.cliente_nombre or "").strip() or "Cliente"
    numero = pedido.numero_pedido or str(pedido.id)

    if estado == "en_proceso":
        lines = [
            f"¡Hola {nombre}! 👋",
            "",
            f"👨‍🍳 Su pedido #{numero} está en preparación.",
            "",
            "¡Gracias por su paciencia! 🙏",
        ]
        return "\n".join(lines)

    if estado == "finalizado":
        lines = [
            f"¡Hola {nombre}! 👋",
            "",
            f"✅ ¡Su pedido #{numero} ya está listo! Puede pasar a retirarlo.",
            "",
            "¡Gracias por preferirnos! 🙏",
            "",
            "⏱️ Nota: tiene 30 minutos para retirar su pedido.",
        ]
        return "\n".join(lines)

    return (
        f"¡Hola {nombre}! 👋\n\n"
        f"📢 Su pedido #{numero} tiene una actualización: {estado}.\n\n"
        "¡Gracias por su compra! 🙏"
    )


def _load_pedido_for_message(db: Session, pedido_id: int) -> models.Pedido | None:
    return (
        db.query(models.Pedido)
        .options(
            joinedload(models.Pedido.detalles).joinedload(models.DetallePedido.corte),
            joinedload(models.Pedido.detalles).joinedload(models.DetallePedido.tipo_corte),
            joinedload(models.Pedido.sede),
        )
        .filter(models.Pedido.id == pedido_id)
        .first()
    )


def _message_pedido_completo(pedido: models.Pedido) -> str:
    nombre = (pedido.cliente_nombre or "").strip() or "Cliente"
    numero = pedido.numero_pedido or str(pedido.id)
    sede_nombre = (pedido.sede.nombre if pedido.sede else "").strip()

    lines = [
        f"¡Hola {nombre}! 👋",
        "",
        f"✅ Su pedido #{numero} fue recibido y está pendiente de preparación.",
        "",
        f"📋 Pedido #{numero}",
        "🥩 Productos:",
    ]

    detalles = pedido.detalles or []
    if detalles:
        for detalle in detalles:
            lines.append(_format_detalle_line(detalle))
    else:
        lines.append("• (sin productos registrados)")

    if sede_nombre:
        lines.extend(["", f"🏪 Sede: {sede_nombre}"])

    obs_pedido = (pedido.observaciones or "").strip()
    if obs_pedido:
        lines.extend(["", f"📝 Observaciones: {obs_pedido}"])

    lines.extend([
        "",
        "Le avisaremos cuando comience la preparación.",
        "",
        "¡Gracias por su compra! 🙏",
    ])

    return "\n".join(lines)


def _message_for_pedido(pedido: models.Pedido, estado: str) -> str:
    if estado == "pendiente":
        return _message_pedido_completo(pedido)
    return _message_pedido_breve(pedido, estado)


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


def _parse_ultramsg_response(raw: str) -> tuple[bool, str | None]:
    if not raw:
        return False, "Respuesta vacía de UltraMsg"
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        if "1010" in raw or "cloudflare" in raw.lower():
            return False, _format_ultramsg_error(raw)
        if "ok" in raw.lower() or "sent" in raw.lower():
            return True, None
        return False, _format_ultramsg_error(raw)

    if data.get("error"):
        return False, str(data.get("error"))

    sent = data.get("sent")
    if sent is True or str(sent).lower() in ("true", "1"):
        return True, None

    if data.get("id"):
        return True, None

    message = data.get("message")
    if isinstance(message, str):
        lower = message.lower()
        if any(word in lower for word in ("ok", "done", "sent", "queue", "added")):
            return True, None

    return False, data.get("message") or raw


def _ultramsg_request(url: str, data: bytes, headers: dict[str, str]) -> tuple[bool, str | None, str]:
    req = urllib.request.Request(
        url,
        data=data,
        headers=_ultramsg_http_headers(headers),
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            ok, err = _parse_ultramsg_response(raw)
            return ok, err, raw
    except urllib.error.HTTPError as exc:
        try:
            raw = exc.read().decode("utf-8")
            ok, err = _parse_ultramsg_response(raw)
            if ok:
                return True, None, raw
            return False, _format_ultramsg_error(raw, err or str(exc)), raw
        except Exception:
            return False, str(exc), ""
    except Exception as exc:
        logger.exception("[notifications] Error de red UltraMsg")
        return False, str(exc), ""


def _send_ultramsg_whatsapp(
    to: str,
    body: str,
    instance_id: str,
    token: str,
) -> tuple[bool, str | None]:
    instance = _normalize_instance_id(instance_id)
    token = (token or "").strip()
    if not instance or not token:
        return False, "Instance ID o Token UltraMsg vacíos"

    recipients = _ultramsg_recipients(to)
    if not recipients:
        return False, "Teléfono destino inválido"

    last_err = "No se pudo enviar"
    last_raw = ""

    for to_addr in recipients:
        # Método oficial SDK: token en query + JSON {to, body}
        url = (
            f"https://api.ultramsg.com/{instance}/messages/chat"
            f"?token={urllib.parse.quote(token)}"
        )
        payload = json.dumps({"to": to_addr, "body": body}).encode("utf-8")
        ok, err, raw = _ultramsg_request(
            url,
            payload,
            {"Content-Type": "application/json"},
        )
        last_raw = raw
        if ok:
            logger.info("[notifications] UltraMsg OK a %s: %s", to_addr, raw)
            return True, None
        last_err = err or last_err

        # Respaldo: application/x-www-form-urlencoded
        form_url = f"https://api.ultramsg.com/{instance}/messages/chat"
        form_body = urllib.parse.urlencode({
            "token": token,
            "to": to_addr,
            "body": body,
        }).encode("utf-8")
        ok, err, raw = _ultramsg_request(
            form_url,
            form_body,
            {"Content-Type": "application/x-www-form-urlencoded"},
        )
        last_raw = raw or last_raw
        if ok:
            logger.info("[notifications] UltraMsg OK (form) a %s: %s", to_addr, raw)
            return True, None
        last_err = err or last_err

    logger.warning("[notifications] UltraMsg fallo a %s: %s", to, last_raw or last_err)
    return False, _format_ultramsg_error(last_raw, last_err)


def send_test_whatsapp(
    sede: models.Sede | None,
    telefono: str,
    instance_id: str | None = None,
    token: str | None = None,
) -> tuple[bool, str, str | None]:
    inst = (instance_id or "").strip() or (sede.ultramsg_instance_id if sede else None)
    tok = (token or "").strip() or (sede.ultramsg_token if sede else None)
    inst_norm = _normalize_instance_id(inst or "")
    tok = (tok or "").strip()
    if not inst_norm or not tok:
        return False, whatsapp_config_error(sede) or "UltraMsg no configurado", None

    body = "Mensaje de prueba — Pedidos Mayorista. Si recibió esto, WhatsApp está funcionando."
    ok, err = _send_ultramsg_whatsapp(telefono, body, inst_norm, tok)
    if ok:
        return True, "Mensaje enviado correctamente", None
    return False, err or "Error desconocido", err


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
        msg = whatsapp_config_error(sede) or "WhatsApp no configurado"
        logger.warning("[notifications] %s", msg)
        return _send_twilio_whatsapp(phone, body) if _twilio_configured() else (False, msg)
    if channel == "sms":
        return _send_twilio_sms(phone, body)
    return False, f"Canal desconocido: {channel}"


def send_pedido_status_notification(db: Session, pedido: models.Pedido, estado: str) -> None:
    try:
        if pedido.origen != "cliente":
            logger.info("[notifications] Pedido %s omitido: origen=%s", pedido.id, pedido.origen)
            return
        if not pedido.cliente_telefono:
            logger.info("[notifications] Pedido %s omitido: sin teléfono cliente", pedido.id)
            return

        sede = db.query(models.Sede).filter(models.Sede.id == pedido.sede_id).first()
        channels = _channels_for_sede(sede)
        wa_err = whatsapp_config_error(sede)
        if wa_err and "whatsapp" in channels:
            logger.warning(
                "[notifications] Pedido %s sede %s: %s",
                pedido.id,
                sede.nombre if sede else "?",
                wa_err,
            )

        if not channels:
            _log_notification(
                db, pedido.id, "ninguno", pedido.cliente_telefono or "", estado, "skipped", "Canal deshabilitado"
            )
            return

        phone = _normalize_phone(pedido.cliente_telefono)
        if not phone:
            _log_notification(
                db, pedido.id, "ninguno", pedido.cliente_telefono, estado, "failed", "Teléfono inválido"
            )
            return

        if estado == "pendiente":
            pedido_full = _load_pedido_for_message(db, pedido.id) or pedido
        else:
            pedido_full = pedido
        body = _message_for_pedido(pedido_full, estado)
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
    except Exception:
        logger.exception("[notifications] Error inesperado pedido %s estado %s", pedido.id, estado)
