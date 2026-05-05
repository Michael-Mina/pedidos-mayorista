import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import api, { pedidoService } from '../../services/api';
import { socketService } from '../../services/api/socket';
import { 
    ClipboardList, LogOut, Play, CheckCircle, Users, 
    Clock, Package, UserCheck, Bell, BellRing, Monitor
} from 'lucide-react';
import styles from './Sede.module.css';

const Sede = () => {
    const { user, logout } = useAuth();
    const [pedidos, setPedidos] = useState([]);
    const [allCarniceros, setAllCarniceros] = useState([]);
    const [selectedPedidoId, setSelectedPedidoId] = useState(null);
    const [newOrderIds, setNewOrderIds] = useState(new Set());
    
    // Audio for notifications
    const audioRef = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'));

    // Derive selected order
    const selectedPedido = pedidos.find(p => p.id === selectedPedidoId) || null;

    useEffect(() => {
        if (!user || user.role !== 'sede_butcher') return;

        socketService.connect(`sede_${user.sede_id}`);
        fetchInitialData();

        socketService.onNewOrder((newOrder) => {
            setPedidos(prev => {
                if (prev.some(p => p.id === newOrder.id)) return prev;
                return [newOrder, ...prev];
            });
            setNewOrderIds(prev => new Set(prev).add(newOrder.id));
            
            // Play notification sound
            audioRef.current.play().catch(e => console.log("Audio play blocked by browser"));
        });

        socketService.onOrderUpdate((updatedOrder) => {
            setPedidos(prev => prev.map(p =>
                p.id === updatedOrder.id ? updatedOrder : p
            ));
            
            if (updatedOrder.estado === 'finalizado') {
                setPedidos(prev => prev.filter(p => p.id !== updatedOrder.id));
                if (selectedPedidoId === updatedOrder.id) setSelectedPedidoId(null);
            }
        });

        return () => {
            socketService.offNewOrder();
            socketService.offOrderUpdate();
            socketService.disconnect();
        };
    }, [user?.id, user?.sede_id]);

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

    const handleSelectPedido = (id) => {
        setSelectedPedidoId(id);
        if (newOrderIds.has(id)) {
            const next = new Set(newOrderIds);
            next.delete(id);
            setNewOrderIds(next);
        }
    };

    const handleTakeOrder = async (pedidoId, carniceroId) => {
        if (!carniceroId) return;
        try {
            await pedidoService.updateEstado(pedidoId, 'en_proceso', carniceroId);
            setPedidos(prev => prev.map(p =>
                p.id === pedidoId ? { ...p, estado: 'en_proceso', carnicero_id: carniceroId } : p
            ));
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
        const c = allCarniceros.find(c => c.id === id);
        return c ? `${c.nombre} ${c.apellido}` : 'Desconocido';
    };

    return (
        <div className={styles.container}>
            <header className={`${styles.header} glass-card`}>
                <div className={styles.logo}>
                    <Monitor size={24} style={{ marginRight: '10px', color: 'var(--primary-color)' }} />
                    Caña<span>veral</span> <small>| Panel de Sede</small>
                </div>

                <div className={styles.headerRight}>
                    <div className={styles.sedeBadge}>
                        <Clock size={14} />
                        <span>Sede {user?.username}</span>
                    </div>
                    <button onClick={logout} className={styles.logoutBtn}>
                        <LogOut size={20} />
                    </button>
                </div>
            </header>

            <main className={styles.mainLayout}>
                {/* Panel Izquierdo: Monitor de Pedidos */}
                <aside className={`${styles.sidebar} glass-card`}>
                    <div className={styles.columnHeader}>
                        <BellRing size={18} className={pedidosPendientes.length > 0 ? styles.pulse : ''} />
                        <h3>PENDIENTES ({pedidosPendientes.length})</h3>
                    </div>
                    <div className={styles.orderList}>
                        {pedidosPendientes.map(pedido => (
                            <div
                                key={pedido.id}
                                className={`${styles.orderCard} ${selectedPedidoId === pedido.id ? styles.active : ''} ${newOrderIds.has(pedido.id) ? styles.isNew : ''}`}
                                onClick={() => handleSelectPedido(pedido.id)}
                            >
                                <div className={styles.orderCardTop}>
                                    <span className={styles.orderId}>#{pedido.id}</span>
                                    {newOrderIds.has(pedido.id) && <span className={styles.newTag}>NUEVO</span>}
                                    <span className={styles.orderTime}>{new Date(pedido.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <div className={styles.clientName}>{pedido.cliente_nombre}</div>
                            </div>
                        ))}
                        {pedidosPendientes.length === 0 && (
                            <div className={styles.emptyState}>Esperando nuevos pedidos...</div>
                        )}
                    </div>

                </aside>

                {/* Panel Central: Detalle y Acción */}
                <section className={`${styles.content} glass-card`}>
                    {selectedPedido ? (
                        <div className={styles.detailWrapper}>
                            <div className={styles.detailTitle}>
                                <div>
                                    <h1>PEDIDO #{selectedPedido.id}</h1>
                                    <p>{selectedPedido.cliente_nombre} | {new Date(selectedPedido.timestamp).toLocaleTimeString()}</p>
                                </div>
                                <div className={`${styles.statusBadge} ${styles[selectedPedido.estado]}`}>
                                    {selectedPedido.estado.toUpperCase()}
                                </div>
                            </div>

                            {selectedPedido.estado === 'pendiente' ? (
                                <div className={styles.actionArea}>
                                    <div className={styles.instructionBox}>
                                        <Users size={32} />
                                        <h2>Asignar a Carnicero</h2>
                                        <p>Seleccione al personal disponible para iniciar la preparación.</p>
                                    </div>
                                    <div className={styles.butcherGrid}>
                                        {allCarniceros
                                            .filter(c => c.is_available)
                                            .sort((a, b) => (parseInt(a.numero_carnicero) || 0) - (parseInt(b.numero_carnicero) || 0))
                                            .map(carnicero => (
                                            <button
                                                key={carnicero.id}
                                                className={styles.butcherBtn}
                                                onClick={() => handleTakeOrder(selectedPedido.id, carnicero.id)}
                                            >
                                                <span className={styles.butcherNum}>{carnicero.numero_carnicero}</span>
                                                <span className={styles.butcherText}>{carnicero.nombre} {carnicero.apellido}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className={styles.detailScrollable}>
                                    <table className={styles.itemsTable}>
                                        <thead>
                                            <tr>
                                                <th>PRODUCTO / CORTE</th>
                                                <th style={{ textAlign: 'right' }}>CANTIDAD</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedPedido.detalles.map((det, idx) => (
                                                <tr key={idx}>
                                                    <td>
                                                        <div className={styles.productName}>
                                                            <Package size={16} />
                                                            {det.corte?.nombre || 'Producto'}
                                                            {det.tipo_corte && <small>({det.tipo_corte.nombre})</small>}
                                                        </div>
                                                        {det.observaciones && <div className={styles.itemObs}>{det.observaciones}</div>}
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}><strong>{det.cantidad_kg} kg</strong></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    {selectedPedido.estado === 'en_proceso' && (
                                        <button
                                            className={styles.finishBtn}
                                            onClick={() => handleCompleteOrder(selectedPedido.id)}
                                        >
                                            <CheckCircle size={20} />
                                            FINALIZAR Y NOTIFICAR
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className={styles.welcomeState}>
                            <Monitor size={80} strokeWidth={1} />
                            <h2>Monitor de Sede Activo</h2>
                            <p>Los pedidos de Mayorista aparecerán en el panel izquierdo automáticamente.</p>
                        </div>
                    )}
                </section>

                {/* Panel Derecho: En Preparación */}
                <aside className={`${styles.sidebar} glass-card`}>
                    <div className={styles.columnHeader}>
                        <Play size={18} style={{ color: 'var(--warning)' }} />
                        <h3>EN PREPARACIÓN ({pedidosEnProceso.length})</h3>
                    </div>
                    <div className={styles.orderList}>
                        {pedidosEnProceso.map(pedido => (
                            <div
                                key={pedido.id}
                                className={`${styles.orderCard} ${selectedPedidoId === pedido.id ? styles.active : ''}`}
                                onClick={() => handleSelectPedido(pedido.id)}
                                style={{ borderLeft: '4px solid var(--warning)' }}
                            >
                                <div className={styles.orderCardTop}>
                                    <span className={styles.orderId}>#{pedido.id}</span>
                                    <span className={styles.prepBy}>
                                        <UserCheck size={12} /> {getButcherName(pedido.carnicero_id)}
                                    </span>
                                </div>
                                <div className={styles.clientName}>{pedido.cliente_nombre}</div>
                            </div>
                        ))}
                        {pedidosEnProceso.length === 0 && (
                            <div className={styles.emptyState}>No hay pedidos en preparación.</div>
                        )}
                    </div>
                </aside>
            </main>
        </div>
    );
};

export default Sede;
