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
