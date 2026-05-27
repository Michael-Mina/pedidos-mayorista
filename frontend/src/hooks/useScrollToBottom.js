import { useLayoutEffect, useRef } from 'react';

/** Mantiene un contenedor con scroll al final cuando cambian las dependencias. */
export function useScrollToBottom(deps) {
    const ref = useRef(null);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;

        const scrollToEnd = () => {
            el.scrollTop = el.scrollHeight;
        };

        scrollToEnd();
        requestAnimationFrame(scrollToEnd);
    }, deps);

    return ref;
}
