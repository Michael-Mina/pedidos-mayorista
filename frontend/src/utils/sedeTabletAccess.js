const STORAGE_KEY = 'sede_tablet_unlocked';

export function setSedeTabletAccess(userId) {
    sessionStorage.setItem(STORAGE_KEY, String(userId));
}

export function hasSedeTabletAccess(userId) {
    if (!userId) return false;
    return sessionStorage.getItem(STORAGE_KEY) === String(userId);
}

export function clearSedeTabletAccess() {
    sessionStorage.removeItem(STORAGE_KEY);
}
