export const getPedidoTrackingNumber = (pedido) => {
    if (!pedido?.numero_pedido) return null;

    const value = String(pedido.numero_pedido).trim();
    if (/^\d+$/.test(value)) {
        return value;
    }

    const lastPart = value.split('-').pop();
    return /^\d+$/.test(lastPart) ? lastPart : null;
};

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

/** Inserta o actualiza un pedido en una lista por id (evita duplicados en UI). */
export function upsertPedidoInList(list, pedido) {
    if (!pedido?.id) return list;
    const index = list.findIndex((p) => p.id === pedido.id);
    if (index === -1) {
        return [pedido, ...list];
    }
    const next = [...list];
    next[index] = pedido;
    return next;
}
