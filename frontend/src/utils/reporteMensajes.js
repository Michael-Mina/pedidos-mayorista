/** Hilo de mensajes del reporte (mayorista ↔ carnicería). */

export function getReporteMensajes(pedido) {
    if (!pedido) return [];
    if (Array.isArray(pedido.reporte_mensajes) && pedido.reporte_mensajes.length > 0) {
        return pedido.reporte_mensajes;
    }
    const mensajes = [];
    if (pedido.problema_reportado?.trim()) {
        mensajes.push({ rol: 'mayorista', texto: pedido.problema_reportado.trim(), at: null });
    }
    if (pedido.problema_respuesta?.trim()) {
        mensajes.push({ rol: 'carniceria', texto: pedido.problema_respuesta.trim(), at: null });
    }
    return mensajes;
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
