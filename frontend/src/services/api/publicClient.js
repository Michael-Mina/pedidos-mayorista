import { getApiBaseUrl } from '../../config/api';

const API_URL = getApiBaseUrl();

async function publicFetch(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
            ...(options.headers || {}),
        },
    });
    if (!response.ok) {
        let detail = 'Error en la solicitud';
        try {
            const body = await response.json();
            detail = body.detail || detail;
        } catch {
            /* no JSON */
        }
        throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
    if (response.status === 204) return null;
    return response.json();
}

export const publicClientService = {
    getSedeInfo: (slug) => publicFetch(`/public/sedes/${encodeURIComponent(slug)}/info`),
    getCategories: (slug) => publicFetch(`/public/sedes/${encodeURIComponent(slug)}/catalogo/categorias`),
    getCortes: (slug, categoriaId) =>
        publicFetch(`/public/sedes/${encodeURIComponent(slug)}/catalogo/cortes?categoria_id=${categoriaId}`),
    getTiposCorte: (slug) => publicFetch(`/public/sedes/${encodeURIComponent(slug)}/catalogo/tipos-corte`),
    createTurno: (slug) =>
        publicFetch(`/public/sedes/${encodeURIComponent(slug)}/turnos`, { method: 'POST' }),
    getTurnoDisplay: (slug) => publicFetch(`/public/sedes/${encodeURIComponent(slug)}/turnos/display`),
    createPedido: (slug, payload) =>
        publicFetch(`/public/sedes/${encodeURIComponent(slug)}/pedidos`, {
            method: 'POST',
            body: JSON.stringify(payload),
        }),
    getPedidoEstado: (slug, pedidoId, telefono) =>
        publicFetch(
            `/public/sedes/${encodeURIComponent(slug)}/pedidos/${pedidoId}/estado?telefono=${encodeURIComponent(telefono)}`
        ),
};

export default publicClientService;
