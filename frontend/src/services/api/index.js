import axios from 'axios';

import { getApiBaseUrl } from '../../config/api';

const API_URL = getApiBaseUrl();

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
    await downloadAdminBackupPart('zip');
};

/** Descarga un componente del respaldo: schema | data | static | manifest | zip */
export const downloadAdminBackupPart = async (part) => {
    const token = localStorage.getItem('token');
    const path = part === 'zip' ? '/admin/backup/download' : `/admin/backup/download/${part}`;
    const response = await fetch(`${API_URL}${path}`, {
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
    const fallback = part === 'zip'
        ? `pedidos_mayorista_backup_${Date.now()}.zip`
        : `pedidos_mayorista_${part}_${Date.now()}`;
    const filename = match ? match[1].trim() : fallback;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

const downloadBlobFromApi = async (path, fallbackFilename, errorMessage) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
        let detail = errorMessage;
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
    const filename = match ? match[1].trim() : fallbackFilename;
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
};

/** Descarga catálogo Excel de la sede del supervisor. */
export const downloadCatalogExcel = async () => {
    await downloadBlobFromApi(
        '/catalogo/excel/export',
        `catalogo_${Date.now()}.xlsx`,
        'No se pudo exportar el catálogo'
    );
};

/** Descarga plantilla Excel para cargar catálogo. */
export const downloadCatalogTemplate = async () => {
    await downloadBlobFromApi(
        '/catalogo/excel/plantilla',
        `plantilla_catalogo_${Date.now()}.xlsx`,
        'No se pudo descargar la plantilla'
    );
};

/** Importa catálogo desde Excel (supervisor). */
export const importCatalogExcel = async (file) => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_URL}/catalogo/excel/import`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
    });
    if (!response.ok) {
        let detail = 'No se pudo importar el catálogo';
        try {
            const body = await response.json();
            detail = body.detail || detail;
        } catch {
            /* respuesta no JSON */
        }
        throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
    return response.json();
};

/** Descarga reporte Excel del dashboard (solo admin). */
export const downloadAdminReport = async (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        if (Array.isArray(value)) {
            value.forEach((v) => qs.append(key, String(v)));
        } else {
            qs.append(key, String(value));
        }
    });
    const query = qs.toString();
    await downloadBlobFromApi(
        `/admin/report/excel${query ? `?${query}` : ''}`,
        `reporte_pedidos_mayorista_${Date.now()}.xlsx`,
        'No se pudo generar el reporte'
    );
};

export default api;
