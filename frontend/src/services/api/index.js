import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const pedidoService = {
    getAll: async (sedeId) => {
        const response = await api.get(`/pedidos?sede_id=${sedeId}`);
        return response.data;
    },
    create: async (pedidoData) => {
        const response = await api.post('/pedidos', pedidoData);
        return response.data;
    },
    updateEstado: async (pedidoId, estado, carniceroId = null) => {
        const response = await api.put(`/pedidos/${pedidoId}/estado`, null, {
            params: { estado, carnicero_id: carniceroId }
        });
        return response.data;
    }
};

export const productService = {
    getCategories: async () => {
        const response = await api.get('/categorias');
        return response.data;
    },
    getCortes: async (categoriaId) => {
        const response = await api.get(`/cortes?categoria_id=${categoriaId}`);
        return response.data;
    },
    getTiposCorte: async () => {
        const response = await api.get('/tipos-corte');
        return response.data;
    }
};

export default api;
