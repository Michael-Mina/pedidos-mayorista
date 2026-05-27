/** Notificación del sistema cuando hay permiso concedido. */
export function requestNotificationPermission() {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
    }
}

export function notifyBrowserMessage(title, body) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
        const n = new Notification(title, { body, tag: `reporte-${title}` });
        n.onclick = () => {
            window.focus();
            n.close();
        };
    } catch {
        /* ignorar si el navegador bloquea */
    }
}
