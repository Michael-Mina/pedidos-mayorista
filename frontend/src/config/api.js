/**
 * URL base del API. En Render, si VITE_API_URL no se inyectó en el build,
 * deduce el host *-api desde el frontend *-web.
 */
export function getApiBaseUrl() {
    const raw = import.meta.env.VITE_API_URL;
    if (raw && String(raw).trim() && !String(raw).includes('undefined')) {
        return String(raw).replace(/\/$/, '');
    }
    if (import.meta.env.DEV) {
        return 'http://localhost:8000';
    }
    if (typeof window !== 'undefined' && window.location?.hostname) {
        const { protocol, hostname } = window.location;
        if (hostname.includes('onrender.com')) {
            const apiHost = hostname.replace('-web.onrender.com', '-api.onrender.com');
            if (apiHost !== hostname) {
                return `${protocol}//${apiHost}`;
            }
        }
    }
    return 'https://pedidos-mayorista-api.onrender.com';
}
