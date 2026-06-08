/** 1 libra (lb) en kg y gramos — panel clientes. */
export const LB_TO_KG = 0.45359237;
export const LB_TO_G = 453.59237;

/** Formatea gramos para mostrar (ej: 100 g). */
export function formatGramos(gramos) {
    if (gramos == null || Number.isNaN(Number(gramos))) return '';
    const n = Number(gramos);
    if (Number.isInteger(n)) return `${n} g`;
    return `${n.toFixed(0)} g`;
}

/** Formatea libras para mostrar (ej: 2.5 lb). */
export function formatLibras(libras) {
    if (libras == null || Number.isNaN(Number(libras))) return '';
    const n = Number(libras);
    const text = n >= 10 ? n.toFixed(1) : n.toFixed(2);
    return `${text.replace(/\.?0+$/, '')} lb`;
}

function pesoPorcionTexto(item) {
    const peso = item.gramos_porcion ?? item.gramosPorcion;
    if (!peso) return null;
    if (item.pesoPorcionUnidad === 'g') return formatGramos(peso);
    const unidad = item.pesoUnidad ?? 'kg';
    return unidad === 'lb' ? formatLibras(peso) : formatGramos(peso);
}

function pesoTotalTexto(item) {
    const unidad = item.pesoUnidad ?? 'kg';
    const val = item.qty ?? item.cantidad_kg;
    if (val == null) return '';
    return unidad === 'lb' ? formatLibras(val) : `${val} kg`;
}

/** Texto de cantidad para ítem del carrito o detalle de pedido. */
export function formatItemCantidad(item) {
    const porcionTxt = pesoPorcionTexto(item);
    const modo = item.modo_cantidad ?? item.modoCantidad;

    if (modo === 'porciones') {
        const n = item.num_porciones ?? item.numPorciones;
        if (n && porcionTxt) return `${n} porc. de ${porcionTxt}`;
        if (n) return `${n} porciones`;
    }
    if (modo === 'kg') {
        const totalTxt = pesoTotalTexto(item);
        if (totalTxt && porcionTxt) return `${totalTxt} · ${porcionTxt}/porc.`;
        if (totalTxt) return totalTxt;
    }
    const totalTxt = pesoTotalTexto(item);
    return totalTxt || '';
}

/** Texto de cantidad para detalle desde API. */
export function formatDetalleCantidad(det) {
    return formatItemCantidad({
        modo_cantidad: det.modo_cantidad,
        num_porciones: det.num_porciones,
        gramos_porcion: det.gramos_porcion,
        cantidad_kg: det.cantidad_kg,
        qty: det.cantidad_kg,
    });
}

/** Payload API desde ítem del carrito. */
export function buildDetallePayload(item) {
    const modo = item.modo_cantidad ?? item.modoCantidad ?? null;
    const unidad = item.pesoUnidad ?? 'kg';
    const pesoPorcionRaw = item.gramos_porcion ?? item.gramosPorcion;

    let gramos_porcion = null;
    if (modo && pesoPorcionRaw != null) {
        if (item.pesoPorcionUnidad === 'g') {
            gramos_porcion = Number(pesoPorcionRaw);
        } else if (unidad === 'lb') {
            gramos_porcion = Math.round(Number(pesoPorcionRaw) * LB_TO_G * 100) / 100;
        } else {
            gramos_porcion = Number(pesoPorcionRaw);
        }
    }

    let cantidad_kg = 0;
    if (modo === 'kg' && item.qty != null) {
        cantidad_kg = unidad === 'lb'
            ? Math.round(Number(item.qty) * LB_TO_KG * 1000) / 1000
            : Number(item.qty);
    }

    return {
        corte_id: item.corte_id,
        tipo_corte_id: item.tipo_corte_id,
        cantidad_kg,
        modo_cantidad: modo,
        num_porciones: modo === 'porciones' ? Number(item.num_porciones ?? item.numPorciones) : null,
        gramos_porcion,
        observaciones: item.observaciones || null,
    };
}

/** Tipo de corte interno para pedidos por porciones (sin preparación delgado/grueso). */
export function resolveTipoCortePorciones(tiposCorte) {
    const prefer = ['por porciones', 'porción', 'porciones', 'estandar', 'estándar', 'entero'];
    for (const name of prefer) {
        const found = (tiposCorte || []).find((t) => (t.nombre || '').toLowerCase() === name);
        if (found) return found.id;
    }
    return tiposCorte?.[0]?.id ?? null;
}

/** Ítem de carrito — panel clientes (libras). */
export function buildCartItemCliente({
    selection,
    pedidoModo,
    modoCantidad,
    tempPorciones,
    tempGramosPorcion,
    tempQtyLb,
    tempObs,
    tiposCorte,
}) {
    if (pedidoModo === 'preparacion') {
        return {
            corte_id: selection.corte.id,
            tipo_corte_id: selection.tipoCorte.id,
            name: selection.corte.nombre,
            type: selection.tipoCorte.nombre,
            pedidoModo: 'preparacion',
            modo_cantidad: null,
            pesoUnidad: 'lb',
            num_porciones: null,
            gramos_porcion: null,
            qty: tempQtyLb,
            observaciones: tempObs,
        };
    }

    const tipoId = resolveTipoCortePorciones(tiposCorte);
    return {
        corte_id: selection.corte.id,
        tipo_corte_id: tipoId,
        name: selection.corte.nombre,
        type: 'Por porciones',
        pedidoModo: 'porciones',
        modo_cantidad: modoCantidad,
        pesoUnidad: 'lb',
        pesoPorcionUnidad: 'g',
        num_porciones: modoCantidad === 'porciones' ? tempPorciones : null,
        gramos_porcion: tempGramosPorcion,
        qty: modoCantidad === 'kg' ? tempQtyLb : 0,
        observaciones: tempObs,
    };
}

/** Ítem de carrito desde formulario de preparación (mayorista). */
export function buildCartItem({
    selection,
    modoCantidad,
    tempPorciones,
    tempGramosPorcion,
    tempQty,
    tempObs,
    pesoUnidad = 'kg',
}) {
    return {
        corte_id: selection.corte.id,
        tipo_corte_id: selection.tipoCorte.id,
        name: selection.corte.nombre,
        type: selection.tipoCorte.nombre,
        modo_cantidad: modoCantidad,
        pesoUnidad,
        num_porciones: modoCantidad === 'porciones' ? tempPorciones : null,
        gramos_porcion: tempGramosPorcion,
        qty: modoCantidad === 'kg' ? tempQty : 0,
        observaciones: tempObs,
    };
}
