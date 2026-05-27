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

/** Cuántos mensajes del hilo ya se habían visto (según localStorage). */
export function getStoredSeenMessageCount(pedido, seenMap) {
    if (!pedido) return 0;
    const total = getReporteMensajes(pedido).length;
    const stored = seenMap?.[pedidoReporteId(pedido)];
    if (stored == null || stored === '') return 0;

    if (typeof stored === 'number' && Number.isFinite(stored)) {
        return Math.min(Math.max(0, stored), total);
    }

    if (typeof stored === 'string') {
        const head = stored.split(':')[0];
        const n = parseInt(head, 10);
        if (Number.isFinite(n)) return Math.min(Math.max(0, n), total);
    }

    return 0;
}

export function tieneReporte(pedido) {
    return getReporteMensajes(pedido).length > 0;
}

export function ultimoRolMensaje(pedido) {
    const mensajes = getReporteMensajes(pedido);
    return mensajes.length ? mensajes[mensajes.length - 1].rol : null;
}

/** Timestamp (ms) del último mensaje del reporte; para ordenar listas por actividad reciente. */
export function getUltimoMensajeReporteAtMs(pedido) {
    const mensajes = getReporteMensajes(pedido);
    for (let i = mensajes.length - 1; i >= 0; i -= 1) {
        const at = mensajes[i]?.at;
        if (at == null || at === '') continue;
        const t = new Date(at).getTime();
        if (!Number.isNaN(t)) return t;
    }
    if (pedido?.updated_at) {
        const u = new Date(pedido.updated_at).getTime();
        if (!Number.isNaN(u)) return u;
    }
    if (pedido?.timestamp) {
        const t = new Date(pedido.timestamp).getTime();
        if (!Number.isNaN(t)) return t;
    }
    return 0;
}

/** Hora local del mensaje en formato 12 horas con AM/PM (ej: 02:35 PM). */
export function formatReporteMensajeHora(at) {
    if (at == null || at === '') return null;
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return null;

    const hours24 = d.getHours();
    const minutes = d.getMinutes();
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const hour12 = ((hours24 + 11) % 12) + 1;

    return `${String(hour12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
}

/** viewer: 'mayorista' | 'jefe' */
export function etiquetaRolMensaje(rol, viewer = 'mayorista') {
    if (viewer === 'jefe') {
        return rol === 'carniceria' ? 'Usted' : 'Mayorista';
    }
    return rol === 'carniceria' ? 'Carnicería' : 'Usted';
}
