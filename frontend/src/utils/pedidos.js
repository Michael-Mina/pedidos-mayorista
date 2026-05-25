export const getPedidoTrackingNumber = (pedido) => {
    if (!pedido?.numero_pedido) return null;

    const value = String(pedido.numero_pedido).trim();
    if (/^\d+$/.test(value)) {
        return value;
    }

    const lastPart = value.split('-').pop();
    return /^\d+$/.test(lastPart) ? lastPart : null;
};

export const formatPedidoNumero = (pedido) => {
    if (!pedido) return '';

    const trackingNumber = getPedidoTrackingNumber(pedido);
    if (trackingNumber) return `#${trackingNumber}`;

    return `#${pedido.id}`;
};
