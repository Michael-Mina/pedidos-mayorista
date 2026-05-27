import React from 'react';
import { getReporteMensajes, etiquetaRolMensaje, formatReporteMensajeHora } from '../../utils/reporteMensajes';
import { useScrollToSeenMessage } from '../../hooks/useScrollToSeenMessage';
import styles from './ReportChatModal.module.css';

/** Lista de burbujas con scroll al último mensaje visto. */
export default function ReportChatThread({
    order,
    perspective = 'mayorista',
    seenMessageCount = 0,
    scrollKey,
    className,
}) {
    const mensajes = getReporteMensajes(order);
    const selfRol = perspective === 'jefe' ? 'carniceria' : 'mayorista';
    const labelCtx = perspective === 'jefe' ? 'jefe' : undefined;
    const { containerRef, setMessageRef } = useScrollToSeenMessage(
        seenMessageCount,
        scrollKey ?? order?.id
    );

    if (!mensajes.length) return null;

    return (
        <div ref={containerRef} className={className ?? styles.chatThread}>
            {mensajes.map((msg, idx) => {
                const hora = formatReporteMensajeHora(msg.at);
                return (
                <div
                    key={`${idx}-${msg.at || ''}`}
                    ref={setMessageRef(idx)}
                    className={msg.rol === selfRol ? styles.chatBubbleSelf : styles.chatBubbleOther}
                >
                    <span className={styles.chatBubbleLabel}>
                        {etiquetaRolMensaje(msg.rol, labelCtx)}
                    </span>
                    <p className={styles.chatBubbleText}>{msg.texto}</p>
                    {hora && (
                        <time className={styles.chatBubbleTime} dateTime={msg.at}>
                            {hora}
                        </time>
                    )}
                </div>
                );
            })}
        </div>
    );
}
