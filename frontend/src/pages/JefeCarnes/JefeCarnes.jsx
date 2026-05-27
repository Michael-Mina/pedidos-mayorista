import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import api, { pedidoService } from '../../services/api';
import { socketService } from '../../services/api/socket';
import {
    History,
    Clock,
    AlertTriangle,
    CheckCircle,
    Power,
    RefreshCcw,
    Activity,
    Eraser,
    Monitor,
    X,
    Package,
    Users,
    UserPlus,
    ToggleLeft,
    ToggleRight,
    Edit2,
    Trash2,
    Info,
    Menu,
    MessageSquare,
    Calendar,
    Search
} from 'lucide-react';
import styles from './JefeCarnes.module.css';
import { formatPedidoNumero } from '../../utils/pedidos';
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

const SEEN_REPORT_COUNTS_KEY = 'jefe_seen_report_msg_counts';

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

const JefeCarnes = () => {
    const { user, logout } = useAuth();
    const [globalOrders, setGlobalOrders] = useState([]);
    const globalOrdersRef = useRef([]);
    const [activeTab, setActiveTab] = useState('monitor'); // 'monitor', 'history', 'personal'
    const [loading, setLoading] = useState(false);

    // Personal / Carniceros State
    const [carniceros, setCarniceros] = useState([]);
    const [showAddCarnicero, setShowAddCarnicero] = useState(false);
    const [showEditCarnicero, setShowEditCarnicero] = useState(false);
    const [selectedCarnicero, setSelectedCarnicero] = useState(null);
    const [newCarnicero, setNewCarnicero] = useState({
        nombre: '', apellido: '', numero_carnicero: '', is_available: true, password: ''
    });

    // Filters & Pagination
    const [filterText, setFilterText] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [historyFilterText, setHistoryFilterText] = useState('');
    const [historyFilterDate, setHistoryFilterDate] = useState('');
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [reportModalOrder, setReportModalOrder] = useState(null);
    const [reportModalSeenCount, setReportModalSeenCount] = useState(0);
    const reportModalOrderRef = useRef(null);
    const [reportProblem, setReportProblem] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 8;

    // Custom Notifications State
    const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
    const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null });
    const [menuOpen, setMenuOpen] = useState(false);
    const [seenReportCounts, setSeenReportCounts] = useState(() => loadSeenReportCounts());

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

    const isUnreadReportFromMayorista = useCallback(
        (pedido) => {
            const mensajes = getReporteMensajes(pedido);
            if (!mensajes.length || ultimoRolMensaje(pedido) !== 'mayorista') return false;
            const orderId = pedidoReporteId(pedido);
            const stored = seenReportCounts[orderId];
            if (stored == null || stored === '') return true;
            return getReporteThreadSeenKey(pedido) !== stored;
        },
        [seenReportCounts]
    );

    const pendingReportsCount = useMemo(
        () =>
            globalOrders.filter((o) => {
                if (!user?.sede_id || o.sede_id === user.sede_id) {
                    return isUnreadReportFromMayorista(o);
                }
                return false;
            }).length,
        [globalOrders, user?.sede_id, isUnreadReportFromMayorista]
    );

    const openOrderDetails = (order) => {
        setReportModalOrder(null);
        setSelectedOrder(order);
    };

    const closeOrderDetails = () => setSelectedOrder(null);

    const openReportModal = (order) => {
        setSelectedOrder(null);
        setReportModalSeenCount(getStoredSeenMessageCount(order, seenReportCounts));
        setReportModalOrder(order);
        setReportProblem('');
    };

    const closeReportModal = () => {
        if (reportModalOrder) {
            const latest =
                globalOrdersRef.current.find((o) => o.id === reportModalOrder.id) ?? reportModalOrder;
            markReportThreadSeen(latest);
        }
        setReportModalOrder(null);
        setReportProblem('');
    };

    useEffect(() => {
        reportModalOrderRef.current = reportModalOrder;
    }, [reportModalOrder]);

    useEffect(() => {
        globalOrdersRef.current = globalOrders;
    }, [globalOrders]);

    const handleReportSubmit = async () => {
        if (!reportModalOrder) return;
        const respuesta = reportProblem.trim();
        if (!respuesta) return;

        try {
            const { data: updated } = await api.put(
                `/pedidos/${reportModalOrder.id}/problema/respuesta`,
                { respuesta }
            );

            setGlobalOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
            setReportModalOrder(updated);
            markReportThreadSeen(updated);
            if (selectedOrder?.id === updated.id) {
                setSelectedOrder(updated);
            }
            setReportProblem('');
            showNotify('Mensaje enviado con éxito.', 'success');
        } catch (error) {
            console.error('Error sending report response:', error);
            const detail = error.response?.data?.detail;
            showNotify(typeof detail === 'string' ? detail : 'No se pudo enviar la respuesta del reporte.', 'error');
        }
    };

    const reportesConReporte = useMemo(
        () =>
            globalOrders.filter((o) => {
                if (!tieneReporte(o)) return false;
                return !user?.sede_id || o.sede_id === user.sede_id;
            }),
        [globalOrders, user?.sede_id]
    );

    const reportesFiltrados = useMemo(() => {
        return reportesConReporte.filter((order) => {
            if (historyFilterText) {
                const search = historyFilterText.toLowerCase();
                const matchesId =
                    order.id.toString().includes(search) ||
                    (order.numero_pedido && order.numero_pedido.toLowerCase().includes(search)) ||
                    formatPedidoNumero(order).toLowerCase().includes(search);
                const matchesClient = order.cliente_nombre?.toLowerCase().includes(search);
                if (!matchesId && !matchesClient) return false;
            }
            if (historyFilterDate) {
                const orderDate = new Date(order.timestamp).toISOString().split('T')[0];
                if (orderDate !== historyFilterDate) return false;
            }
            return true;
        });
    }, [reportesConReporte, historyFilterText, historyFilterDate]);

    const resetMonitorFilters = () => {
        setFilterText('');
        setFilterDate('');
        setCurrentPage(1);
    };

    const resetHistoryFilters = () => {
        setHistoryFilterText('');
        setHistoryFilterDate('');
    };

    const navTabs = [
        { id: 'monitor', label: 'Monitor Real-Time', icon: Monitor },
        { id: 'personal', label: 'Personal', icon: Users },
        { id: 'history', label: 'Historial & Reportes', icon: History },
    ];

    const goToTab = (tabId) => {
        setActiveTab(tabId);
        setMenuOpen(false);
    };

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

    const showNotify = (message, type = 'success') => {
        setNotification({ show: true, message, type });
        setTimeout(() => {
            setNotification(prev => ({ ...prev, show: false }));
        }, 4000);
    };


    const filteredOrders = globalOrders.filter(order => {
        // 1. Sede Scope
        if (user.sede_id && order.sede_id !== user.sede_id) return false;

        // 2. Text Search (Client or ID)
        if (filterText) {
            const search = filterText.toLowerCase();
            const matchesId = order.id.toString().includes(search) ||
                (order.numero_pedido && order.numero_pedido.toLowerCase().includes(search));
            const matchesClient = order.cliente_nombre?.toLowerCase().includes(search);
            if (!matchesId && !matchesClient) return false;
        }

        // 3. Date Filter
        if (filterDate) {
            const orderDate = new Date(order.timestamp).toISOString().split('T')[0];
            if (orderDate !== filterDate) return false;
        }

        return true;
    });

    const paginatedOrders = filteredOrders.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    useEffect(() => {
        requestNotificationPermission();
    }, []);

    useEffect(() => {
        if (!user) return;

        socketService.connect('manager');
        fetchData();
        fetchCarniceros();

        const maybeNotifyNuevoMensajeMayorista = (updated) => {
            const inScope = !user.sede_id || updated.sede_id === user.sede_id;
            if (!inScope || !tieneReporte(updated)) return;
            if (reportModalOrderRef.current?.id === updated.id) return;

            const prev = globalOrdersRef.current;
            const ix = prev.findIndex((o) => o.id === updated.id);
            if (ix >= 0) {
                const prevOrder = prev[ix];
                const prevCount = getReporteMensajes(prevOrder).length;
                const newCount = getReporteMensajes(updated).length;
                if (newCount <= prevCount || ultimoRolMensaje(updated) !== 'mayorista') return;
            } else if (ultimoRolMensaje(updated) !== 'mayorista') {
                return;
            }

            const msg = `Nuevo mensaje del mayorista · Pedido ${formatPedidoNumero(updated)}`;
            showNotify(msg, 'info');
            notifyBrowserMessage('Pedidos Mayorista', msg);
        };

        socketService.onNewOrder((order) => {
            if (user.sede_id && order.sede_id !== user.sede_id) return;
            setGlobalOrders((prev) => {
                if (prev.some((o) => o.id === order.id)) return prev;
                return [order, ...prev];
            });
        });

        socketService.onOrderUpdate((updated) => {
            const inScope = !user.sede_id || updated.sede_id === user.sede_id;
            maybeNotifyNuevoMensajeMayorista(updated);

            setGlobalOrders((prev) => {
                const ix = prev.findIndex((o) => o.id === updated.id);
                if (ix >= 0) {
                    const next = [...prev];
                    next[ix] = updated;
                    return next;
                }
                if (inScope && tieneReporte(updated)) {
                    return [updated, ...prev];
                }
                return prev;
            });

            setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
            setReportModalOrder((prev) => (prev?.id === updated.id ? updated : prev));
        });

        return () => {
            socketService.offNewOrder();
            socketService.offOrderUpdate();
            socketService.disconnect();
        };
    }, [user]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch some global orders (last 50)
            const response = await api.get('/pedidos');
            setGlobalOrders(response.data.slice(-50).reverse());
        } catch (error) {
            console.error("Error fetching global data:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchCarniceros = async () => {
        try {
            if (user && user.sede_id) {
                const response = await api.get(`/users/carniceros/${user.sede_id}`);
                setCarniceros(response.data);
            }
        } catch (error) {
            console.error("Error fetching carniceros:", error);
        }
    };

    const toggleCarniceroAvailability = async (carniceroId, currentStatus) => {
        try {
            await api.put(`/users/carniceros/${carniceroId}/availability?is_available=${!currentStatus}`);
            fetchCarniceros();
        } catch (error) {
            console.error("Error toggling availability:", error);
            showNotify("Error al actualizar la disponibilidad.", "error");
        }
    };

    const handleAddCarnicero = async (e) => {
        e.preventDefault();
        try {
            await api.post('/users/carniceros', {
                username: newCarnicero.numero_carnicero,
                role: 'carnicero',
                sede_id: user.sede_id,
                session_active: newCarnicero.is_available ? 1 : 0,
                nombre: newCarnicero.nombre,
                apellido: newCarnicero.apellido,
                numero_carnicero: newCarnicero.numero_carnicero,
                is_available: newCarnicero.is_available,
                password: newCarnicero.numero_carnicero
            });
            setShowAddCarnicero(false);
            setNewCarnicero({ nombre: '', apellido: '', numero_carnicero: '', is_available: true, password: '' });
            fetchCarniceros();
            showNotify("Carnicero creado exitosamente.", "success");
        } catch (error) {
            console.error("Error al crear carnicero:", error);
            showNotify("Error al crear el carnicero.", "error");
        }
    };

    const handleDeleteCarnicero = async (carniceroId) => {
        setConfirmModal({
            show: true,
            title: '¿Eliminar Carnicero?',
            message: 'Esta acción eliminará permanentemente al carnicero del sistema. ¿Deseas continuar?',
            onConfirm: async () => {
                try {
                    await api.delete(`/users/carniceros/${carniceroId}`);
                    fetchCarniceros();
                    showNotify("Carnicero eliminado exitosamente.", "success");
                    setConfirmModal(prev => ({ ...prev, show: false }));
                } catch (error) {
                    console.error("Error al eliminar carnicero:", error);
                    showNotify("No se pudo eliminar al carnicero.", "error");
                    setConfirmModal(prev => ({ ...prev, show: false }));
                }
            }
        });
    };

    const handleEditCarnicero = async (e) => {
        e.preventDefault();
        try {
            const updateData = {
                nombre: selectedCarnicero.nombre,
                apellido: selectedCarnicero.apellido,
                numero_carnicero: selectedCarnicero.numero_carnicero,
                is_available: selectedCarnicero.is_available
            };
            
            if (selectedCarnicero.password) {
                updateData.password = selectedCarnicero.password;
            }

            await api.put(`/users/carniceros/${selectedCarnicero.id}`, updateData);
            setShowEditCarnicero(false);
            fetchCarniceros();
            showNotify("Carnicero actualizado exitosamente.", "success");
        } catch (error) {
            console.error("Error al actualizar carnicero:", error);
            showNotify("Error al actualizar el carnicero.", "error");
        }
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
                <div className={styles.mobileLogo}>Pedidos <span>Mayorista</span></div>
                <span className={styles.mobileTopSpacer} aria-hidden="true" />
            </header>

            {menuOpen && (
                <button
                    type="button"
                    className={styles.sidebarBackdrop}
                    onClick={() => setMenuOpen(false)}
                    aria-label="Cerrar menú"
                />
            )}

            <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}>
                <div className={styles.logo}>Pedidos <span>Mayorista</span></div>

                <nav className={styles.nav}>
                    {navTabs.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            className={`${styles.navItem} ${activeTab === id ? styles.active : ''}`}
                            onClick={() => goToTab(id)}
                        >
                            <Icon size={20} />
                            {label}
                            {id === 'history' && pendingReportsCount > 0 && (
                                <span className={styles.badge}>{pendingReportsCount}</span>
                            )}
                        </button>
                    ))}
                </nav>

                <div className={styles.sidebarFooter}>
                    <button
                        type="button"
                        onClick={() => { setMenuOpen(false); logout(); }}
                        className={styles.logoutBtn}
                    >
                        <Power size={18} />
                        Cerrar Sesión
                    </button>
                </div>
            </aside>

            <main className={styles.content}>
                <header className={`${styles.topBanner} glass-card`}>
                    <h1>{
                        activeTab === 'monitor' ? 'Monitor Global' :
                        activeTab === 'personal' ? 'Gestión de Personal' :
                        'Historial'
                    }</h1>
                    {activeTab === 'monitor' && (
                        <button onClick={fetchData} className={styles.refreshBtn} disabled={loading} title="Actualizar pedidos">
                            <RefreshCcw size={18} className={loading ? styles.spinning : ''} />
                        </button>
                    )}
                </header>

                <div className={styles.scrollArea}>

                    {activeTab === 'monitor' && (
                        <div className={styles.monitorView}>
                            <div className={styles.statsRow}>
                                <div className={`${styles.statCard} glass-card`}>
                                    <Clock size={24} color="#3498db" />
                                    <div>
                                        <strong>{globalOrders.filter(o => o.estado === 'pendiente' && (!user.sede_id || o.sede_id === user.sede_id)).length}</strong>
                                        <span>Pendientes Sede</span>
                                    </div>
                                </div>
                                <div className={`${styles.statCard} glass-card`}>
                                    <Activity size={24} color="#f39c12" />
                                    <div>
                                        <strong>{globalOrders.filter(o => o.estado === 'en_proceso' && (!user.sede_id || o.sede_id === user.sede_id)).length}</strong>
                                        <span>En Preparación</span>
                                    </div>
                                </div>
                                <div className={`${styles.statCard} glass-card`}>
                                    <CheckCircle size={24} color="var(--primary-color)" />
                                    <div>
                                        <strong>{globalOrders.filter(o => o.estado === 'finalizado' && (!user.sede_id || o.sede_id === user.sede_id)).length}</strong>
                                        <span>Finalizados Hoy</span>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.filtersRow}>
                                <input
                                    type="text"
                                    placeholder="Buscar por Cliente o ID..."
                                    className={`${styles.filterInput} ${styles.searchParams}`}
                                    value={filterText}
                                    onChange={(e) => setFilterText(e.target.value)}
                                />
                                <input
                                    type="date"
                                    className={styles.filterInput}
                                    value={filterDate}
                                    onChange={(e) => setFilterDate(e.target.value)}
                                />
                                {(filterText || filterDate) && (
                                    <button onClick={resetMonitorFilters} className={styles.clearBtn} title="Limpiar Filtros">
                                        <Eraser size={20} />
                                    </button>
                                )}
                            </div>

                            <div className={styles.tableScrollWrap}>
                            <table className={styles.mainTable}>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Cliente</th>
                                        <th>Estado</th>
                                        <th>Carnicero</th>
                                        <th>T. Espera</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedOrders.map(order => (
                                        <tr
                                            key={order.id}
                                            className={styles.orderRow}
                                            onClick={() => openOrderDetails(order)}
                                        >
                                            <td>{formatPedidoNumero(order)}</td>
                                            <td>{order.cliente_nombre}</td>
                                            <td>
                                                <span className={`${styles.statusBadge} ${styles[order.estado]}`}>
                                                    {order.estado}
                                                </span>
                                            </td>
                                            <td>{order.carnicero?.username || '---'}</td>
                                            <td>
                                                {order.estado === 'pendiente' ?
                                                    `${Math.floor((new Date() - new Date(order.timestamp)) / 60000)}m` :
                                                    '--'
                                                }
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>

                            <div className={styles.pagination}>
                                <button
                                    className={styles.pageBtn}
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                >
                                    Anterior
                                </button>
                                <span>Página {currentPage} de {Math.ceil(filteredOrders.length / itemsPerPage)}</span>
                                <button
                                    className={styles.pageBtn}
                                    disabled={currentPage >= Math.ceil(filteredOrders.length / itemsPerPage)}
                                    onClick={() => setCurrentPage(prev => prev + 1)}
                                >
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <div className={styles.historyView}>
                            <section className={styles.section}>
                                <div className={styles.sectionHeader}>
                                    <AlertTriangle size={20} color="var(--warning)" />
                                    <h2>Reportes de Problemas</h2>
                                </div>

                                <div className={styles.historyFilterSection}>
                                    <div className={styles.historyDateGroup}>
                                        <label>
                                            <Calendar size={16} /> Filtrar por día:
                                        </label>
                                        <input
                                            type="date"
                                            className={styles.historyDateInput}
                                            value={historyFilterDate}
                                            onChange={(e) => setHistoryFilterDate(e.target.value)}
                                        />
                                    </div>
                                    <div className={styles.historySearchWrapper}>
                                        <Search size={16} />
                                        <input
                                            type="text"
                                            placeholder="Buscar por cliente, ID o número (#12)..."
                                            value={historyFilterText}
                                            onChange={(e) => setHistoryFilterText(e.target.value)}
                                        />
                                    </div>
                                    {(historyFilterText || historyFilterDate) && (
                                        <button
                                            type="button"
                                            onClick={resetHistoryFilters}
                                            className={styles.clearBtn}
                                            title="Limpiar filtros"
                                        >
                                            <Eraser size={20} />
                                        </button>
                                    )}
                                </div>

                                {reportesConReporte.length === 0 ? (
                                    <p className={styles.emptyMsg}>No hay problemas reportados en el historial reciente.</p>
                                ) : reportesFiltrados.length === 0 ? (
                                    <p className={styles.emptyMsg}>No hay reportes que coincidan con los filtros.</p>
                                ) : (
                                    <table className={styles.mainTable}>
                                        <thead>
                                            <tr>
                                                <th>ID</th>
                                                <th>Fecha</th>
                                                <th>Cliente</th>
                                                <th>Último mensaje</th>
                                                <th>Estado</th>
                                                <th>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {reportesFiltrados.map(order => {
                                                const ultimoMsg = getReporteMensajes(order).at(-1);
                                                const unreadFromMayorista = isUnreadReportFromMayorista(order);
                                                return (
                                                <tr key={order.id} className={styles.orderRow}>
                                                    <td>{formatPedidoNumero(order)}</td>
                                                    <td>{new Date(order.timestamp).toLocaleDateString()}</td>
                                                    <td>{order.cliente_nombre}</td>
                                                    <td style={{ color: 'var(--warning)', maxWidth: '280px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {ultimoMsg?.texto || order.problema_reportado}
                                                    </td>
                                                    <td>
                                                        <span className={`${styles.statusBadge} ${styles[order.estado]}`}>
                                                            {order.estado}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className={styles.tableActionGroup}>
                                                            <button
                                                                type="button"
                                                                className={styles.revokeBtn}
                                                                style={{ color: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
                                                                onClick={() => openOrderDetails(order)}
                                                            >
                                                                Detalles
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className={`${styles.revokeBtn} ${styles.reportActionBtn} ${unreadFromMayorista ? styles.reportActionPending : ''}`}
                                                                onClick={() => openReportModal(order)}
                                                            >
                                                                <MessageSquare size={14} />
                                                                {unreadFromMayorista ? 'Responder' : 'Ver reporte'}
                                                                {unreadFromMayorista && <span className={styles.rowNotifDot} aria-hidden />}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );})}
                                        </tbody>
                                    </table>
                                )}
                            </section>
                        </div>
                    )}
                </div>

                
                    {activeTab === 'personal' && (
                        <div className={styles.personalWrapper}>
                            <div className={styles.personalHeaderActions}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ width: '4px', height: '24px', background: 'var(--primary-color)', borderRadius: '2px' }}></div>
                                    <h2 style={{ fontSize: '1.2rem', fontWeight: '700', margin: 0, letterSpacing: '0.5px' }}>Personal de la Sede</h2>
                                </div>
                                <button className={styles.refreshBtn} style={{ padding: '12px 28px', gap: '10px', fontWeight: '700', borderRadius: '12px' }} onClick={() => setShowAddCarnicero(true)}>
                                    <UserPlus size={20} />
                                    Añadir Carnicero
                                </button>
                            </div>

                            <div className={styles.personalGrid}>
                                {/* LADO IZQUIERDO: DISPONIBLES */}
                                <div className={styles.personalColumn}>
                                    <div className={styles.columnHeader}>
                                        <CheckCircle size={20} color="#2ecc71" />
                                        <h2 style={{ color: '#2ecc71' }}>Disponibles ({carniceros.filter(c => c.is_available).length})</h2>
                                    </div>
                                    <div className={styles.tableContainer}>
                                        <table className={styles.tableCompact}>
                                            <thead>
                                                <tr>
                                                    <th>Núm</th>
                                                    <th>Nombre</th>
                                                    <th>Apellido</th>
                                                    <th style={{ textAlign: 'right' }}>Acción</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {carniceros
                                                    .filter(c => c.is_available)
                                                    .sort((a, b) => (parseInt(a.numero_carnicero) || 0) - (parseInt(b.numero_carnicero) || 0))
                                                    .map(carnicero => (
                                                    <tr key={carnicero.id}>
                                                        <td style={{ color: 'white', fontWeight: '700' }}>{carnicero.numero_carnicero || carnicero.username}</td>
                                                        <td>{carnicero.nombre || '---'}</td>
                                                        <td>{carnicero.apellido || '---'}</td>
                                                        <td style={{ textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                            <button 
                                                                onClick={() => {
                                                                    setSelectedCarnicero({...carnicero, password: ''});
                                                                    setShowEditCarnicero(true);
                                                                }}
                                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#3498db', display: 'flex', padding: '4px' }}
                                                                title="Editar"
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDeleteCarnicero(carnicero.id)}
                                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', padding: '4px' }}
                                                                title="Eliminar"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                            <button 
                                                                onClick={() => toggleCarniceroAvailability(carnicero.id, carnicero.is_available)}
                                                                className={styles.statusBadge}
                                                                style={{ border: '1px solid #2ecc71', cursor: 'pointer', background: 'transparent', color: '#2ecc71', padding: '6px 10px', fontSize: '0.75rem' }}
                                                            >
                                                                Desactivar
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {carniceros.filter(c => c.is_available).length === 0 && (
                                                    <tr><td colSpan="4" style={{textAlign: 'center', padding: '2rem', color: '#64748b'}}>Sin personal disponible</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* LADO DERECHO: NO DISPONIBLES */}
                                <div className={styles.personalColumn}>
                                    <div className={styles.columnHeader}>
                                        <X size={20} color="#ef4444" />
                                        <h2 style={{ color: '#ef4444' }}>No Disponibles ({carniceros.filter(c => !c.is_available).length})</h2>
                                    </div>
                                    <div className={styles.tableContainer}>
                                        <table className={styles.tableCompact}>
                                            <thead>
                                                <tr>
                                                    <th>Núm</th>
                                                    <th>Nombre</th>
                                                    <th>Apellido</th>
                                                    <th style={{ textAlign: 'right' }}>Acción</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {carniceros
                                                    .filter(c => !c.is_available)
                                                    .sort((a, b) => (parseInt(a.numero_carnicero) || 0) - (parseInt(b.numero_carnicero) || 0))
                                                    .map(carnicero => (
                                                    <tr key={carnicero.id}>
                                                        <td style={{ color: 'white', fontWeight: '700' }}>{carnicero.numero_carnicero || carnicero.username}</td>
                                                        <td>{carnicero.nombre || '---'}</td>
                                                        <td>{carnicero.apellido || '---'}</td>
                                                        <td style={{ textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                            <button 
                                                                onClick={() => {
                                                                    setSelectedCarnicero({...carnicero, password: ''});
                                                                    setShowEditCarnicero(true);
                                                                }}
                                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#3498db', display: 'flex', padding: '4px' }}
                                                                title="Editar"
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDeleteCarnicero(carnicero.id)}
                                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', padding: '4px' }}
                                                                title="Eliminar"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                            <button 
                                                                onClick={() => toggleCarniceroAvailability(carnicero.id, carnicero.is_available)}
                                                                className={styles.statusBadge}
                                                                style={{ border: '1px solid #ef4444', cursor: 'pointer', background: 'transparent', color: '#ef4444', padding: '6px 10px', fontSize: '0.75rem' }}
                                                            >
                                                                Activar
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {carniceros.filter(c => !c.is_available).length === 0 && (
                                                    <tr><td colSpan="4" style={{textAlign: 'center', padding: '2rem', color: '#64748b'}}>Sin personal inactivo</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                
                {/* MODAL ADD CARNICERO */}
                {showAddCarnicero && (
                    <div className={styles.modalOverlay} onClick={() => setShowAddCarnicero(false)}>
                        <div className={styles.modalContent} style={{ maxWidth: '450px', background: '#111827' }} onClick={e => e.stopPropagation()}>
                            <div className={styles.modalHeader}>
                                <h2 className={styles.modalTitle} style={{display: 'flex', gap: '10px'}}><UserPlus size={24} color="var(--primary-color)" /> Nuevo Carnicero</h2>
                                <button className={styles.closeIconBtn} onClick={() => setShowAddCarnicero(false)}><X size={24} /></button>
                            </div>
                            <form className={styles.modalBody} onSubmit={handleAddCarnicero}>
                                <div style={{ marginBottom: '18px' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '0.9rem', fontWeight: '600' }}>Nombre</label>
                                    <input type="text" required value={newCarnicero.nombre} onChange={e => setNewCarnicero({...newCarnicero, nombre: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#1e293b', color: 'white', outline: 'none' }} />
                                </div>
                                <div style={{ marginBottom: '18px' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '0.9rem', fontWeight: '600' }}>Apellido</label>
                                    <input type="text" required value={newCarnicero.apellido} onChange={e => setNewCarnicero({...newCarnicero, apellido: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#1e293b', color: 'white', outline: 'none' }} />
                                </div>
                                <div style={{ marginBottom: '18px' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '0.9rem', fontWeight: '600' }}>Número de Carnicero</label>
                                    <input type="text" required value={newCarnicero.numero_carnicero} onChange={e => setNewCarnicero({...newCarnicero, numero_carnicero: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#1e293b', color: 'white', outline: 'none' }} />
                                    <small style={{color: '#64748b', display: 'block', marginTop: '6px', fontSize: '0.8rem'}}>Este número será su usuario y contraseña para iniciar sesión.</small>
                                </div>
                                <div style={{ marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <input type="checkbox" id="avail-check" checked={newCarnicero.is_available} onChange={e => setNewCarnicero({...newCarnicero, is_available: e.target.checked})} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                                    <label htmlFor="avail-check" style={{ color: 'white', cursor: 'pointer', fontWeight: '500' }}>¿Está Disponible para procesar pedidos ahora?</label>
                                </div>
                                <button type="submit" className={styles.closeBtnPrimary} style={{ margin: 0, background: 'var(--primary-color)', color: '#000' }}>
                                    Guardar Carnicero
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                {/* MODAL EDIT CARNICERO */}
                {showEditCarnicero && selectedCarnicero && (
                    <div className={styles.modalOverlay} onClick={() => setShowEditCarnicero(false)}>
                        <div className={styles.modalContent} style={{ maxWidth: '450px', background: '#111827' }} onClick={e => e.stopPropagation()}>
                            <div className={styles.modalHeader}>
                                <h2 className={styles.modalTitle} style={{display: 'flex', gap: '10px'}}><Edit2 size={24} color="#3498db" /> Editar Carnicero</h2>
                                <button className={styles.closeIconBtn} onClick={() => setShowEditCarnicero(false)}><X size={24} /></button>
                            </div>
                            <form className={styles.modalBody} onSubmit={handleEditCarnicero}>
                                <div style={{ marginBottom: '18px' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '0.9rem', fontWeight: '600' }}>Nombre</label>
                                    <input type="text" required value={selectedCarnicero.nombre} onChange={e => setSelectedCarnicero({...selectedCarnicero, nombre: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#1e293b', color: 'white', outline: 'none' }} />
                                </div>
                                <div style={{ marginBottom: '18px' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '0.9rem', fontWeight: '600' }}>Apellido</label>
                                    <input type="text" required value={selectedCarnicero.apellido} onChange={e => setSelectedCarnicero({...selectedCarnicero, apellido: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#1e293b', color: 'white', outline: 'none' }} />
                                </div>
                                <div style={{ marginBottom: '18px' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '0.9rem', fontWeight: '600' }}>Número de Carnicero (ID)</label>
                                    <input type="text" required value={selectedCarnicero.numero_carnicero} onChange={e => setSelectedCarnicero({...selectedCarnicero, numero_carnicero: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#1e293b', color: 'white', outline: 'none' }} />
                                </div>
                                <div style={{ marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <input type="checkbox" id="edit-avail-check" checked={selectedCarnicero.is_available} onChange={e => setSelectedCarnicero({...selectedCarnicero, is_available: e.target.checked})} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                                    <label htmlFor="edit-avail-check" style={{ color: 'white', cursor: 'pointer', fontWeight: '500' }}>¿Está Disponible?</label>
                                </div>
                                <button type="submit" className={styles.closeBtnPrimary} style={{ margin: 0, background: '#3498db', color: 'white' }}>
                                    Actualizar Datos
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                {/* MODAL DETALLES DEL PEDIDO */}
                {selectedOrder && (
                    <div className={styles.modalOverlay} onClick={closeOrderDetails}>
                        <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                            <div className={styles.modalHeader}>
                                <h2 className={styles.modalTitle}>
                                    <Package size={28} color="var(--primary-color)" />
                                    Detalles del Pedido {formatPedidoNumero(selectedOrder)}
                                </h2>
                                <button type="button" className={styles.closeIconBtn} onClick={closeOrderDetails}>
                                    <X size={24} />
                                </button>
                            </div>

                            <div className={styles.modalBody}>
                                <div className={styles.infoGrid}>
                                    <div className={styles.infoCard}>
                                        <h3 className={styles.infoCardTitle}>Información General</h3>
                                        <div className={styles.infoRow}>
                                            <span className={styles.label}>Cliente:</span>
                                            <span className={styles.value}>{selectedOrder.cliente_nombre}</span>
                                        </div>
                                        <div className={styles.infoRow}>
                                            <span className={styles.label}>Usuario Sistema:</span>
                                            <span className={styles.value}>{selectedOrder.mayorista?.username || '--'}</span>
                                        </div>
                                        <div className={styles.infoRow}>
                                            <span className={styles.label}>Fecha:</span>
                                            <span className={styles.value}>{new Date(selectedOrder.timestamp).toLocaleDateString()}</span>
                                        </div>
                                        <div className={styles.infoRow}>
                                            <span className={styles.label}>Estado:</span>
                                            <span className={`${styles.statusIndicator} ${styles[selectedOrder.estado]}`}>
                                                {selectedOrder.estado}
                                            </span>
                                        </div>
                                        <div className={styles.infoRow}>
                                            <span className={styles.label}>Sede:</span>
                                            <span className={styles.value}>{selectedOrder.sede?.nombre || 'Sede Actual'}</span>
                                        </div>
                                    </div>

                                    <div className={styles.infoCard}>
                                        <h3 className={styles.infoCardTitle}>Carnicería</h3>
                                        <div className={styles.infoRow}>
                                            <span className={styles.label}>Responsable:</span>
                                            <span className={styles.value}>{selectedOrder.carnicero?.username || 'Sin asignar'}</span>
                                        </div>
                                        <div className={styles.infoRow}>
                                            <span className={styles.label}>Tiempo de espera:</span>
                                            <span className={styles.value}>
                                                {selectedOrder.estado === 'pendiente' ?
                                                    `${Math.floor((new Date() - new Date(selectedOrder.timestamp)) / 60000)} min` :
                                                    '--'
                                                }
                                            </span>
                                        </div>
                                        <div className={styles.infoRow}>
                                            <span className={styles.label}>Tiempo preparación:</span>
                                            <span className={styles.value} style={{ color: '#6b7280' }}>En espera...</span>
                                        </div>
                                        <div className={styles.infoRow}>
                                            <span className={styles.label}>Proceso total:</span>
                                            <span className={styles.value} style={{ color: '#6b7280' }}>En espera...</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className={styles.itemsSectionTitle}>Items del Pedido</h3>
                                    <div className={styles.itemsTableContainer}>
                                        <table className={styles.itemsTable}>
                                            <thead>
                                                <tr>
                                                    <th>Corte</th>
                                                    <th>Preparación</th>
                                                    <th>Observaciones</th>
                                                    <th style={{ textAlign: 'right' }}>Cantidad</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {selectedOrder.detalles?.map((item, idx) => (
                                                    <tr key={idx}>
                                                        <td>{item.corte?.nombre || 'Desconocido'}</td>
                                                        <td style={{ color: '#9ca3af' }}>{item.tipo_corte?.nombre || 'Estándar'}</td>
                                                        <td style={{ fontSize: '0.9rem', color: '#f39c12', maxWidth: '200px', wordBreak: 'break-word', whiteSpace: 'normal' }}>{item.observaciones || ''}</td>
                                                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                                                            {item.cantidad_kg} kg
                                                        </td>
                                                    </tr>
                                                ))}
                                                {(!selectedOrder.detalles || selectedOrder.detalles.length === 0) && (
                                                    <tr>
                                                        <td colSpan="4" style={{ textAlign: 'center', color: '#6b7280' }}>Sin items registrados</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {selectedOrder.observaciones && (
                                    <div className={styles.orderNotes}>
                                        <strong>Observaciones:</strong> {selectedOrder.observaciones}
                                    </div>
                                )}

                                {tieneReporte(selectedOrder) && (
                                    <button
                                        type="button"
                                        className={styles.linkToReportBtn}
                                        onClick={() => openReportModal(selectedOrder)}
                                    >
                                        <MessageSquare size={16} />
                                        Abrir conversación del reporte
                                    </button>
                                )}

                                <button type="button" className={styles.closeBtnPrimary} onClick={closeOrderDetails}>
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {reportModalOrder && (
                    <ReportChatModal
                        order={reportModalOrder}
                        seenMessageCount={reportModalSeenCount}
                        message={reportProblem}
                        onMessageChange={setReportProblem}
                        onClose={closeReportModal}
                        onSubmit={handleReportSubmit}
                        perspective="jefe"
                        hintExtra={
                            <p className={styles.reportModalHint}>
                                Cliente: <strong>{reportModalOrder.cliente_nombre}</strong>
                                {' · '}
                                Estado:{' '}
                                <span className={`${styles.statusBadge} ${styles[reportModalOrder.estado]}`}>
                                    {reportModalOrder.estado}
                                </span>
                            </p>
                        }
                        footerLink={{
                            label: 'Ver detalles del pedido',
                            icon: 'package',
                            onClick: () => {
                                const order = reportModalOrder;
                                closeReportModal();
                                openOrderDetails(order);
                            },
                        }}
                    />
                )}
            </main>

            {/* CUSTOM TOAST NOTIFICATION */}
            {notification.show && (
                <div className={styles.toastContainer}>
                    <div className={`${styles.toast} ${styles[notification.type]}`}>
                        {notification.type === 'success' && <CheckCircle size={20} color="#2ecc71" />}
                        {notification.type === 'error' && <AlertTriangle size={20} color="#ef4444" />}
                        {notification.type === 'info' && <Info size={20} color="#3498db" />}
                        <span>{notification.message}</span>
                    </div>
                </div>
            )}

            {/* CUSTOM CONFIRMATION MODAL */}
            {confirmModal.show && (
                <div className={styles.confirmOverlay}>
                    <div className={styles.confirmBox}>
                        <div className={styles.confirmIcon}>
                            <AlertTriangle size={32} />
                        </div>
                        <h3>{confirmModal.title}</h3>
                        <p>{confirmModal.message}</p>
                        <div className={styles.confirmActions}>
                            <button className={styles.cancelBtn} onClick={() => setConfirmModal({ ...confirmModal, show: false })}>
                                Cancelar
                            </button>
                            <button className={styles.deleteConfirmBtn} onClick={confirmModal.onConfirm}>
                                Eliminar Permanentemente
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default JefeCarnes;
