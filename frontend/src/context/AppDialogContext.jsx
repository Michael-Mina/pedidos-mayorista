import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import styles from '../components/AppDialog/AppDialog.module.css';

const AppDialogContext = createContext(null);

const TOAST_DURATION_MS = 4500;

const TOAST_ICONS = {
    success: CheckCircle,
    error: AlertTriangle,
    info: Info,
    warning: AlertTriangle,
};

export function AppDialogProvider({ children }) {
    const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
    const [confirmState, setConfirmState] = useState(null);
    const toastTimerRef = useRef(null);
    const confirmResolverRef = useRef(null);

    const showToast = useCallback((message, type = 'info') => {
        if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current);
            toastTimerRef.current = null;
        }
        setToast({ show: true, message, type });
        toastTimerRef.current = setTimeout(() => {
            setToast((prev) => ({ ...prev, show: false }));
            toastTimerRef.current = null;
        }, TOAST_DURATION_MS);
    }, []);

    const confirm = useCallback((options) => {
        const opts = typeof options === 'string' ? { message: options } : (options || {});
        return new Promise((resolve) => {
            confirmResolverRef.current = resolve;
            setConfirmState({
                title: opts.title || 'Confirmar',
                message: opts.message || '',
                confirmText: opts.confirmText || 'Aceptar',
                cancelText: opts.cancelText || 'Cancelar',
                variant: opts.variant || 'danger',
            });
        });
    }, []);

    const closeConfirm = useCallback((result) => {
        setConfirmState(null);
        if (confirmResolverRef.current) {
            confirmResolverRef.current(result);
            confirmResolverRef.current = null;
        }
    }, []);

    const ToastIcon = TOAST_ICONS[toast.type] || Info;

    return (
        <AppDialogContext.Provider value={{ showToast, confirm }}>
            {children}
            {toast.show && (
                <div className={styles.toastContainer} role="status" aria-live="polite">
                    <div className={`${styles.toast} ${styles[`toast_${toast.type}`]}`}>
                        <ToastIcon size={20} aria-hidden />
                        <span>{toast.message}</span>
                    </div>
                </div>
            )}
            {confirmState && (
                <div
                    className={styles.confirmOverlay}
                    onClick={() => closeConfirm(false)}
                    role="presentation"
                >
                    <div
                        className={styles.confirmBox}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="app-dialog-title"
                    >
                        <div
                            className={`${styles.confirmIcon} ${
                                confirmState.variant === 'primary' ? styles.confirmIconPrimary : ''
                            }`}
                        >
                            <AlertTriangle size={32} aria-hidden />
                        </div>
                        <h3 id="app-dialog-title">{confirmState.title}</h3>
                        <p className={styles.confirmMessage}>{confirmState.message}</p>
                        <div className={styles.confirmActions}>
                            <button
                                type="button"
                                className={styles.cancelBtn}
                                onClick={() => closeConfirm(false)}
                            >
                                {confirmState.cancelText}
                            </button>
                            <button
                                type="button"
                                className={
                                    confirmState.variant === 'primary'
                                        ? styles.confirmPrimaryBtn
                                        : styles.confirmDangerBtn
                                }
                                onClick={() => closeConfirm(true)}
                            >
                                {confirmState.confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppDialogContext.Provider>
    );
}

export function useAppDialog() {
    const ctx = useContext(AppDialogContext);
    if (!ctx) {
        throw new Error('useAppDialog debe usarse dentro de AppDialogProvider');
    }
    return ctx;
}
