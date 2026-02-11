import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:8000';

const socket = io(WS_URL, {
    autoConnect: false,
});

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
        socket.on('new_order', callback);
    },
    onOrderUpdate: (callback) => {
        socket.on('order_update', callback);
    },
    onSessionUpdate: (callback) => {
        socket.on('session_update', callback);
    },
    offNewOrder: () => {
        socket.off('new_order');
    },
    offOrderUpdate: () => {
        socket.off('order_update');
    },
    offSessionUpdate: () => {
        socket.off('session_update');
    },
    onApprovalUpdate: (callback) => {
        socket.on('approval_update', callback);
    },
    offApprovalUpdate: () => {
        socket.off('approval_update');
    }
};

export default socket;
