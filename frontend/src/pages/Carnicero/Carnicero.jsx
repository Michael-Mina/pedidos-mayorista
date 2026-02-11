import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api, { pedidoService } from '../../services/api';
import { socketService } from '../../services/api/socket';
import { ClipboardList, LogOut, Play, CheckCircle, Users, Clock, Package, ChevronRight, UserCheck } from 'lucide-react';
import styles from './Carnicero.module.css';

const Carnicero = () => {
    const { user, logout, refreshUser } = useAuth();
    const [pedidos, setPedidos] = useState([]);
    const [allCarniceros, setAllCarniceros] = useState([]);
    const [selectedPedidoId, setSelectedPedidoId] = useState(null);

    // Derive the selected order from the pedidos list to ensure it's always up-to-date with socket events
    const selectedPedido = pedidos.find(p => p.id === selectedPedidoId) || null;


    useEffect(() => {
        if (!user || user.role !== 'sede_butcher') {
            return;
        }

        // Connect to sede channel immediately
        socketService.connect(`sede_${user.sede_id}`);
        fetchInitialData();

        socketService.onNewOrder((newOrder) => {
            setPedidos(prev => {
                if (prev.some(p => p.id === newOrder.id)) return prev;
                return [newOrder, ...prev];
            });
        });

        socketService.onOrderUpdate((updatedOrder) => {
            setPedidos(prev => prev.map(p =>
                p.id === updatedOrder.id ? updatedOrder : p
            ));
            // Remove if finalized
            if (updatedOrder.estado === 'finalizado') {
                setPedidos(prev => prev.filter(p => p.id !== updatedOrder.id));
                if (selectedPedidoId === updatedOrder.id) {
                    setSelectedPedidoId(null);
                }
            }
        });

        // Add beforeunload listener to logout when page is closed
        const handleBeforeUnload = (e) => {
            try {
                navigator.sendBeacon(`${import.meta.env.VITE_API_URL}/logout?user_id=${user.id}`);
            } catch (error) {
                console.error('Error during auto-logout:', error);
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            socketService.offNewOrder();
            socketService.offOrderUpdate();
            socketService.disconnect();
        };
    }, [user?.id]);


    const fetchInitialData = async () => {
        try {
            const [pedidosData, usersData] = await Promise.all([
                pedidoService.getAll(user.sede_id),
                api.get(`/users/carniceros/${user.sede_id}`)
            ]);
            setPedidos(pedidosData.filter(p => p.estado !== 'finalizado'));
            setAllCarniceros(usersData.data);
        } catch (error) {
            console.error("Error fetching initial data:", error);
        }
    };

    const handleTakeOrder = async (pedidoId, carniceroId) => {
        if (!carniceroId) return;
        try {
            await pedidoService.updateEstado(pedidoId, 'en_proceso', carniceroId);
            setPedidos(prev => prev.map(p =>
                p.id === pedidoId ? { ...p, estado: 'en_proceso', carnicero_id: carniceroId } : p
            ));
            // No need to update selectedPedido manually as it is derived
            setSelectedPedidoId(pedidoId);
        } catch (error) {
            console.error("Error taking order:", error);
        }
    };

    const handleCompleteOrder = async (pedidoId) => {
        try {
            await pedidoService.updateEstado(pedidoId, 'finalizado');
            setPedidos(prev => prev.filter(p => p.id !== pedidoId));
            setSelectedPedidoId(null);
        } catch (error) {
            console.error("Error completing order:", error);
        }
    };

    const pedidosPendientes = pedidos.filter(p => p.estado === 'pendiente');
    const pedidosEnProceso = pedidos.filter(p => p.estado === 'en_proceso');

    const getButcherName = (id) => {
        return allCarniceros.find(c => c.id === id)?.username || 'Desconocido';
    };

    return (
        <div className={styles.container}>
            <header className={`${styles.header} glass-card`}>
                <div className={styles.logo}>Caña<span>veral</span> <small>| Carnicería - {user?.username}</small></div>

                <div className={styles.headerRight}>
                    <div style={{ textAlign: 'right', marginRight: '15px' }}>
                        <div style={{ fontSize: '0.9rem' }}>Sede: {user?.username}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Carniceros registrados: {allCarniceros.length}</div>
                    </div>
                    <button onClick={logout} className={styles.logoutBtn} title="Cerrar Sesión">
                        <LogOut size={20} />
                    </button>
                </div>
            </header>

            <main className={styles.mainLayout}>
                {/* Columna Izquierda: Pendientes */}
                <aside className={`${styles.column} glass-card`}>
                    <h3><Clock size={18} /> Pendientes ({pedidosPendientes.length})</h3>
                    {pedidosPendientes.map(pedido => (
                        <div
                            key={pedido.id}
                            className={`${styles.orderItem} ${selectedPedidoId === pedido.id ? styles.active : ''}`}
                            onClick={() => setSelectedPedidoId(pedido.id)}
                        >
                            <div className={styles.orderHeader}>
                                <strong>#{pedido.id} - {pedido.cliente_nombre}</strong>
                                <span>{new Date(pedido.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>

                        </div>
                    ))}
                    {pedidosPendientes.length === 0 && (
                        <div className={styles.emptyState}>No hay pedidos pendientes</div>
                    )}
                </aside>

                {/* Columna Central: Detalle */}
                <section className={`${styles.column} glass-card`}>
                    <h3>{selectedPedido ? `Detalle Pedido #${selectedPedido.id}` : 'Monitor de Carne'}</h3>
                    {selectedPedido ? (
                        <div className={styles.detailContent}>
                            <div className={styles.detailHeader}>
                                <h2>{selectedPedido.cliente_nombre}</h2>
                                <p style={{ color: 'var(--text-muted)' }}>Recibido: {new Date(selectedPedido.timestamp).toLocaleString()}</p>
                                {selectedPedido.carnicero_id && (
                                    <p style={{ color: 'var(--primary-color)', fontSize: '0.9rem', marginTop: '10px' }}>
                                        <UserCheck size={14} style={{ marginRight: '5px' }} />
                                        Asignado a: <strong>{getButcherName(selectedPedido.carnicero_id)}</strong>
                                    </p>
                                )}
                            </div>

                            {/* Mostrar Selección de Carniceros si está Pendiente */}
                            {selectedPedido.estado === 'pendiente' ? (
                                <div className={styles.butcherSelectionContainer}>
                                    <h3 style={{ textAlign: 'center', marginBottom: '20px' }}>¿Quién preparará este pedido?</h3>
                                    <div className={styles.butcherGrid}>
                                        {allCarniceros.map(carnicero => (
                                            <div
                                                key={carnicero.id}
                                                className={styles.butcherCard}
                                                onClick={() => handleTakeOrder(selectedPedido.id, carnicero.id)}
                                            >
                                                <div className={styles.butcherAvatar}>
                                                    <Users size={32} />
                                                </div>
                                                <div className={styles.butcherName}>{carnicero.username}</div>
                                                <div className={styles.butcherRole}>Carnicero</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                /* Mostrar Detalles si ya no está pendiente (En Proceso / Finalizado) */
                                <>
                                    <table className={styles.detailTable}>
                                        <thead>
                                            <tr>
                                                <th>Corte</th>
                                                <th>Cantidad</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedPedido.detalles.map((det, idx) => (
                                                <tr key={idx}>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                                            <Package size={14} style={{ marginRight: '8px' }} />
                                                            {det.corte ? det.corte.nombre : `Corte ID: ${det.corte_id}`}
                                                            {det.tipo_corte && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '5px' }}>({det.tipo_corte.nombre})</span>}
                                                        </div>
                                                        {det.observaciones && (
                                                            <div style={{ fontSize: '0.8rem', color: '#f39c12', marginTop: '2px', paddingLeft: '22px', fontStyle: 'italic' }}>
                                                                Note: {det.observaciones}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td><strong>{det.cantidad_kg} kg</strong></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    {selectedPedido.observaciones && (
                                        <div className={styles.obsBox}>
                                            <label>Observaciones del Cliente:</label>
                                            {selectedPedido.observaciones}
                                        </div>
                                    )}

                                    {selectedPedido.estado === 'en_proceso' && (
                                        <button
                                            className="premium-button"
                                            style={{ background: 'var(--success)', marginTop: 'auto', padding: '20px' }}
                                            onClick={() => handleCompleteOrder(selectedPedido.id)}
                                        >
                                            <CheckCircle size={20} style={{ marginRight: '10px' }} />
                                            Marcar como FINALIZADO
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    ) : (
                        <div className={styles.emptyState}>
                            <ClipboardList size={64} style={{ marginBottom: '20px', color: 'var(--primary-color)' }} />
                            <h3>Listo para procesar</h3>
                            <p>Seleccione un pedido para ver la descripción y completar el trabajo.</p>
                        </div>
                    )}
                </section>

                {/* Columna Derecha: En Proceso */}
                <aside className={`${styles.column} glass-card`}>
                    <h3><Play size={18} /> En Proceso ({pedidosEnProceso.length})</h3>
                    {pedidosEnProceso.map(pedido => (
                        <div
                            key={pedido.id}
                            className={`${styles.orderItem} ${selectedPedidoId === pedido.id ? styles.active : ''}`}
                            onClick={() => setSelectedPedidoId(pedido.id)}
                            style={{ borderLeft: '4px solid var(--warning)' }}
                        >
                            <div className={styles.orderHeader}>
                                <strong>#{pedido.id} - {pedido.cliente_nombre}</strong>
                            </div>
                            <div className={styles.orderFooter}>
                                <div className={styles.assignedTo}>
                                    <UserCheck size={14} style={{ marginRight: '4px' }} />
                                    {getButcherName(pedido.carnicero_id)}
                                </div>
                                <span>{new Date(pedido.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        </div>
                    ))}
                </aside>
            </main>
        </div>
    );
};

export default Carnicero;
