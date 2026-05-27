"""Hilo de mensajes del reporte de un pedido (mayorista ↔ carnicería)."""
import json
from datetime import datetime, timezone
from typing import Any


def pedido_mensajes_list(pedido) -> list[dict[str, Any]]:
    if getattr(pedido, "reporte_mensajes", None):
        try:
            data = json.loads(pedido.reporte_mensajes)
            if isinstance(data, list):
                return data
        except (json.JSONDecodeError, TypeError):
            pass

    mensajes: list[dict[str, Any]] = []
    if pedido.problema_reportado and str(pedido.problema_reportado).strip():
        mensajes.append({"rol": "mayorista", "texto": str(pedido.problema_reportado).strip(), "at": None})
    if pedido.problema_respuesta and str(pedido.problema_respuesta).strip():
        mensajes.append({"rol": "carniceria", "texto": str(pedido.problema_respuesta).strip(), "at": None})
    return mensajes


def guardar_mensajes_en_pedido(pedido, mensajes: list[dict[str, Any]]) -> None:
    pedido.reporte_mensajes = json.dumps(mensajes, ensure_ascii=False)
    may = [m for m in mensajes if m.get("rol") == "mayorista"]
    carn = [m for m in mensajes if m.get("rol") == "carniceria"]
    pedido.problema_reportado = may[-1]["texto"] if may else None
    pedido.problema_respuesta = carn[-1]["texto"] if carn else None


def agregar_mensaje_reporte(pedido, rol: str, texto: str) -> list[dict[str, Any]]:
    mensajes = pedido_mensajes_list(pedido)
    mensajes.append(
        {
            "rol": rol,
            "texto": texto.strip(),
            "at": datetime.now(timezone.utc).isoformat(),
        }
    )
    guardar_mensajes_en_pedido(pedido, mensajes)
    return mensajes


def ultimo_rol_mensaje(pedido) -> str | None:
    mensajes = pedido_mensajes_list(pedido)
    if not mensajes:
        return None
    return mensajes[-1].get("rol")
