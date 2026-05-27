import { useLayoutEffect, useRef, useCallback } from 'react';

/**
 * Posiciona el scroll en el último mensaje ya visto (no al final del hilo).
 * @param {number} seenMessageCount mensajes ya leídos
 * @param {string|number} scrollKey cambia solo al abrir otro pedido
 */
export function useScrollToSeenMessage(seenMessageCount, scrollKey) {
    const containerRef = useRef(null);
    const messageRefs = useRef([]);

    const setMessageRef = useCallback(
        (index) => (el) => {
            messageRefs.current[index] = el;
        },
        []
    );

    useLayoutEffect(() => {
        const targetIndex =
            seenMessageCount > 0 ? Math.max(0, seenMessageCount - 1) : 0;

        const scrollToTarget = () => {
            const target = messageRefs.current[targetIndex];
            if (target) {
                target.scrollIntoView({ block: 'nearest', behavior: 'auto' });
            } else if (containerRef.current) {
                containerRef.current.scrollTop = 0;
            }
        };

        scrollToTarget();
        requestAnimationFrame(scrollToTarget);
    }, [scrollKey, seenMessageCount]);

    return { containerRef, setMessageRef };
}
