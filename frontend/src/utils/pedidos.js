export const getPedidoTrackingNumber = (pedido) => {
    if (!pedido?.numero_pedido) return null;

    const value = String(pedido.numero_pedido).trim();
    if (/^\d+$/.test(value)) {
        return value;
    }

    const lastPart = value.split('-').pop();
    return /^\d+$/.test(lastPart) ? lastPart : null;
};

/** Nombre legible de un usuario (mayorista o carnicero). */
export function formatUserDisplayName(user) {
    if (!user) return null;
    const name = [user.nombre, user.apellido].filter(Boolean).join(' ').trim();
    return name || user.username || null;
}

/** Etiqueta del mayorista que creó el pedido. */
export function formatMayoristaLabel(mayorista) {
    if (!mayorista) return '—';
    return formatUserDisplayName(mayorista) || '—';
}

/** Carnicero: número + nombre (ej. "001 — Sebastian Chaux"). */
export function formatCarniceroLabel(carnicero) {
    if (!carnicero) return 'Sin asignar';
    const num = carnicero.numero_carnicero || carnicero.username;
    const name = formatUserDisplayName(carnicero);
    if (num && name && name !== num) return `${num} — ${name}`;
    return name || num || 'Sin asignar';
}

/** Cantidad de líneas / productos del pedido. */
export function getPedidoDetalleCount(pedido) {
    if (!Array.isArray(pedido?.detalles)) return 0;
    return pedido.detalles.length;
}

/** Texto corto para UI: "1 ítem" / "3 ítems". */
export function formatPedidoItemCount(pedido) {
    const n = getPedidoDetalleCount(pedido);
    return n === 1 ? '1 ítem' : `${n} ítems`;
}

export const formatPedidoNumero = (pedido) => {
    if (!pedido) return '';

    const trackingNumber = getPedidoTrackingNumber(pedido);
    if (trackingNumber) return `#${trackingNumber}`;

    return `#${pedido.id}`;
};

/** Tiempo transcurrido desde un timestamp ISO (para contadores en vivo). */
export function formatElapsedSince(isoTimestamp, nowMs = Date.now()) {
    if (isoTimestamp == null || isoTimestamp === '') return '—';
    const start = new Date(isoTimestamp).getTime();
    if (Number.isNaN(start)) return '—';

    const totalSeconds = Math.max(0, Math.floor((nowMs - start) / 1000));
    if (totalSeconds < 60) return `${totalSeconds}s`;

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes < 60) {
        return seconds > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    if (hours < 24) {
        return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
    }

    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
}

/** Duración entre dos timestamps ISO; si no hay fin, usa nowMs (contador en vivo). */
export function formatDurationBetween(startIso, endIso, nowMs = Date.now()) {
    if (startIso == null || startIso === '') return '—';
    const start = new Date(startIso).getTime();
    if (Number.isNaN(start)) return '—';

    let end;
    if (endIso == null || endIso === '') {
        end = nowMs;
    } else {
        end = new Date(endIso).getTime();
        if (Number.isNaN(end)) return '—';
    }

    const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
    if (totalSeconds < 60) return `${totalSeconds}s`;

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes < 60) {
        return seconds > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    if (hours < 24) {
        return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
    }

    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
}

/** Tiempos del pedido para tablas de monitor (espera, preparación, total). */
export function getPedidoTiemposMonitor(pedido, nowMs = Date.now()) {
    if (!pedido) return { espera: '—', preparacion: '—', total: '—' };

    const { timestamp, started_at, finished_at, estado } = pedido;

    if (estado === 'pendiente') {
        const espera = formatDurationBetween(timestamp, null, nowMs);
        return { espera, preparacion: '—', total: espera };
    }

    if (estado === 'en_proceso') {
        if (!started_at) {
            const espera = formatDurationBetween(timestamp, null, nowMs);
            return { espera, preparacion: '—', total: espera };
        }
        return {
            espera: formatDurationBetween(timestamp, started_at, nowMs),
            preparacion: formatDurationBetween(started_at, null, nowMs),
            total: formatDurationBetween(timestamp, null, nowMs),
        };
    }

    if (estado === 'finalizado') {
        return {
            espera: formatDurationBetween(timestamp, started_at, nowMs),
            preparacion: formatDurationBetween(started_at, finished_at, nowMs),
            total: formatDurationBetween(timestamp, finished_at, nowMs),
        };
    }

    return { espera: '—', preparacion: '—', total: '—' };
}

/** Fecha local YYYY-MM-DD de un timestamp ISO. */
export function pedidoLocalDateKey(ts) {
    if (ts == null || ts === '') return '';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function todayLocalIsoDate() {
    return pedidoLocalDateKey(new Date());
}

/** Pedido finalizado en el día indicado (usa finished_at, luego updated_at). */
export function pedidoFinalizadoHoy(pedido, todayKey = todayLocalIsoDate()) {
    if (pedido?.estado !== 'finalizado') return false;
    const finishDay = pedido.finished_at
        ? pedidoLocalDateKey(pedido.finished_at)
        : pedido.updated_at
          ? pedidoLocalDateKey(pedido.updated_at)
          : pedidoLocalDateKey(pedido.timestamp);
    return finishDay === todayKey;
}

/** Monitor jefe: pedidos de hoy o pendientes arrastrados de días anteriores. */
export function pedidoVisibleEnMonitorGlobal(pedido, todayKey = todayLocalIsoDate()) {
    if (!pedido?.timestamp) return false;
    if (pedido.estado === 'finalizado') {
        return pedidoFinalizadoHoy(pedido, todayKey);
    }
    const orderDay = pedidoLocalDateKey(pedido.timestamp);
    if (!orderDay) return false;
    if (orderDay === todayKey) return true;
    return pedido.estado === 'pendiente' && orderDay < todayKey;
}

/** Timestamp (ms) del último cambio del pedido (estado, reporte, etc.). */
export function getPedidoUpdatedAtMs(pedido) {
    if (pedido?.updated_at) {
        const t = new Date(pedido.updated_at).getTime();
        if (!Number.isNaN(t)) return t;
    }
    if (pedido?.timestamp) {
        const t = new Date(pedido.timestamp).getTime();
        if (!Number.isNaN(t)) return t;
    }
    return 0;
}

/** Ordena pedidos por última actividad (más reciente primero). */
export function sortPedidosByRecentActivity(list) {
    return [...list].sort((a, b) => getPedidoUpdatedAtMs(b) - getPedidoUpdatedAtMs(a));
}

/** Inserta o actualiza un pedido en una lista por id (evita duplicados en UI). */
export function upsertPedidoInList(list, pedido) {
    if (!pedido?.id) return list;
    const index = list.findIndex((p) => p.id === pedido.id);
    if (index === -1) {
        return [pedido, ...list];
    }
    const next = list.filter((p) => p.id !== pedido.id);
    return [pedido, ...next];
}
