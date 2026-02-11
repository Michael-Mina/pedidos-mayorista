import React, { useState, useEffect } from 'react';
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
    Send,
    Package
} from 'lucide-react';
import styles from './JefeCarnes.module.css';

const JefeCarnes = () => {
    const { user, logout } = useAuth();
    const [globalOrders, setGlobalOrders] = useState([]);
    const [activeTab, setActiveTab] = useState('monitor'); // 'monitor', 'history'
    const [loading, setLoading] = useState(false);

    // Filters & Pagination
    const [filterText, setFilterText] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [reportProblem, setReportProblem] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 8;


    const filteredOrders = globalOrders.filter(order => {
        // 1. Sede Scope
        if (user.sede_id && order.sede_id !== user.sede_id) return false;

        // 2. Text Search (Client or ID)
        if (filterText) {
            const search = filterText.toLowerCase();
            const matchesId = order.id.toString().includes(search);
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
        if (user) {
            socketService.connect('manager'); // Special room for managers
            fetchData();

            socketService.onNewOrder((order) => {
                setGlobalOrders(prev => [order, ...prev]);
            });

            socketService.onOrderUpdate((updated) => {
                setGlobalOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
            });

            return () => {
                socketService.disconnect();
            };
        }
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


    const resetFilters = () => {
        setFilterText('');
        setFilterDate('');
        setCurrentPage(1);
    };

    const handleReportSubmit = async () => {
        if (!selectedOrder || !reportProblem.trim()) return;
        try {
            await api.put(`/pedidos/${selectedOrder.id}/problema?problema=${encodeURIComponent(reportProblem)}`);
            alert("Reporte enviado correctamente.");
            setReportProblem('');
            setSelectedOrder(null);
            setGlobalOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, problema_reportado: reportProblem } : o));
            setSelectedOrder(null);
        } catch (error) {
            console.error(error);
            alert("Error al enviar el reporte.");
        }
    };

    return (
        <div className={styles.container}>
            {/* ... sidebar ... */}
            <aside className={styles.sidebar}>
                <div className={styles.logo}>Caña<span>veral</span></div>

                <nav className={styles.nav}>
                    <button
                        className={`${styles.navItem} ${activeTab === 'monitor' ? styles.active : ''}`}
                        onClick={() => setActiveTab('monitor')}
                    >
                        <Monitor size={20} />
                        Monitor Real-Time
                    </button>
                    <button
                        className={`${styles.navItem} ${activeTab === 'history' ? styles.active : ''}`}
                        onClick={() => setActiveTab('history')}
                    >
                        <History size={20} />
                        Historial & Reportes
                    </button>
                </nav>

                <div className={styles.sidebarFooter}>
                    <button onClick={logout} className={styles.logoutBtn}>
                        <Power size={18} />
                        Cerrar Sesión
                    </button>
                </div>
            </aside>

            <main className={styles.content}>
                <header className={`${styles.topBanner} glass-card`}>
                    <h1>{
                        activeTab === 'monitor' ? 'Monitor Global' :
                            'Historial'
                    }</h1>
                    <button onClick={fetchData} className={styles.refreshBtn} disabled={loading}>
                        <RefreshCcw size={18} className={loading ? styles.spinning : ''} />
                    </button>
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
                                    <button onClick={resetFilters} className={styles.clearBtn} title="Limpiar Filtros">
                                        <Eraser size={20} />
                                    </button>
                                )}
                            </div>

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
                                            onClick={() => setSelectedOrder(order)}
                                        >
                                            <td>#{order.id}</td>
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

                                {globalOrders.filter(o => o.problema_reportado).length === 0 ? (
                                    <p className={styles.emptyMsg}>No hay problemas reportados en el historial reciente.</p>
                                ) : (
                                    <table className={styles.mainTable}>
                                        <thead>
                                            <tr>
                                                <th>ID</th>
                                                <th>Fecha</th>
                                                <th>Cliente</th>
                                                <th>Problema Reportado</th>
                                                <th>Estado</th>
                                                <th>Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {globalOrders.filter(o => o.problema_reportado).map(order => (
                                                <tr key={order.id} className={styles.orderRow} onClick={() => setSelectedOrder(order)}>
                                                    <td>#{order.id}</td>
                                                    <td>{new Date(order.timestamp).toLocaleDateString()}</td>
                                                    <td>{order.cliente_nombre}</td>
                                                    <td style={{ color: 'var(--warning)', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {order.problema_reportado}
                                                    </td>
                                                    <td>
                                                        <span className={`${styles.statusBadge} ${styles[order.estado]}`}>
                                                            {order.estado}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <button
                                                            className={styles.revokeBtn}
                                                            style={{ color: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedOrder(order);
                                                            }}
                                                        >
                                                            Ver Detalles
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </section>
                        </div>
                    )}
                </div>

                {/* MODAL ORDER DETAILS */}
                {/* MODAL ORDER DETAILS */}
                {selectedOrder && (
                    <div className={styles.modalOverlay} onClick={() => setSelectedOrder(null)}>
                        <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                            <div className={styles.modalHeader}>
                                <h2 className={styles.modalTitle}>
                                    <Package size={28} color="var(--primary-color)" />
                                    Detalles del Pedido #{selectedOrder.id}
                                </h2>
                                <button className={styles.closeIconBtn} onClick={() => setSelectedOrder(null)}>
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

                                <div className={styles.reportSection}>
                                    <div className={styles.reportHeader} onClick={() => document.getElementById('reportInput').focus()}>
                                        <AlertTriangle size={16} />
                                        <span>Reportar Problema</span>
                                    </div>
                                    <textarea
                                        id="reportInput"
                                        className={styles.reportInput}
                                        placeholder="Describa el problema aquí..."
                                        value={reportProblem}
                                        onChange={(e) => setReportProblem(e.target.value)}
                                    />
                                    <button className={styles.submitReportBtn} onClick={handleReportSubmit}>
                                        <Send size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                                        Enviar
                                    </button>
                                </div>

                                <button className={styles.closeBtnPrimary} onClick={() => setSelectedOrder(null)}>
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default JefeCarnes;
