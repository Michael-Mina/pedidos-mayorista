import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
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

/** Descarga respaldo ZIP (solo admin, requiere token). */
export const downloadAdminBackup = async () => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/admin/backup/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
        let detail = 'No se pudo generar el respaldo';
        try {
            const body = await response.json();
            detail = body.detail || detail;
        } catch {
            /* respuesta no JSON */
        }
        throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^";\n]+)"?/i);
    const filename = match ? match[1].trim() : `pedidos_mayorista_backup_${Date.now()}.zip`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

export default api;
