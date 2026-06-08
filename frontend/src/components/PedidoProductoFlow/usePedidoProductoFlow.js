import { useCallback, useMemo, useState } from 'react';
import { buildCartItemFlujo } from '../../utils/pedidoCantidad';

export function usePedidoProductoFlow({ tiposCorte, pesoUnidad = 'lb', onItemAdded }) {
    const [step, setStep] = useState(1);
    const [selection, setSelection] = useState({ category: null, corte: null, tipoCorte: null });
    const [pedidoModo, setPedidoModo] = useState(null);
    const [modoCantidad, setModoCantidad] = useState(null);
    const [tempPesoTotal, setTempPesoTotal] = useState(1.0);
    const [tempObs, setTempObs] = useState('');
    const [tempPorciones, setTempPorciones] = useState(1);
    const [tempGramosPorcion, setTempGramosPorcion] = useState(100);
    const [editingIndex, setEditingIndex] = useState(null);
    const [productSearch, setProductSearch] = useState('');

    const resetCantidadForm = useCallback(() => {
        setPedidoModo(null);
        setModoCantidad(null);
        setTempPorciones(1);
        setTempGramosPorcion(100);
        setTempPesoTotal(1.0);
        setTempObs('');
    }, []);

    const resetAndGoHome = useCallback(() => {
        setStep(1);
        setSelection({ category: null, corte: null, tipoCorte: null });
        resetCantidadForm();
        setEditingIndex(null);
    }, [resetCantidadForm]);

    const filterProductItems = useCallback((items) => {
        const q = productSearch.trim().toLowerCase();
        if (!q) return items;
        return items.filter((item) => (item.nombre || '').toLowerCase().includes(q));
    }, [productSearch]);

    const filteredTiposCorte = useMemo(() => {
        const base = selection.corte?.tipos_corte?.length
            ? selection.corte.tipos_corte
            : tiposCorte;
        return filterProductItems(base);
    }, [selection.corte, tiposCorte, filterProductItems]);

    const productSearchPlaceholder = step === 1
        ? 'Buscar proteína...'
        : step === 2
          ? 'Buscar parte...'
          : 'Buscar preparación...';

    const showProductSearch = step <= 2 || (step === 4 && pedidoModo === 'preparacion');

    const handleCorteSelect = useCallback((corte) => {
        setSelection((s) => ({ ...s, corte, tipoCorte: null }));
        resetCantidadForm();
        setStep(3);
    }, [resetCantidadForm]);

    const handleSelectPedidoModo = useCallback((modo) => {
        setPedidoModo(modo);
        setModoCantidad(null);
        setSelection((s) => ({ ...s, tipoCorte: null }));
        setStep(4);
    }, []);

    const handleSelectTipoCorte = useCallback((tipo) => {
        setSelection((s) => ({ ...s, tipoCorte: tipo }));
        setStep(5);
    }, []);

    const handleSelectSubmodoPorciones = useCallback((submodo) => {
        setModoCantidad(submodo);
        setStep(5);
    }, []);

    const handleSelectorBack = useCallback((targetStep) => {
        if (targetStep === 3) {
            setPedidoModo(null);
            setModoCantidad(null);
            setSelection((s) => ({ ...s, tipoCorte: null }));
            setEditingIndex(null);
        }
        if (targetStep === 4 && pedidoModo === 'porciones') {
            setModoCantidad(null);
        }
        setStep(targetStep);
    }, [pedidoModo]);

    const inferPedidoModo = useCallback((item) => {
        if (item.pedidoModo) return item.pedidoModo;
        if (item.type === 'Por porciones') return 'porciones';
        if (item.modo_cantidad === 'porciones') return 'porciones';
        if (item.modo_cantidad === 'kg' && item.type && item.type !== item.name) {
            return 'preparacion';
        }
        if (item.modo_cantidad) return 'porciones';
        return 'preparacion';
    }, []);

    const hydrateFromCartItem = useCallback((item, index) => {
        const modo = inferPedidoModo(item);
        setSelection({
            category: null,
            corte: { id: item.corte_id, nombre: item.name },
            tipoCorte: modo === 'preparacion'
                ? { id: item.tipo_corte_id, nombre: item.type }
                : null,
        });
        setPedidoModo(modo);
        setModoCantidad(item.modo_cantidad || null);
        setTempPesoTotal(item.qty || 1);
        setTempGramosPorcion(item.gramos_porcion || 100);
        setTempPorciones(item.num_porciones || 1);
        setTempObs(item.observaciones || '');
        setEditingIndex(index);
        setStep(5);
    }, [inferPedidoModo]);

    const validateAndBuildItem = useCallback(() => {
        if (pedidoModo === 'preparacion') {
            if (!selection.tipoCorte || !tempPesoTotal || tempPesoTotal <= 0) {
                return { error: pesoUnidad === 'kg' ? 'Indique el peso en kg' : 'Indique el peso en libras' };
            }
        } else if (pedidoModo === 'porciones') {
            if (!tempGramosPorcion || tempGramosPorcion <= 0) {
                return { error: 'Indique los gramos por porción' };
            }
            if (modoCantidad === 'porciones' && (!tempPorciones || tempPorciones < 1)) {
                return { error: 'Indique la cantidad de porciones' };
            }
            if (modoCantidad === 'kg' && (!tempPesoTotal || tempPesoTotal <= 0)) {
                return { error: pesoUnidad === 'kg' ? 'La cantidad en kg debe ser mayor a 0' : 'La cantidad en lb debe ser mayor a 0' };
            }
        } else {
            return { error: null, item: null };
        }

        const item = buildCartItemFlujo({
            selection,
            pedidoModo,
            modoCantidad,
            tempPorciones,
            tempGramosPorcion,
            tempPesoTotal,
            tempObs,
            tiposCorte,
            pesoUnidad,
        });

        if (!item.tipo_corte_id) {
            return { error: 'No hay tipos de preparación configurados.' };
        }

        return { error: null, item };
    }, [
        pedidoModo,
        selection,
        tempPesoTotal,
        tempGramosPorcion,
        tempPorciones,
        modoCantidad,
        tempObs,
        tiposCorte,
        pesoUnidad,
    ]);

    const submitPedidoItem = useCallback(() => {
        const result = validateAndBuildItem();
        if (result.error) return { ok: false, error: result.error };
        if (!result.item) return { ok: false };
        onItemAdded(result.item, editingIndex);
        resetAndGoHome();
        return { ok: true };
    }, [validateAndBuildItem, onItemAdded, editingIndex, resetAndGoHome]);

    return {
        step,
        setStep,
        selection,
        setSelection,
        pedidoModo,
        modoCantidad,
        tempPesoTotal,
        setTempPesoTotal,
        tempObs,
        setTempObs,
        tempPorciones,
        setTempPorciones,
        tempGramosPorcion,
        setTempGramosPorcion,
        editingIndex,
        productSearch,
        setProductSearch,
        filteredTiposCorte,
        productSearchPlaceholder,
        showProductSearch,
        filterProductItems,
        handleCorteSelect,
        handleSelectPedidoModo,
        handleSelectTipoCorte,
        handleSelectSubmodoPorciones,
        handleSelectorBack,
        hydrateFromCartItem,
        submitPedidoItem,
        resetAndGoHome,
        pesoUnidad,
    };
}
