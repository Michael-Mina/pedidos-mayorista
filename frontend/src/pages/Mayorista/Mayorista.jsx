import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import api, { pedidoService, productService } from '../../services/api';
import { socketService } from '../../services/api/socket';
import styles from './Mayorista.module.css';
import { ShoppingCart, Package, History, LogOut, Plus, Trash2, Clock, Filter, Calendar, Search, X, AlertCircle, Minus, Edit2, Menu, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { formatPedidoNumero, getPedidoTrackingNumber } from '../../utils/pedidos';
import { getReporteMensajes, tieneReporte, ultimoRolMensaje, etiquetaRolMensaje } from '../../utils/reporteMensajes';

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

const Mayorista = () => {
    const { user, logout } = useAuth();
    const [step, setStep] = useState(1);
    const [categories, setCategories] = useState([]);
    const [cortes, setCortes] = useState([]);
    const [tiposCorte, setTiposCorte] = useState([]);
    const [pedidosHistory, setPedidosHistory] = useState([]);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [filterDate, setFilterDate] = useState(todayLocalIsoDate);
    const [historyRefreshing, setHistoryRefreshing] = useState(false);
    const [reportingPedido, setReportingPedido] = useState(null);
    const [problemText, setProblemText] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [viewingOrder, setViewingOrder] = useState(null);
    const [tempQty, setTempQty] = useState(1.0);
    const [tempObs, setTempObs] = useState('');
    const [editingIndex, setEditingIndex] = useState(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const toastDismissRef = useRef(null);
    const [seenReportCounts, setSeenReportCounts] = useState(() => loadSeenReportCounts());

    const markReportThreadSeen = useCallback((pedido) => {
        const count = getReporteMensajes(pedido).length;
        setSeenReportCounts((prev) => {
            if (prev[pedido.id] === count) return prev;
            const next = { ...prev, [pedido.id]: count };
            localStorage.setItem(SEEN_REPORT_COUNTS_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    const isUnreadReportResponse = useCallback(
        (pedido) => {
            const mensajes = getReporteMensajes(pedido);
            if (!mensajes.length || ultimoRolMensaje(pedido) !== 'carniceria') return false;
            const seen = seenReportCounts[pedido.id] ?? 0;
            return mensajes.length > seen;
        },
        [seenReportCounts]
    );

    const unreadAnsweredReportsCount = useMemo(
        () => pedidosHistory.filter((p) => isUnreadReportResponse(p)).length,
        [pedidosHistory, isUnreadReportResponse]
    );

    const openReportModal = useCallback((pedido) => {
        setReportingPedido(pedido);
        setProblemText('');
        markReportThreadSeen(pedido);
    }, [markReportThreadSeen]);

    const closeReportModal = useCallback(() => {
        setReportingPedido(null);
        setProblemText('');
    }, []);

    const openOrderDetails = useCallback((pedido) => {
        setViewingOrder(pedido);
        if (tieneReporte(pedido)) {
            markReportThreadSeen(pedido);
        }
    }, [markReportThreadSeen]);

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

    const [selection, setSelection] = useState({
        category: null,
        corte: null,
        tipoCorte: null
    });
    const [currentOrder, setCurrentOrder] = useState({
        cliente: '',
        items: []
    });

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
                setPedidosHistory((prev) => {
                    if (prev.some((p) => p.id === newOrder.id)) return prev;
                    return [newOrder, ...prev];
                });
            });

            socketService.onOrderUpdate((updatedOrder) => {
                setPedidosHistory((prev) => {
                    const ix = prev.findIndex((p) => p.id === updatedOrder.id);
                    if (ix === -1) return [updatedOrder, ...prev];
                    const prevOrder = prev[ix];

                    // Notificar cuando el reporte pasa de "pendiente" -> "respondido"
                    const prevCount = getReporteMensajes(prevOrder).length;
                    const newCount = getReporteMensajes(updatedOrder).length;
                    const nuevoDeCarniceria =
                        newCount > prevCount && ultimoRolMensaje(updatedOrder) === 'carniceria';

                    if (nuevoDeCarniceria) {
                        showToast('Nuevo mensaje de la carnicería en su reporte.', 'success');
                    }

                    const next = [...prev];
                    next[ix] = updatedOrder;
                    return next;
                });
                setViewingOrder((prev) => (prev?.id === updatedOrder.id ? updatedOrder : prev));
            });
        }

        return () => {
            socketService.offNewOrder();
            socketService.offOrderUpdate();
            socketService.disconnect();
        };
    }, [user]);

    const fetchInitialData = async () => {
        const [categoriesResult, typesResult] = await Promise.allSettled([
            productService.getCategories(),
            productService.getTiposCorte()
        ]);

        await refreshPedidosHistory();

        if (categoriesResult.status === 'fulfilled') {
            setCategories(categoriesResult.value);
        } else {
            console.error("Error fetching categories:", categoriesResult.reason);
        }

        if (typesResult.status === 'fulfilled') {
            setTiposCorte(typesResult.value);
        } else {
            console.error("Error fetching cut types:", typesResult.reason);
        }
    };

    const handleCategoryClick = async (cat) => {
        setSelection({ ...selection, category: cat });
        try {
            const res = await productService.getCortes(cat.id);
            setCortes(res);
            setStep(2);
        } catch (error) {
            console.error("Error fetching cortes:", error);
        }
    };

    const handleCorteClick = (corte) => {
        setSelection({ ...selection, corte: corte });
        setStep(3);
    };

    const handleTipoCorteClick = (tipo) => {
        setSelection({ ...selection, tipoCorte: tipo });
        setStep(4);
    };

    const handleAddToCart = () => {
        if (tempQty <= 0) {
            alert("La cantidad debe ser mayor a 0");
            return;
        }
        const newItem = {
            corte_id: selection.corte.id,
            tipo_corte_id: selection.tipoCorte.id,
            name: selection.corte.nombre,
            type: selection.tipoCorte.nombre,
            qty: tempQty,
            observaciones: tempObs
        };

        if (editingIndex !== null) {
            const updatedItems = [...currentOrder.items];
            updatedItems[editingIndex] = newItem;
            setCurrentOrder({ ...currentOrder, items: updatedItems });
            setEditingIndex(null);
        } else {
            setCurrentOrder({ ...currentOrder, items: [...currentOrder.items, newItem] });
        }

        setStep(1);
        setSelection({ category: null, corte: null, tipoCorte: null });
        setTempQty(1.0);
        setTempObs('');
    };

    const handleRemoveFromCart = (index) => {
        const updatedItems = currentOrder.items.filter((_, i) => i !== index);
        setCurrentOrder({ ...currentOrder, items: updatedItems });
    };

    const handleEditItem = (index) => {
        const item = currentOrder.items[index];
        setSelection({
            corte: { id: item.corte_id, nombre: item.name },
            tipoCorte: { id: item.tipo_corte_id, nombre: item.type }
        });
        setTempQty(item.qty);
        setTempObs(item.observaciones || '');
        setEditingIndex(index);
        setStep(4);
        // We set step 4 directly to modify qty/obs
    };

    const handleOpenConfirmModal = () => {
        if (!currentOrder.cliente || currentOrder.items.length === 0) return;
        setShowConfirmModal(true);
    };

    const confirmSendOrder = async () => {
        try {
            const payload = {
                mayorista_id: user.id,
                cliente_nombre: currentOrder.cliente,
                sede_id: user.sede_id,
                observaciones: "Pedido desde App",
                detalles: currentOrder.items.map(item => ({
                    corte_id: item.corte_id,
                    tipo_corte_id: item.tipo_corte_id,
                    cantidad_kg: item.qty,
                    observaciones: item.observaciones
                }))
            };
            const newOrder = await pedidoService.create(payload);

            setPedidosHistory(prev => [newOrder, ...prev]);
            setCurrentOrder({ cliente: '', items: [] });
            setStep(1);
            setShowConfirmModal(false);
        } catch (error) {
            console.error("Error creating order detailed:", error.response?.data);
            alert("Error al enviar pedido: " + (error.response?.data?.detail?.[0]?.msg || error.response?.data?.detail || error.message));
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

    const filteredHistory = pedidosHistory
        .filter((p) => {
            const matchesDate = pedidoLocalDateKey(p.timestamp) === filterDate;
            const raw = searchTerm.trim().toLowerCase();
            const idPart = raw.startsWith('#') ? raw.slice(1).trim() : raw;
            const tracking = getPedidoTrackingNumber(p);
            const matchesSearch =
                !raw ||
                (p.cliente_nombre || '').toLowerCase().includes(raw) ||
                p.id.toString().includes(idPart) ||
                (p.numero_pedido && String(p.numero_pedido).toLowerCase().includes(raw)) ||
                (tracking && idPart && tracking.includes(idPart));
            return matchesDate && matchesSearch;
        })
        .sort((a, b) => b.id - a.id);

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
                                        <span className={styles.itemQty}>{item.qty}kg</span>
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
                        className="premium-button"
                        style={{ width: '100%', marginTop: 'auto' }}
                        disabled={currentOrder.items.length === 0 || !currentOrder.cliente}
                        onClick={handleOpenConfirmModal}
                    >
                        Enviar a Carnicería
                    </button>
                </aside>

                {/* Column 2: Product Selector */}
                <section className={`${styles.column} ${styles.selectorColumn} glass-card`}>
                    <h2 className={styles.colTitle}><Package size={20} /> Selector de Productos</h2>

                    {step === 1 && (
                        <div className={styles.grid}>
                            {categories.map(cat => (
                                <div key={cat.id} className={styles.card} onClick={() => handleCategoryClick(cat)}>
                                    {cat.imagen_url ? (
                                        <img src={cat.imagen_url} alt={cat.nombre} className={styles.cardImg} />
                                    ) : (
                                        <span className={styles.cardIcon}>🥩</span>
                                    )}
                                    <h3>{cat.nombre}</h3>
                                </div>
                            ))}
                        </div>
                    )}

                    {step === 2 && (
                        <div>
                            <button onClick={() => setStep(1)} className={styles.backBtn}>← Volver a Categorías</button>
                            <div className={styles.grid}>
                                {cortes.map(corte => (
                                    <div key={corte.id} className={styles.card} onClick={() => handleCorteClick(corte)}>
                                        {corte.imagen_url ? (
                                            <img src={corte.imagen_url} alt={corte.nombre} className={styles.cardImg} />
                                        ) : (
                                            <span className={styles.cardIcon}>🥓</span>
                                        )}
                                        <h3>{corte.nombre}</h3>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div>
                            <button onClick={() => setStep(2)} className={styles.backBtn}>← Volver a Productos</button>
                            <div className={styles.grid}>
                                {((selection.corte?.tipos_corte && selection.corte.tipos_corte.length > 0) ? selection.corte.tipos_corte : tiposCorte).map(tipo => (
                                    <div key={tipo.id} className={styles.card} onClick={() => handleTipoCorteClick(tipo)}>
                                        <span className={styles.cardIcon}>🔪</span>
                                        <h3>{tipo.nombre}</h3>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className={styles.qtyForm}>
                            <button onClick={() => setStep(3)} className={styles.backBtn}>← Volver a Preparación</button>
                            <h3>{selection.corte?.nombre} - {selection.tipoCorte?.nombre}</h3>
                            <div className={styles.formGroup}>
                                <label>Kilogramos</label>
                                <div className={styles.qtyControl}>
                                    <button
                                        className={styles.qtyBtn}
                                        onClick={() => setTempQty(prev => Math.max(0.5, prev - 0.5))}
                                    >
                                        <Minus size={16} />
                                    </button>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className={`${styles.qtyInput} input-field`}
                                        value={tempQty}
                                        onChange={(e) => {
                                            const val = parseFloat(e.target.value);
                                            if (val > 0) setTempQty(val);
                                            else if (e.target.value === "") setTempQty("");
                                        }}
                                        onBlur={() => {
                                            if (!tempQty || tempQty <= 0) setTempQty(1.0);
                                        }}
                                    />
                                    <button
                                        className={styles.qtyBtn}
                                        onClick={() => setTempQty(prev => (parseFloat(prev) || 0) + 0.5)}
                                    >
                                        <Plus size={16} />
                                    </button>
                                </div>
                            </div>
                            <div className={styles.formGroup}>
                                <label>Observaciones</label>
                                <textarea
                                    className="input-field"
                                    rows="3"
                                    placeholder="Ej: Sin grasa..."
                                    value={tempObs}
                                    onChange={(e) => setTempObs(e.target.value)}
                                ></textarea>
                            </div>
                            <button className="premium-button" onClick={handleAddToCart}>
                                <Plus size={18} /> Agregar al pedido
                            </button>
                        </div>
                    )}
                </section>

                {/* Column 3: History (Sidebar) */}
                <aside className={`${styles.column} ${styles.historyColumn} glass-card`}>
                    <h2 className={styles.colTitle}><History size={20} /> Actividad Reciente</h2>
                    <div className={styles.historyList}>
                        {pedidosHistory.length === 0 ? (
                            <p className={styles.emptyMsg}>No hay pedidos aún</p>
                        ) : (
                            pedidosHistory.slice(0, 10).map(item => (
                                <div
                                    key={item.id}
                                    className={`${styles.historyCard} ${styles[item.estado]}`}
                                    onClick={() => openOrderDetails(item)}
                                    style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
                                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                    <div className={styles.historyInfo}>
                                        <strong>{formatPedidoNumero(item)} - {item.cliente_nombre}</strong>
                                        <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <span className={styles.statusBadge}>{item.estado.replace('_', ' ')}</span>
                                </div>
                            ))
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
                                    placeholder="Buscar por cliente, ID o número (#12)..."
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
                                        <th>Estado</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredHistory.map(p => (
                                        <tr key={p.id}>
                                            <td><strong>{formatPedidoNumero(p)}</strong></td>
                                            <td>{new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                            <td>{p.cliente_nombre}</td>
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

            {/* Modal de Reporte de Problema */}
            {reportingPedido && (
                <div className={styles.modalOverlay} style={{ zIndex: 1100 }}>
                    <div className={`${styles.modalContent} glass-card`} style={{ maxWidth: '480px' }}>
                        <h3>
                            Reporte · Pedido {formatPedidoNumero(reportingPedido)}
                        </h3>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                            {tieneReporte(reportingPedido)
                                ? 'Puede seguir enviando mensajes y ver el historial con la carnicería.'
                                : 'Describa el inconveniente para iniciar el reporte con la carnicería.'}
                        </p>

                        {tieneReporte(reportingPedido) && (
                            <div className={styles.chatThread}>
                                {getReporteMensajes(reportingPedido).map((msg, idx) => (
                                    <div
                                        key={`${idx}-${msg.at || ''}`}
                                        className={msg.rol === 'mayorista' ? styles.chatBubbleSelf : styles.chatBubbleOther}
                                    >
                                        <span className={styles.chatBubbleLabel}>{etiquetaRolMensaje(msg.rol)}</span>
                                        <p className={styles.chatBubbleText}>{msg.texto}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        <textarea
                            className="input-field"
                            rows="3"
                            placeholder={tieneReporte(reportingPedido) ? 'Escriba un mensaje...' : 'Ej: Faltó un corte, peso incorrecto...'}
                            value={problemText}
                            onChange={(e) => setProblemText(e.target.value)}
                        />

                        <div className={styles.modalActions}>
                            <button
                                type="button"
                                className="premium-button"
                                style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}
                                onClick={closeReportModal}
                            >
                                Cerrar
                            </button>
                            <button
                                type="button"
                                className="premium-button"
                                onClick={handleReportProblem}
                                disabled={!problemText.trim()}
                            >
                                {tieneReporte(reportingPedido) ? 'Enviar mensaje' : 'Enviar reporte'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Detalles del Pedido */}
            {viewingOrder && (
                <div className={styles.modalOverlay} style={{ zIndex: 1200 }}>
                    <div className={`${styles.modalContent} glass-card`} style={{ maxWidth: '600px' }}>
                        <div className={styles.modalHeader}>
                            <h2><Package size={22} /> Detalles del Pedido {formatPedidoNumero(viewingOrder)}</h2>
                            <button onClick={() => setViewingOrder(null)} className={styles.closeBtn}><X size={24} /></button>
                        </div>

                        <div className={styles.detailGrid}>
                            <div className={styles.detailSection}>
                                <h3>Información General</h3>
                                <p><strong>Cliente:</strong> {viewingOrder.cliente_nombre}</p>
                                <p><strong>Estado:</strong> <span className={`${styles.statusBadge} ${styles[viewingOrder.estado]}`}>{viewingOrder.estado}</span></p>
                                <p><strong>Sede:</strong> {viewingOrder.sede?.nombre || 'General'}</p>
                            </div>

                            <div className={styles.detailSection}>
                                <h3>Carnicería</h3>
                                <p><strong>Responsable:</strong> {viewingOrder.carnicero?.username || 'Sin asignar'}</p>
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
                                            <td>{d.cantidad_kg} kg</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {tieneReporte(viewingOrder) && (
                            <div className={styles.detailReportSection}>
                                <h3>Conversación del reporte</h3>
                                <div className={styles.chatThread}>
                                    {getReporteMensajes(viewingOrder).map((msg, idx) => (
                                        <div
                                            key={`${idx}-${msg.at || ''}`}
                                            className={msg.rol === 'mayorista' ? styles.chatBubbleSelf : styles.chatBubbleOther}
                                        >
                                            <span className={styles.chatBubbleLabel}>{etiquetaRolMensaje(msg.rol)}</span>
                                            <p className={styles.chatBubbleText}>{msg.texto}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className={styles.modalActions}>
                            <button className="premium-button" style={{ width: '100%' }} onClick={() => setViewingOrder(null)}>Cerrar</button>
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
                                        <strong>{item.qty} kg</strong>
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
                            >
                                Confirmar y Enviar
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
