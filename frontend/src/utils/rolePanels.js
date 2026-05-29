/** Nombres visibles de cada tipo de panel (códigos internos: admin, mayorista, jefe, sede). */
export const PANEL_LABELS = {
    admin: 'Panel de administración',
    mayorista: 'Panel de pedidos',
    jefe: 'Panel de proteínas',
    sede: 'Panel de supervisor',
};

export function panelLabel(panel) {
    return PANEL_LABELS[panel] || panel;
}

/** Rutas por tipo de panel (viene del login en user.panel). */
export const PANEL_HOME = {
    admin: '/admin',
    mayorista: '/mayorista',
    jefe: '/jefe',
    sede: '/sede',
};

export function homePathForUser(user) {
    if (!user) return '/login';
    const panel = user.panel || user.role;
    return PANEL_HOME[panel] || '/login';
}

export function userHasPanel(user, allowedPanels) {
    if (!user || !allowedPanels?.length) return true;
    const panel = user.panel;
    if (panel && allowedPanels.includes(panel)) return true;
    return allowedPanels.includes(user.role);
}
