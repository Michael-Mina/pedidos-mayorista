/** Hilo de mensajes del reporte (mayorista ↔ carnicería). */

function parseReporteMensajesArray(pedido) {
    const raw = pedido?.reporte_mensajes;
    if (raw == null || raw === '') return null;
    if (Array.isArray(raw)) {
        return raw.length > 0 ? raw : null;
    }
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch {
            /* JSON inválido: usar legacy */
        }
    }
    return null;
}

export function getReporteMensajes(pedido) {
    if (!pedido) return [];
    const fromJson = parseReporteMensajesArray(pedido);
    if (fromJson) return fromJson;

    const mensajes = [];
    if (pedido.problema_reportado?.trim()) {
        mensajes.push({ rol: 'mayorista', texto: pedido.problema_reportado.trim(), at: null });
    }
    if (pedido.problema_respuesta?.trim()) {
        mensajes.push({ rol: 'carniceria', texto: pedido.problema_respuesta.trim(), at: null });
    }
    return mensajes;
}

/** Huella del hilo leído (más fiable que solo contar mensajes). */
export function getReporteThreadSeenKey(pedido) {
    const mensajes = getReporteMensajes(pedido);
    if (!mensajes.length) return '';
    const last = mensajes[mensajes.length - 1];
    return `${mensajes.length}:${last.rol ?? ''}:${last.at ?? ''}:${last.texto ?? ''}`;
}

export function pedidoReporteId(pedido) {
    return pedido?.id != null ? String(pedido.id) : '';
}

export function tieneReporte(pedido) {
    return getReporteMensajes(pedido).length > 0;
}

export function ultimoRolMensaje(pedido) {
    const mensajes = getReporteMensajes(pedido);
    return mensajes.length ? mensajes[mensajes.length - 1].rol : null;
}

/** viewer: 'mayorista' | 'jefe' */
export function etiquetaRolMensaje(rol, viewer = 'mayorista') {
    if (viewer === 'jefe') {
        return rol === 'carniceria' ? 'Usted' : 'Mayorista';
    }
    return rol === 'carniceria' ? 'Carnicería' : 'Usted';
}
