import { io } from 'socket.io-client';
import { getApiBaseUrl } from '../../config/api';

const WS_URL = import.meta.env.VITE_WS_URL?.trim() || getApiBaseUrl();

const socket = io(WS_URL, {
    autoConnect: false,
});

const handlers = {
    new_order: null,
    order_update: null,
    session_update: null,
    approval_update: null,
    carnicero_update: null,
    turn_update: null,
    catalog_update: null,
};

function bindEvent(eventName, key, callback) {
    if (handlers[key]) {
        socket.off(eventName, handlers[key]);
    }
    handlers[key] = callback;
    socket.on(eventName, callback);
}

function unbindEvent(eventName, key) {
    if (handlers[key]) {
        socket.off(eventName, handlers[key]);
        handlers[key] = null;
    }
}

export const socketService = {
    connect: (roomId) => {
        if (!socket.connected) {
            socket.connect();
        }
        if (roomId) {
            socket.emit('join_room', roomId);
        }
    },
    disconnect: () => {
        if (socket.connected) {
            socket.disconnect();
        }
    },
    onNewOrder: (callback) => {
        bindEvent('new_order', 'new_order', callback);
    },
    onOrderUpdate: (callback) => {
        bindEvent('order_update', 'order_update', callback);
    },
    onSessionUpdate: (callback) => {
        bindEvent('session_update', 'session_update', callback);
    },
    offNewOrder: () => {
        unbindEvent('new_order', 'new_order');
    },
    offOrderUpdate: () => {
        unbindEvent('order_update', 'order_update');
    },
    offSessionUpdate: () => {
        unbindEvent('session_update', 'session_update');
    },
    onApprovalUpdate: (callback) => {
        bindEvent('approval_update', 'approval_update', callback);
    },
    offApprovalUpdate: () => {
        unbindEvent('approval_update', 'approval_update');
    },
    onCarniceroUpdate: (callback) => {
        bindEvent('carnicero_update', 'carnicero_update', callback);
    },
    offCarniceroUpdate: () => {
        unbindEvent('carnicero_update', 'carnicero_update');
    },
    onTurnUpdate: (callback) => {
        bindEvent('turn_update', 'turn_update', callback);
    },
    offTurnUpdate: () => {
        unbindEvent('turn_update', 'turn_update');
    },
    onCatalogUpdate: (callback) => {
        bindEvent('catalog_update', 'catalog_update', callback);
    },
    offCatalogUpdate: () => {
        unbindEvent('catalog_update', 'catalog_update');
    },
};

export default socket;
