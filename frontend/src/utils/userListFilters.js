/** Roles de operación en planta: no se gestionan desde Admin → Usuarios. */
export const EXCLUDED_USER_LIST_ROLES = new Set(['carnicero', 'sede_butcher', 'master']);

export function normalizeRoleCode(code) {
    return (code || '').trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Carniceros (Jefe de carnes) y tablet de sede no deben listarse en Gestión de Usuarios.
 */
export function isExcludedFromUserList(user, rolesCatalog = []) {
    if (!user) return true;
    const role = normalizeRoleCode(user.role);
    if (EXCLUDED_USER_LIST_ROLES.has(role)) return true;
    if (user.panel === 'sede') return true;

    const meta = rolesCatalog.find((r) => normalizeRoleCode(r.code) === role);
    if (meta && (meta.panel === 'sede' || meta.is_hidden)) return true;

    return false;
}

export function filterPanelUsers(users, rolesCatalog = []) {
    return (users || []).filter((u) => !isExcludedFromUserList(u, rolesCatalog));
}
