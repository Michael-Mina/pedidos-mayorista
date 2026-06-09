import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import api, { pedidoService, productService } from '../../services/api';
import { socketService } from '../../services/api/socket';
import styles from './Mayorista.module.css';
import { ShoppingCart, Package, History, LogOut, Plus, Trash2, Clock, Filter, Calendar, Search, X, AlertCircle, Minus, Edit2, Menu, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import {
    formatPedidoNumero,
    getPedidoTrackingNumber,
    upsertPedidoInList,
    formatMayoristaLabel,
    formatCarniceroLabel,
    sortPedidosByRecentActivity,
    getPedidoActivityCardTime,
} from '../../utils/pedidos';
import {
    getReporteMensajes,
    getReporteThreadSeenKey,
    getStoredSeenMessageCount,
    pedidoReporteId,
    tieneReporte,
    ultimoRolMensaje,
} from '../../utils/reporteMensajes';
import { requestNotificationPermission, notifyBrowserMessage } from '../../utils/pushNotification';
import ReportChatModal from '../../components/ReportChatModal/ReportChatModal';
import PedidoProductoFlow from '../../components/PedidoProductoFlow/PedidoProductoFlow';
import { usePedidoProductoFlow } from '../../components/PedidoProductoFlow/usePedidoProductoFlow';
import { buildDetallePayload, formatDetalleCantidad, formatItemCantidad } from '../../utils/pedidoCantidad';

/** Fecha del calendario local como YYYY-MM-DD (evita desajustes con toLocaleDateString). */
function todayLocalIsoDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Misma convención YYYY-MM-DD para la fecha del pedido en hora local. */
function pedidoLocalDateKey(ts) {
    if (ts == null || ts === '') return '';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

const SEEN_REPORT_COUNTS_KEY = 'mayorista_seen_report_msg_counts';
const PENDING_FINALIZED_KEY = 'mayorista_pending_finalized';

function loadSeenReportCounts() {
    try {
        const raw = localStorage.getItem(SEEN_REPORT_COUNTS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function loadPendingFinalized() {
    try {
        const raw = localStorage.getItem(PENDING_FINALIZED_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function savePendingFinalized(map) {
    localStorage.setItem(PENDING_FINALIZED_KEY, JSON.stringify(map));
}

const Mayorista = () => {
    const { user, logout } = useAuth();
    const [categories, setCategories] = useState([]);
    const [cortes, setCortes] = useState([]);
    const [tiposCorte, setTiposCorte] = useState([]);
    const [pedidosHistory, setPedidosHistory] = useState([]);
    const pedidosHistoryRef = useRef([]);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [filterDate, setFilterDate] = useState(todayLocalIsoDate);
    const [historyRefreshing, setHistoryRefreshing] = useState(false);
    const [reportingPedido, setReportingPedido] = useState(null);
    const [reportModalSeenCount, setReportModalSeenCount] = useState(0);
    const reportingPedidoRef = useRef(null);
    const [problemText, setProblemText] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [recentClientSearch, setRecentClientSearch] = useState('');
    const [nowTick, setNowTick] = useState(() => Date.now());
    const [viewingOrder, setViewingOrder] = useState(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const toastDismissRef = useRef(null);
    const [seenReportCounts, setSeenReportCounts] = useState(() => loadSeenReportCounts());
    const [pendingFinalized, setPendingFinalized] = useState(() => loadPendingFinalized());

    const isNewFinalizado = useCallback(
        (pedido) => pedido?.estado === 'finalizado' && Boolean(pendingFinalized[pedido.id]),
        [pendingFinalized]
    );

    const pendingFinalizadoCount = useMemo(
        () => pedidosHistory.filter((p) => isNewFinalizado(p)).length,
        [pedidosHistory, isNewFinalizado]
    );

    const recentActivity = useMemo(() => {
        const sorted = sortPedidosByRecentActivity(pedidosHistory);
        const term = recentClientSearch.trim().toLowerCase();
        const filtered = term
            ? sorted.filter((p) => (p.cliente_nombre || '').toLowerCase().includes(term))
            : sorted;
        return term ? filtered : filtered.slice(0, 10);
    }, [pedidosHistory, recentClientSearch]);

    const activityNeedsLiveTick = useMemo(
        () => recentActivity.some((p) => p.estado === 'pendiente' || p.estado === 'en_proceso'),
        [recentActivity]
    );

    useEffect(() => {
        if (!activityNeedsLiveTick) return;
        const id = setInterval(() => setNowTick(Date.now()), 1000);
        return () => clearInterval(id);
    }, [activityNeedsLiveTick]);

    const markFinalizadoSeen = useCallback((orderId) => {
        if (!orderId) return;
        setPendingFinalized((prev) => {
            if (!prev[orderId]) return prev;
            const next = { ...prev };
            delete next[orderId];
            savePendingFinalized(next);
            return next;
        });
    }, []);

    const notifyFinalizado = useCallback((order) => {
        if (!order?.id) return;
        setPendingFinalized((prev) => {
            if (prev[order.id]) return prev;
            const next = { ...prev, [order.id]: Date.now() };
            savePendingFinalized(next);
            return next;
        });
    }, []);

    const markReportThreadSeen = useCallback((pedido) => {
        const orderId = pedidoReporteId(pedido);
        if (!orderId) return;
        const seenKey = getReporteThreadSeenKey(pedido);
        setSeenReportCounts((prev) => {
            if (prev[orderId] === seenKey) return prev;
            const next = { ...prev, [orderId]: seenKey };
            localStorage.setItem(SEEN_REPORT_COUNTS_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    const isUnreadReportResponse = useCallback(
        (pedido) => {
            const mensajes = getReporteMensajes(pedido);
            if (!mensajes.length || ultimoRolMensaje(pedido) !== 'carniceria') return false;
            const orderId = pedidoReporteId(pedido);
            const stored = seenReportCounts[orderId];
            if (stored == null || stored === '') return true;
            return getReporteThreadSeenKey(pedido) !== stored;
        },
        [seenReportCounts]
    );

    const unreadAnsweredReportsCount = useMemo(
        () => pedidosHistory.filter((p) => isUnreadReportResponse(p)).length,
        [pedidosHistory, isUnreadReportResponse]
    );

    const openReportModal = useCallback((pedido) => {
        setReportModalSeenCount(getStoredSeenMessageCount(pedido, seenReportCounts));
        setReportingPedido(pedido);
        setProblemText('');
    }, [seenReportCounts]);

    const closeReportModal = useCallback(() => {
        if (reportingPedido) {
            const latest =
                pedidosHistoryRef.current.find((p) => p.id === reportingPedido.id) ?? reportingPedido;
            markReportThreadSeen(latest);
        }
        setReportingPedido(null);
        setProblemText('');
    }, [reportingPedido, markReportThreadSeen]);

    useEffect(() => {
        reportingPedidoRef.current = reportingPedido;
    }, [reportingPedido]);

    useEffect(() => {
        pedidosHistoryRef.current = pedidosHistory;
    }, [pedidosHistory]);

    useEffect(() => {
        setPendingFinalized((prev) => {
            const ids = Object.keys(prev);
            if (!ids.length) return prev;
            const byId = new Map(pedidosHistory.map((p) => [String(p.id), p]));
            let changed = false;
            const next = { ...prev };
            for (const id of ids) {
                const pedido = byId.get(id);
                if (!pedido || pedido.estado !== 'finalizado') {
                    delete next[id];
                    changed = true;
                }
            }
            if (changed) savePendingFinalized(next);
            return changed ? next : prev;
        });
    }, [pedidosHistory]);

    useEffect(() => {
        requestNotificationPermission();
    }, []);

    const openOrderDetails = useCallback((pedido) => {
        setViewingOrder(pedido);
        markFinalizadoSeen(pedido.id);
    }, [markFinalizadoSeen]);

    const closeOrderDetails = useCallback(() => {
        setViewingOrder(null);
    }, []);

    const showToast = useCallback((message, type = 'success') => {
        if (toastDismissRef.current) {
            clearTimeout(toastDismissRef.current);
            toastDismissRef.current = null;
        }
        setToast({ show: true, message, type });
        toastDismissRef.current = setTimeout(() => {
            setToast((t) => ({ ...t, show: false }));
            toastDismissRef.current = null;
        }, 4000);
    }, []);

    useEffect(() => () => {
        if (toastDismissRef.current) clearTimeout(toastDismissRef.current);
    }, []);

    useEffect(() => {
        if (!menuOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [menuOpen]);

    useEffect(() => {
        const onResize = () => {
            if (window.innerWidth > 1024) setMenuOpen(false);
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const [currentOrder, setCurrentOrder] = useState({
        cliente: '',
        items: []
    });

    const handleItemAdded = useCallback((item, editingIndex) => {
        setCurrentOrder((prev) => ({
            ...prev,
            items: editingIndex !== null
                ? prev.items.map((it, i) => (i === editingIndex ? item : it))
                : [...prev.items, item],
        }));
    }, []);

    const flow = usePedidoProductoFlow({
        tiposCorte,
        pesoUnidad: 'kg',
        onItemAdded: handleItemAdded,
    });

    const selectedCategoryIdRef = useRef(null);

    useEffect(() => {
        selectedCategoryIdRef.current = flow.selection?.category?.id ?? null;
    }, [flow.selection?.category?.id]);

    const fetchCatalogData = useCallback(async () => {
        const [categoriesResult, typesResult] = await Promise.allSettled([
            productService.getCategories(),
            productService.getTiposCorte(),
        ]);

        if (categoriesResult.status === 'fulfilled') {
            setCategories(categoriesResult.value);
        } else {
            console.error('Error fetching categories:', categoriesResult.reason);
        }

        if (typesResult.status === 'fulfilled') {
            setTiposCorte(typesResult.value);
        } else {
            console.error('Error fetching cut types:', typesResult.reason);
        }

        const catId = selectedCategoryIdRef.current;
        if (catId) {
            try {
                const res = await productService.getCortes(catId);
                setCortes(res);
            } catch (error) {
                console.error('Error fetching cortes:', error);
            }
        }
    }, []);

    const refreshPedidosHistory = useCallback(async ({ showRefreshing = false } = {}) => {
        if (!user?.sede_id) return;
        if (showRefreshing) setHistoryRefreshing(true);
        try {
            const data = await pedidoService.getAll(user.sede_id);
            setPedidosHistory(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error fetching order history:', error);
        } finally {
            if (showRefreshing) setHistoryRefreshing(false);
        }
    }, [user?.sede_id]);

    useEffect(() => {
        if (showHistoryModal && user) {
            refreshPedidosHistory({ showRefreshing: true });
        }
    }, [showHistoryModal, user, refreshPedidosHistory]);

    useEffect(() => {
        if (user) {
            socketService.connect(`sede_${user.sede_id}`);
            fetchInitialData();

            socketService.onNewOrder((newOrder) => {
                setPedidosHistory((prev) => upsertPedidoInList(prev, newOrder));
            });

            socketService.onOrderUpdate((updatedOrder) => {
                const prev = pedidosHistoryRef.current;
                const ix = prev.findIndex((p) => p.id === updatedOrder.id);
                if (ix >= 0) {
                    const prevOrder = prev[ix];
                    const prevCount = getReporteMensajes(prevOrder).length;
                    const newCount = getReporteMensajes(updatedOrder).length;
                    const nuevoDeCarniceria =
                        newCount > prevCount && ultimoRolMensaje(updatedOrder) === 'carniceria';
                    if (nuevoDeCarniceria && reportingPedidoRef.current?.id !== updatedOrder.id) {
                        const msg = `Nuevo mensaje de la carnicería · Pedido ${formatPedidoNumero(updatedOrder)}`;
                        showToast(msg, 'success');
                        notifyBrowserMessage('Pedidos Mayorista', msg);
                    }

                    const justFinalizado =
                        updatedOrder.estado === 'finalizado' && prevOrder.estado !== 'finalizado';
                    if (justFinalizado) {
                        notifyFinalizado(updatedOrder);
                        const msg = `¡Pedido ${formatPedidoNumero(updatedOrder)} listo!`;
                        showToast(msg, 'success');
                        notifyBrowserMessage('Pedidos Mayorista', msg);
                    }
                } else if (updatedOrder.estado === 'finalizado') {
                    notifyFinalizado(updatedOrder);
                    const msg = `¡Pedido ${formatPedidoNumero(updatedOrder)} listo!`;
                    showToast(msg, 'success');
                    notifyBrowserMessage('Pedidos Mayorista', msg);
                }

                setPedidosHistory((prevList) => upsertPedidoInList(prevList, updatedOrder));
                setViewingOrder((prev) => (prev?.id === updatedOrder.id ? updatedOrder : prev));
                setReportingPedido((prev) => (prev?.id === updatedOrder.id ? updatedOrder : prev));
            });

            socketService.onCatalogUpdate((payload) => {
                if (payload?.sede_id && user.sede_id && String(payload.sede_id) !== String(user.sede_id)) {
                    return;
                }
                fetchCatalogData();
            });
        }

        return () => {
            socketService.offNewOrder();
            socketService.offOrderUpdate();
            socketService.offCatalogUpdate();
            socketService.disconnect();
        };
    }, [user, fetchCatalogData]);

    const fetchInitialData = useCallback(async () => {
        await fetchCatalogData();
        await refreshPedidosHistory();
    }, [fetchCatalogData, refreshPedidosHistory]);

    const handleCategoryClick = async (cat) => {
        selectedCategoryIdRef.current = cat.id;
        flow.setSelection({ ...flow.selection, category: cat });
        try {
            const res = await productService.getCortes(cat.id);
            setCortes(res);
            flow.setStep(2);
        } catch (error) {
            console.error("Error fetching cortes:", error);
        }
    };

    const filteredCategories = useMemo(
        () => flow.filterProductItems(categories),
        [categories, flow.filterProductItems]
    );
    const filteredCortes = useMemo(
        () => flow.filterProductItems(cortes),
        [cortes, flow.filterProductItems]
    );

    const handleEditItem = (index) => {
        flow.hydrateFromCartItem(currentOrder.items[index], index);
    };

    const handleAddToCart = () => {
        const result = flow.submitPedidoItem();
        if (!result.ok && result.error) {
            showToast(result.error, 'error');
        }
    };

    const handleRemoveFromCart = (index) => {
        setCurrentOrder((prev) => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index),
        }));
    };

    const clienteNombreValido = Boolean(currentOrder.cliente?.trim());
    const puedeEnviarPedido = clienteNombreValido && currentOrder.items.length > 0;

    const handleOpenConfirmModal = () => {
        if (!puedeEnviarPedido) return;
        setShowConfirmModal(true);
    };

    const confirmSendOrder = async () => {
        if (isSubmittingOrder || !puedeEnviarPedido) return;
        setIsSubmittingOrder(true);
        try {
            const payload = {
                mayorista_id: user.id,
                cliente_nombre: currentOrder.cliente.trim(),
                sede_id: user.sede_id,
                detalles: currentOrder.items.map((item) => buildDetallePayload(item)),
            };
            const newOrder = await pedidoService.create(payload);

            setPedidosHistory((prev) => upsertPedidoInList(prev, newOrder));
            setCurrentOrder({ cliente: '', items: [] });
            flow.resetAndGoHome();
            setShowConfirmModal(false);
        } catch (error) {
            console.error("Error creating order detailed:", error.response?.data);
            showToast(
                "Error al enviar pedido: " + (error.response?.data?.detail?.[0]?.msg || error.response?.data?.detail || error.message),
                'error'
            );
        } finally {
            setIsSubmittingOrder(false);
        }
    };

    const handleReportProblem = async () => {
        const texto = problemText.trim();
        if (!texto) return;
        try {
            const { data: updated } = await api.put(`/pedidos/${reportingPedido.id}/problema`, { problema: texto });
            setPedidosHistory((prev) => prev.map((p) =>
                p.id === reportingPedido.id ? { ...p, ...updated } : p
            ));
            setReportingPedido(updated);
            setProblemText('');
            setShowHistoryModal(true);
            markReportThreadSeen(updated);
            showToast(tieneReporte(updated) && getReporteMensajes(updated).length > 1 ? 'Mensaje enviado' : 'Problema reportado con éxito', 'success');
        } catch (error) {
            console.error('Error reporting problem:', error);
            const detail = error.response?.data?.detail;
            showToast(
                typeof detail === 'string' ? detail : 'No se pudo reportar el problema',
                'error'
            );
        }
    };

    const filteredHistory = sortPedidosByRecentActivity(
        pedidosHistory.filter((p) => {
            const matchesDate = pedidoLocalDateKey(p.timestamp) === filterDate;
            const raw = searchTerm.trim().toLowerCase();
            const idPart = raw.startsWith('#') ? raw.slice(1).trim() : raw;
            const tracking = getPedidoTrackingNumber(p);
            const mayoristaText = p.mayorista
                ? [
                      formatMayoristaLabel(p.mayorista),
                      p.mayorista.username,
                      p.mayorista.nombre,
                      p.mayorista.apellido,
                  ]
                      .filter(Boolean)
                      .join(' ')
                      .toLowerCase()
                : '';
            const matchesSearch =
                !raw ||
                (p.cliente_nombre || '').toLowerCase().includes(raw) ||
                mayoristaText.includes(raw) ||
                p.id.toString().includes(idPart) ||
                (p.numero_pedido && String(p.numero_pedido).toLowerCase().includes(raw)) ||
                (tracking && idPart && tracking.includes(idPart));
            return matchesDate && matchesSearch;
        })
    );

    const formatDuration = (start, end) => {
        if (!start || !end) return "En espera...";
        const diff = new Date(end) - new Date(start);
        const minutes = Math.floor(diff / 60000);
        const seconds = ((diff % 60000) / 1000).toFixed(0);
        return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    };

    return (
        <div className={styles.container}>
            <header className={styles.mobileTopBar}>
                <button
                    type="button"
                    className={styles.menuToggle}
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
                    aria-expanded={menuOpen}
                >
                    {menuOpen ? <X size={22} /> : <Menu size={22} />}
                </button>
                <div className={styles.mobileLogo}>
                    Pedidos <span>Mayorista</span> <small>| Mayorista</small>
                </div>
                <span className={styles.mobileTopSpacer} aria-hidden="true" />
            </header>

            {menuOpen && (
                <button
                    type="button"
                    className={styles.mobileNavBackdrop}
                    onClick={() => setMenuOpen(false)}
                    aria-label="Cerrar menú"
                />
            )}

            <nav className={`${styles.mobileNav} ${menuOpen ? styles.mobileNavOpen : ''}`}>
                <div className={styles.mobileNavLogo}>Pedidos <span>Mayorista</span></div>
                <p className={styles.mobileNavUser}>{user?.username}</p>
                <button
                    type="button"
                    className={styles.mobileNavItem}
                    onClick={() => { setShowHistoryModal(true); setMenuOpen(false); }}
                >
                    <History size={20} /> Historial Global
                    {unreadAnsweredReportsCount > 0 && (
                        <span className={styles.navBadge}>{unreadAnsweredReportsCount}</span>
                    )}
                </button>
                <button
                    type="button"
                    className={`${styles.mobileNavItem} ${styles.mobileNavLogout}`}
                    onClick={() => { setMenuOpen(false); logout(); }}
                >
                    <LogOut size={20} /> Cerrar Sesión
                </button>
            </nav>

            <header className={`${styles.header} glass-card`}>
                <div className={styles.logo}>Pedidos <span>Mayorista</span> <small>| Mayorista</small></div>

                <div className={styles.headerActions}>
                    <button
                        type="button"
                        className={`${styles.actionBtn} glass-card ${styles.btnWithBadge}`}
                        onClick={() => setShowHistoryModal(true)}
                    >
                        <History size={18} /> Historial Global
                        {unreadAnsweredReportsCount > 0 && (
                            <span className={styles.notifBubble} aria-label={`${unreadAnsweredReportsCount} respuestas nuevas`}>
                                {unreadAnsweredReportsCount > 9 ? '9+' : unreadAnsweredReportsCount}
                            </span>
                        )}
                    </button>
                    <div className={styles.userInfo}>
                        <span>{user?.username}</span>
                        <button type="button" onClick={logout} className={styles.logoutBtn}><LogOut size={18} /></button>
                    </div>
                </div>
            </header>

            <main className={styles.mainGrid}>
                {/* Column 1: Current Summary */}
                <aside className={`${styles.column} ${styles.summaryColumn} glass-card`}>
                    <h2 className={styles.colTitle}><ShoppingCart size={20} /> Pedido Actual</h2>
                    <div className={styles.clientSection}>
                        <label>Cliente</label>
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Nombre del cliente"
                            value={currentOrder.cliente}
                            onChange={(e) => setCurrentOrder({ ...currentOrder, cliente: e.target.value })}
                        />
                    </div>
                    <div className={styles.itemsList}>
                        {currentOrder.items.length === 0 ? (
                            <p className={styles.emptyMsg}>No hay artículos agregados</p>
                        ) : (
                            currentOrder.items.map((item, idx) => (
                                <div key={idx} className={styles.orderItem}>
                                    <div className={styles.itemMain}>
                                        <div className={styles.itemInfo}>
                                            <span className={styles.itemName}>{item.name} - {item.type}</span>
                                            {item.observaciones && (
                                                <span className={styles.itemObs}>{item.observaciones}</span>
                                            )}
                                        </div>
                                        <span className={styles.itemQty}>{formatItemCantidad(item)}</span>
                                    </div>
                                    <div className={styles.itemActions}>
                                        <button className={styles.actionIconButton} onClick={() => handleEditItem(idx)} title="Editar">
                                            <Edit2 size={14} />
                                        </button>
                                        <button className={`${styles.actionIconButton} ${styles.delete}`} onClick={() => handleRemoveFromCart(idx)} title="Eliminar">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <button
                        type="button"
                        className="premium-button"
                        style={{ width: '100%', marginTop: 'auto' }}
                        disabled={!puedeEnviarPedido}
                        onClick={handleOpenConfirmModal}
                        title={
                            !clienteNombreValido
                                ? 'Ingresá el nombre del cliente para enviar el pedido'
                                : currentOrder.items.length === 0
                                  ? 'Agregá al menos un producto al pedido'
                                  : undefined
                        }
                    >
                        Enviar a Carnicería
                    </button>
                </aside>

                {/* Column 2: Product Selector */}
                <section className={`${styles.column} ${styles.selectorColumn} glass-card`}>
                    <PedidoProductoFlow
                        step={flow.step}
                        tiposCorte={tiposCorte}
                        selection={flow.selection}
                        pedidoModo={flow.pedidoModo}
                        modoCantidad={flow.modoCantidad}
                        filteredCategories={filteredCategories}
                        filteredCortes={filteredCortes}
                        filteredTiposCorte={flow.filteredTiposCorte}
                        productSearch={flow.productSearch}
                        setProductSearch={flow.setProductSearch}
                        productSearchPlaceholder={flow.productSearchPlaceholder}
                        showProductSearch={flow.showProductSearch}
                        onCategoryClick={handleCategoryClick}
                        onCorteSelect={flow.handleCorteSelect}
                        onSelectPedidoModo={flow.handleSelectPedidoModo}
                        onSelectTipoCorte={flow.handleSelectTipoCorte}
                        onSelectSubmodoPorciones={flow.handleSelectSubmodoPorciones}
                        onSelectorBack={flow.handleSelectorBack}
                        tempPorciones={flow.tempPorciones}
                        setTempPorciones={flow.setTempPorciones}
                        tempGramosPorcion={flow.tempGramosPorcion}
                        setTempGramosPorcion={flow.setTempGramosPorcion}
                        tempPesoTotal={flow.tempPesoTotal}
                        setTempPesoTotal={flow.setTempPesoTotal}
                        tempObs={flow.tempObs}
                        setTempObs={flow.setTempObs}
                        onSubmit={handleAddToCart}
                        isEditing={flow.editingIndex !== null}
                        pesoUnidad="kg"
                        styles={styles}
                        gridClassName={styles.grid}
                        headerTitle="Selector de Productos"
                    />
                </section>

                {/* Column 3: History (Sidebar) */}
                <aside className={`${styles.column} ${styles.historyColumn} glass-card`}>
                    <h2 className={styles.colTitle}>
                        <History size={20} /> Actividad Reciente
                        {pendingFinalizadoCount > 0 && (
                            <span className={styles.colNotifBadge}>{pendingFinalizadoCount}</span>
                        )}
                    </h2>
                    <div className={styles.historySearch}>
                        <Search size={16} aria-hidden />
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Buscar por cliente..."
                            value={recentClientSearch}
                            onChange={(e) => setRecentClientSearch(e.target.value)}
                            aria-label="Buscar pedidos por nombre del cliente"
                        />
                        {recentClientSearch && (
                            <button
                                type="button"
                                className={styles.historySearchClear}
                                onClick={() => setRecentClientSearch('')}
                                aria-label="Limpiar búsqueda"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    <div className={styles.historyList}>
                        {pedidosHistory.length === 0 ? (
                            <p className={styles.emptyMsg}>No hay pedidos aún</p>
                        ) : recentActivity.length === 0 ? (
                            <p className={styles.emptyMsg}>No hay pedidos para ese cliente.</p>
                        ) : (
                            recentActivity.map((item) => {
                                const timeInfo = getPedidoActivityCardTime(item, nowTick);
                                return (
                                <div
                                    key={item.id}
                                    className={`${styles.historyCard} ${styles[item.estado]} ${isNewFinalizado(item) ? styles.finalizadoNuevo : ''} ${isUnreadReportResponse(item) ? styles.historyCardNotif : ''}`}
                                    onClick={() => openOrderDetails(item)}
                                    style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
                                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                    {isNewFinalizado(item) && (
                                        <span className={styles.nuevoBadge}>Nuevo</span>
                                    )}
                                    {isUnreadReportResponse(item) && (
                                        <span
                                            className={styles.historyCardNotifBubble}
                                            title="Nuevo mensaje en el reporte"
                                            aria-label="Nuevo mensaje en el reporte"
                                        />
                                    )}
                                    <div className={styles.historyInfo}>
                                        <strong>{formatPedidoNumero(item)} - {item.cliente_nombre}</strong>
                                        <span className={styles.historyCardTime} title={timeInfo.label}>
                                            {timeInfo.label && (
                                                <span className={styles.historyCardTimeLabel}>
                                                    {timeInfo.label}:{' '}
                                                </span>
                                            )}
                                            {timeInfo.value}
                                        </span>
                                    </div>
                                    <span className={styles.statusBadge}>{item.estado.replace('_', ' ')}</span>
                                </div>
                                );
                            })
                        )}
                    </div>
                </aside>
            </main>

            {/* Modal de Historial Global */}
            {showHistoryModal && (
                <div className={styles.modalOverlay}>
                    <div className={`${styles.modalContent} glass-card`}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitleWithBadge}>
                                <Search size={22} /> Consulta de Pedidos
                                {unreadAnsweredReportsCount > 0 && (
                                    <span className={styles.notifBubbleInline}>{unreadAnsweredReportsCount}</span>
                                )}
                            </h2>
                            <button onClick={() => setShowHistoryModal(false)} className={styles.closeBtn}><X size={24} /></button>
                        </div>

                        <div className={styles.filterSection}>
                            <div className={styles.dateInputGroup}>
                                <label><Calendar size={16} /> Filtrar por día:</label>
                                <input
                                    type="date"
                                    className={`input-field ${styles.dateInput}`}
                                    value={filterDate}
                                    onChange={(e) => setFilterDate(e.target.value)}
                                />
                            </div>
                            <div className={styles.searchWrapper}>
                                <Search size={16} />
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="Buscar por cliente, mayorista, ID o número (#12)..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <button
                                type="button"
                                className={styles.refreshHistoryBtn}
                                onClick={() => refreshPedidosHistory({ showRefreshing: true })}
                                disabled={historyRefreshing}
                                title="Volver a cargar pedidos desde el servidor"
                            >
                                <RefreshCw size={18} aria-hidden /> {historyRefreshing ? 'Actualizando…' : 'Actualizar lista'}
                            </button>
                        </div>

                        <div className={styles.globalList}>
                            <table className={styles.historyTable}>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Hora</th>
                                        <th>Cliente</th>
                                        <th>Mayorista</th>
                                        <th>Estado</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredHistory.map(p => (
                                        <tr
                                            key={p.id}
                                            className={isNewFinalizado(p) ? styles.rowFinalizadoNuevo : undefined}
                                        >
                                            <td>
                                                <strong>{formatPedidoNumero(p)}</strong>
                                                {isNewFinalizado(p) && (
                                                    <span className={styles.nuevoBadgeInline}>Nuevo</span>
                                                )}
                                            </td>
                                            <td>{new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                            <td>{p.cliente_nombre}</td>
                                            <td>{formatMayoristaLabel(p.mayorista)}</td>
                                            <td>
                                                <span className={`${styles.statusBadge} ${styles[p.estado]}`}>
                                                    {p.estado.replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td>
                                                <div className={styles.tableActions}>
                                                    <button
                                                        className={styles.detailBtn}
                                                        onClick={() => openOrderDetails(p)}
                                                    >
                                                        <Search size={14} /> Detalles
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`${styles.reportBtn} ${styles.btnWithBadge} ${tieneReporte(p) ? styles.reportBtnAnswered : ''}`}
                                                        title={tieneReporte(p) ? 'Ver conversación y enviar mensajes' : 'Informar un problema en este pedido'}
                                                        onClick={() => openReportModal(p)}
                                                    >
                                                        <AlertCircle size={14} />
                                                        {tieneReporte(p) ? 'Ver reporte' : 'Reportar'}
                                                        {isUnreadReportResponse(p) && (
                                                            <span className={styles.reportBtnDot} aria-hidden />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {filteredHistory.length === 0 && (
                                <div className={styles.emptySearch}>
                                    <Search size={48} />
                                    <p>{historyRefreshing ? 'Cargando pedidos…' : 'No se encontraron pedidos para esta fecha o búsqueda.'}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {reportingPedido && (
                <ReportChatModal
                    order={reportingPedido}
                    seenMessageCount={reportModalSeenCount}
                    message={problemText}
                    onMessageChange={setProblemText}
                    onClose={closeReportModal}
                    onSubmit={handleReportProblem}
                    perspective="mayorista"
                    hintExtra={
                        <>
                            Cliente: <strong>{reportingPedido.cliente_nombre}</strong>
                            {' · '}
                            Estado:{' '}
                            <span
                                className={`${styles.statusBadge} ${styles[reportingPedido.estado]}`}
                            >
                                {reportingPedido.estado.replace('_', ' ')}
                            </span>
                        </>
                    }
                    footerLink={{
                        label: 'Ver detalles del pedido',
                        icon: 'package',
                        onClick: () => {
                            const order = reportingPedido;
                            closeReportModal();
                            openOrderDetails(order);
                        },
                    }}
                />
            )}
            {/* Modal de Detalles del Pedido */}
            {viewingOrder && (
                <div className={styles.modalOverlay} style={{ zIndex: 1200 }}>
                    <div className={`${styles.modalContent} glass-card`} style={{ maxWidth: '600px' }}>
                        <div className={styles.modalHeader}>
                            <h2><Package size={22} /> Detalles del Pedido {formatPedidoNumero(viewingOrder)}</h2>
                            <button type="button" onClick={closeOrderDetails} className={styles.closeBtn}><X size={24} /></button>
                        </div>

                        <div className={styles.detailGrid}>
                            <div className={styles.detailSection}>
                                <h3>Información General</h3>
                                <p><strong>Cliente:</strong> {viewingOrder.cliente_nombre}</p>
                                <p><strong>Mayorista:</strong> {formatMayoristaLabel(viewingOrder.mayorista)}</p>
                                <p><strong>Estado:</strong> <span className={`${styles.statusBadge} ${styles[viewingOrder.estado]}`}>{viewingOrder.estado}</span></p>
                                <p><strong>Sede:</strong> {viewingOrder.sede?.nombre || 'General'}</p>
                            </div>

                            <div className={styles.detailSection}>
                                <h3>Carnicería</h3>
                                <p><strong>Responsable:</strong> {formatCarniceroLabel(viewingOrder.carnicero)}</p>
                                <p><strong>Tiempo de espera:</strong> {formatDuration(viewingOrder.timestamp, viewingOrder.started_at)}</p>
                                <p><strong>Tiempo preparación:</strong> {formatDuration(viewingOrder.started_at, viewingOrder.finished_at)}</p>
                                <p><strong>Proceso total:</strong> {formatDuration(viewingOrder.timestamp, viewingOrder.finished_at)}</p>
                            </div>
                        </div>

                        <div className={styles.itemsTableWrapper}>
                            <h3>Items del Pedido</h3>
                            <table className={styles.itemsTable}>
                                <thead>
                                    <tr>
                                        <th>Corte</th>
                                        <th>Preparación</th>
                                        <th>Observaciones</th>
                                        <th>Cantidad</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {viewingOrder.detalles.map((d, i) => (
                                        <tr key={i}>
                                            <td>{d.corte?.nombre}</td>
                                            <td>{d.tipo_corte?.nombre}</td>
                                            <td style={{ color: '#f39c12', maxWidth: '200px', wordBreak: 'break-word', whiteSpace: 'normal' }}>{d.observaciones}</td>
                                            <td>{formatDetalleCantidad(d)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className={styles.modalActions}>
                            <button
                                type="button"
                                className={`${styles.reportBtn} ${styles.modalReportBtn} ${styles.btnWithBadge} ${tieneReporte(viewingOrder) ? styles.reportBtnAnswered : ''}`}
                                onClick={() => {
                                    const order = pedidosHistory.find((p) => p.id === viewingOrder.id) ?? viewingOrder;
                                    closeOrderDetails();
                                    openReportModal(order);
                                }}
                            >
                                <AlertCircle size={16} />
                                {tieneReporte(viewingOrder) ? 'Ver reporte' : 'Reportar'}
                                {isUnreadReportResponse(viewingOrder) && (
                                    <span className={styles.reportBtnDot} aria-hidden />
                                )}
                            </button>
                            <button type="button" className="premium-button" style={{ flex: 1 }} onClick={closeOrderDetails}>
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Confirmación de Pedido */}
            {showConfirmModal && (
                <div className={styles.modalOverlay} style={{ zIndex: 1300 }}>
                    <div className={`${styles.modalContent} glass-card`} style={{ maxWidth: '500px' }}>
                        <div className={styles.modalHeader}>
                            <h2><Package size={22} /> Confirmar Envío</h2>
                            <button onClick={() => setShowConfirmModal(false)} className={styles.closeBtn}><X size={24} /></button>
                        </div>

                        <div className={styles.confirmSummary}>
                            <p><strong>Cliente:</strong> {currentOrder.cliente}</p>
                            <p><strong>Total Items:</strong> {currentOrder.items.length}</p>

                            <div className={styles.confirmScrollList}>
                                {currentOrder.items.map((item, idx) => (
                                    <div key={idx} className={styles.confirmItem}>
                                        <div style={{ flex: 1 }}>
                                            <span>{item.name} - {item.type}</span>
                                            {item.observaciones && (
                                                <div style={{ fontSize: '0.85rem', color: '#f39c12', fontStyle: 'italic', marginTop: '2px', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                                                    {item.observaciones}
                                                </div>
                                            )}
                                        </div>
                                        <strong>{formatItemCantidad(item)}</strong>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className={styles.warningMsg}>
                            <AlertCircle size={16} />
                            <span>Una vez enviado no se puede modificar el pedido</span>
                        </div>

                        <div className={styles.modalActions}>
                            <button
                                className="premium-button"
                                style={{ background: 'rgba(255, 255, 255, 0.05)', flex: 1 }}
                                onClick={() => setShowConfirmModal(false)}
                            >
                                Modificar
                            </button>
                            <button
                                className="premium-button"
                                style={{ flex: 2 }}
                                onClick={confirmSendOrder}
                                disabled={isSubmittingOrder || !puedeEnviarPedido}
                            >
                                {isSubmittingOrder ? 'Enviando…' : 'Confirmar y Enviar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast.show && (
                <div className={styles.toastContainer} role="status" aria-live="polite">
                    <div
                        className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : styles.toastSuccess}`}
                    >
                        {toast.type === 'success' ? (
                            <CheckCircle size={20} color="#2ecc71" aria-hidden />
                        ) : (
                            <AlertTriangle size={20} color="#ef4444" aria-hidden />
                        )}
                        <span>{toast.message}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Mayorista;
