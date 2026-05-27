import React from 'react';
import { AlertTriangle, Package, Send, X } from 'lucide-react';
import { formatPedidoNumero } from '../../utils/pedidos';
import { getReporteMensajes, tieneReporte, etiquetaRolMensaje } from '../../utils/reporteMensajes';
import styles from './ReportChatModal.module.css';

/**
 * Modal compacto de conversación de reporte (mismo tamaño en mayorista y jefe).
 * @param {'mayorista'|'jefe'} perspective
 */
export default function ReportChatModal({
    order,
    message,
    onMessageChange,
    onClose,
    onSubmit,
    perspective = 'mayorista',
    hintExtra = null,
    footerLink = null,
    zIndex,
}) {
    if (!order) return null;

    const hasThread = tieneReporte(order);
    const selfRol = perspective === 'jefe' ? 'carniceria' : 'mayorista';
    const labelCtx = perspective === 'jefe' ? 'jefe' : undefined;
    const submitLabel = hasThread ? 'Enviar mensaje' : 'Enviar reporte';
    const placeholder = hasThread
        ? (perspective === 'jefe' ? 'Escriba un mensaje para el mayorista...' : 'Escriba un mensaje...')
        : 'Ej: Faltó un corte, peso incorrecto...';

    return (
        <div
            className={styles.overlay}
            style={zIndex != null ? { zIndex } : undefined}
            onClick={onClose}
            role="presentation"
        >
            <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className={styles.header}>
                    <h2 className={styles.title}>
                        <AlertTriangle size={20} color="var(--warning)" />
                        Reporte · Pedido {formatPedidoNumero(order)}
                    </h2>
                    <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">
                        <X size={22} />
                    </button>
                </div>

                <div className={styles.body}>
                    {hintExtra || (
                        <p className={styles.hint}>
                            {hasThread
                                ? 'Puede seguir enviando mensajes y ver el historial.'
                                : 'Describa el inconveniente para iniciar el reporte con la carnicería.'}
                        </p>
                    )}

                    {hasThread && (
                        <div className={styles.chatThread}>
                            {getReporteMensajes(order).map((msg, idx) => (
                                <div
                                    key={`${idx}-${msg.at || ''}`}
                                    className={msg.rol === selfRol ? styles.chatBubbleSelf : styles.chatBubbleOther}
                                >
                                    <span className={styles.chatBubbleLabel}>
                                        {etiquetaRolMensaje(msg.rol, labelCtx)}
                                    </span>
                                    <p className={styles.chatBubbleText}>{msg.texto}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    <textarea
                        className={styles.textarea}
                        rows={3}
                        placeholder={placeholder}
                        value={message}
                        onChange={(e) => onMessageChange(e.target.value)}
                    />

                    <div className={styles.actions}>
                        <button type="button" className={styles.secondaryBtn} onClick={onClose}>
                            Cerrar
                        </button>
                        <button
                            type="button"
                            className={styles.primaryBtn}
                            onClick={onSubmit}
                            disabled={!message.trim()}
                        >
                            {perspective === 'jefe' && <Send size={14} />}
                            {submitLabel}
                        </button>
                    </div>

                    {footerLink && (
                        <button type="button" className={styles.footerLink} onClick={footerLink.onClick}>
                            {footerLink.icon === 'package' && <Package size={16} />}
                            {footerLink.label}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
