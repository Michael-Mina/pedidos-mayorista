import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api, { pedidoService } from '../../services/api';
import { socketService } from '../../services/api/socket';
import { 
    ClipboardList, LogOut, Play, CheckCircle, Users, 
    Clock, Package, UserCheck, Bell, BellRing, Monitor, X, ArrowDown,
    Ticket, ArrowLeft
} from 'lucide-react';
import styles from './Sede.module.css';
import { formatPedidoNumero, formatElapsedSince, formatPedidoItemCount } from '../../utils/pedidos';
import { formatDetalleCantidad } from '../../utils/pedidoCantidad';
import { panelLabel } from '../../utils/rolePanels';
import publicClientService from '../../services/api/publicClient';
import { hasSedeTabletAccess } from '../../utils/sedeTabletAccess';

const Sede = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [pedidos, setPedidos] = useState([]);
    const [allCarniceros, setAllCarniceros] = useState([]);
    const [selectedPedidoId, setSelectedPedidoId] = useState(null);
    const [pendingCarniceroId, setPendingCarniceroId] = useState(null);
    const [assigningOrder, setAssigningOrder] = useState(false);
    const [newOrderIds, setNewOrderIds] = useState(new Set());
    const [nowTick, setNowTick] = useState(() => Date.now());
    const [sedeSlug, setSedeSlug] = useState('');
    const [turnDisplay, setTurnDisplay] = useState({ actual: null, proximos: [] });
    const [callingTurn, setCallingTurn] = useState(false);
    
    // Audio for notifications
    const audioRef = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'));

    useEffect(() => {
        if (!user?.id || !hasSedeTabletAccess(user.id)) {
            navigate('/sede', { replace: true });
        }
    }, [user?.id, navigate]);

    // Derive selected order
    const selectedPedido = pedidos.find(p => p.id === selectedPedidoId) || null;

    const applyCarniceroUpdate = ({ action, sede_id, carnicero }) => {
        if (String(sede_id) !== String(user?.sede_id)) return;
        if (action === 'deleted') {
            setAllCarniceros((prev) => prev.filter((c) => c.id !== carnicero.id));
            setPendingCarniceroId((prev) => (prev === carnicero.id ? null : prev));
            return;
        }
        setAllCarniceros((prev) => {
            const ix = prev.findIndex((c) => c.id === carnicero.id);
            if (ix >= 0) {
                const next = [...prev];
                next[ix] = carnicero;
                return next;
            }
            return [...prev, carnicero];
        });
    };

    useEffect(() => {
        if (!user || user.role !== 'sede_butcher') return;

        socketService.connect(`sede_${user.sede_id}`);
        fetchInitialData();

        socketService.onNewOrder((newOrder) => {
            setPedidos((prev) => {
                const ix = prev.findIndex((p) => p.id === newOrder.id);
                if (ix >= 0) {
                    const next = [...prev];
                    next[ix] = newOrder;
                    return next;
                }
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

        socketService.onCarniceroUpdate(applyCarniceroUpdate);

        socketService.onTurnUpdate((payload) => {
            setTurnDisplay(payload);
        });

        return () => {
            socketService.offNewOrder();
            socketService.offOrderUpdate();
            socketService.offCarniceroUpdate();
            socketService.offTurnUpdate();
            socketService.disconnect();
        };
    }, [user?.id, user?.sede_id]);

    useEffect(() => {
        if (!user?.sede_id) return;
        api.get('/sedes')
            .then((res) => {
                const sede = res.data.find((s) => s.id === user.sede_id);
                setSedeSlug(sede?.slug || '');
            })
            .catch(() => {});
    }, [user?.sede_id]);

    useEffect(() => {
        if (!sedeSlug) return;
        publicClientService.getTurnoDisplay(sedeSlug)
            .then(setTurnDisplay)
            .catch(() => {});
    }, [sedeSlug]);

    const handleLlamarSiguienteTurno = async () => {
        if (!user?.sede_id || callingTurn) return;
        setCallingTurn(true);
        try {
            await api.put(`/turnos/sede/${user.sede_id}/siguiente`);
            if (sedeSlug) {
                const data = await publicClientService.getTurnoDisplay(sedeSlug);
                setTurnDisplay(data);
            }
        } catch (error) {
            console.error('Error al llamar turno:', error.response?.data?.detail || error.message);
        } finally {
            setCallingTurn(false);
        }
    };

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
        setPendingCarniceroId(null);
        if (newOrderIds.has(id)) {
            const next = new Set(newOrderIds);
            next.delete(id);
            setNewOrderIds(next);
        }
    };

    const handleTakeOrder = async (pedidoId, carniceroId) => {
        if (!carniceroId) return;
        setAssigningOrder(true);
        try {
            await pedidoService.updateEstado(pedidoId, 'en_proceso', carniceroId);
            setPedidos(prev => prev.map(p =>
                p.id === pedidoId ? { ...p, estado: 'en_proceso', carnicero_id: carniceroId } : p
            ));
            setSelectedPedidoId(pedidoId);
            setPendingCarniceroId(null);
        } catch (error) {
            console.error("Error taking order:", error);
        } finally {
            setAssigningOrder(false);
        }
    };

    const handleConfirmAssign = () => {
        if (!selectedPedido || !pendingCarniceroId) return;
        handleTakeOrder(selectedPedido.id, pendingCarniceroId);
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

    useEffect(() => {
        if (pedidosPendientes.length === 0 && pedidosEnProceso.length === 0) return;
        const id = setInterval(() => setNowTick(Date.now()), 1000);
        return () => clearInterval(id);
    }, [pedidosPendientes.length, pedidosEnProceso.length]);

    const getButcherName = (id) => {
        const c = allCarniceros.find(c => c.id === id);
        return c ? `${c.nombre} ${c.apellido}` : 'Desconocido';
    };

    const pendingCarnicero = pendingCarniceroId
        ? allCarniceros.find((c) => c.id === pendingCarniceroId)
        : null;

    return (
        <div className={styles.container}>
            <header className={`${styles.header} glass-card`}>
                <div className={styles.logo}>
                    <Link to="/sede" className={styles.hubLink} title="Volver al inicio">
                        <ArrowLeft size={18} />
                    </Link>
                    <Monitor size={24} style={{ marginRight: '10px', color: 'var(--primary-color)' }} />
                    Pedidos <span>Mayorista</span> <small>| {panelLabel('sede')}</small>
                </div>

                <div className={styles.headerRight}>
                    <div className={styles.turnoControls}>
                        <div className={styles.turnoNowBadge} title="Turno en atención en el TV">
                            <Ticket size={16} />
                            <span className={styles.turnoNowLabel}>Turno</span>
                            <strong>{turnDisplay.actual?.numero ?? '—'}</strong>
                        </div>
                        <button
                            type="button"
                            className={styles.turnoCallBtn}
                            onClick={handleLlamarSiguienteTurno}
                            disabled={callingTurn}
                            title="Llamar siguiente turno en pantalla TV"
                        >
                            <Ticket size={16} />
                            {callingTurn ? 'Llamando…' : 'Llamar siguiente'}
                        </button>
                    </div>
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
                                    <span className={styles.orderId}>{formatPedidoNumero(pedido)}</span>
                                    {newOrderIds.has(pedido.id) && <span className={styles.newTag}>NUEVO</span>}
                                    <span
                                        className={styles.orderElapsed}
                                        title={`Recibido a las ${new Date(pedido.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`}
                                    >
                                        <Clock size={12} aria-hidden />
                                        {formatElapsedSince(pedido.timestamp, nowTick)}
                                    </span>
                                </div>
                                <div className={styles.orderCardMeta}>
                                    <div className={styles.clientName}>{pedido.cliente_nombre}</div>
                                    <span className={styles.orderItemCount} title="Cantidad de productos">
                                        <Package size={12} aria-hidden />
                                        {formatPedidoItemCount(pedido)}
                                    </span>
                                </div>
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
                                    <h1>PEDIDO {formatPedidoNumero(selectedPedido)}</h1>
                                    <p>{selectedPedido.cliente_nombre} | {new Date(selectedPedido.timestamp).toLocaleTimeString()}</p>
                                </div>
                                <div className={`${styles.statusBadge} ${styles[selectedPedido.estado]}`}>
                                    {selectedPedido.estado.toUpperCase()}
                                </div>
                            </div>

                            {selectedPedido.estado === 'pendiente' ? (
                                <div className={styles.actionArea}>
                                    <div className={styles.instructionBox}>
                                        <Users size={22} />
                                        <div>
                                            <h2>Asignar a carnicero</h2>
                                            <p>Seleccione un carnicero y confirme la asignación del pedido.</p>
                                        </div>
                                    </div>
                                    <div className={styles.butcherPanel}>
                                        <div className={styles.butcherGrid}>
                                            {allCarniceros
                                                .filter(c => c.is_available)
                                                .sort((a, b) => (parseInt(a.numero_carnicero) || 0) - (parseInt(b.numero_carnicero) || 0))
                                                .map(carnicero => (
                                                    <button
                                                        key={carnicero.id}
                                                        type="button"
                                                        className={`${styles.butcherBtn} ${pendingCarniceroId === carnicero.id ? styles.butcherBtnSelected : ''}`}
                                                        onClick={() => setPendingCarniceroId(carnicero.id)}
                                                    >
                                                        <span className={styles.butcherNum}>{carnicero.numero_carnicero}</span>
                                                        <span className={styles.butcherText}>{carnicero.nombre} {carnicero.apellido}</span>
                                                    </button>
                                                ))}
                                        </div>
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
                                                    <td style={{ textAlign: 'right' }}><strong>{formatDetalleCantidad(det)}</strong></td>
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
                                    <span className={styles.orderId}>{formatPedidoNumero(pedido)}</span>
                                    <span
                                        className={styles.orderElapsed}
                                        title={
                                            pedido.started_at
                                                ? `En preparación desde las ${new Date(pedido.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`
                                                : 'Tiempo en preparación'
                                        }
                                    >
                                        <Clock size={12} aria-hidden />
                                        {formatElapsedSince(pedido.started_at || pedido.timestamp, nowTick)}
                                    </span>
                                </div>
                                <div className={styles.orderCardMeta}>
                                    <div className={styles.clientName}>{pedido.cliente_nombre}</div>
                                    <span className={styles.orderItemCount} title="Cantidad de productos">
                                        <Package size={12} aria-hidden />
                                        {formatPedidoItemCount(pedido)}
                                    </span>
                                </div>
                                <span className={styles.prepBy}>
                                    <UserCheck size={12} aria-hidden />
                                    {getButcherName(pedido.carnicero_id)}
                                </span>
                            </div>
                        ))}
                        {pedidosEnProceso.length === 0 && (
                            <div className={styles.emptyState}>No hay pedidos en preparación.</div>
                        )}
                    </div>
                </aside>
            </main>

            {pendingCarnicero && selectedPedido && (
                <div
                    className={styles.assignModalOverlay}
                    onClick={() => !assigningOrder && setPendingCarniceroId(null)}
                    role="presentation"
                >
                    <div
                        className={styles.assignModal}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="assign-modal-title"
                    >
                        <div className={styles.assignModalHeader}>
                            <div>
                                <h2 id="assign-modal-title">Confirmar asignación</h2>
                                <p className={styles.assignModalSubtitle}>
                                    El pedido pasará a preparación con el carnicero seleccionado.
                                </p>
                            </div>
                            <button
                                type="button"
                                className={styles.assignModalClose}
                                onClick={() => setPendingCarniceroId(null)}
                                disabled={assigningOrder}
                                aria-label="Cerrar"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        <div className={styles.assignSummaryCard}>
                            <div className={styles.assignSummaryRow}>
                                <span className={styles.assignSummaryLabel}>Pedido</span>
                                <span className={styles.assignSummaryValueHighlight}>
                                    {formatPedidoNumero(selectedPedido)}
                                </span>
                            </div>
                            <div className={styles.assignSummaryRow}>
                                <span className={styles.assignSummaryLabel}>Cliente</span>
                                <span className={styles.assignSummaryValue}>
                                    {selectedPedido.cliente_nombre}
                                </span>
                            </div>
                            <div className={styles.assignSummaryRow}>
                                <span className={styles.assignSummaryLabel}>Productos</span>
                                <span className={styles.assignSummaryValue}>
                                    <Package size={14} aria-hidden />
                                    {formatPedidoItemCount(selectedPedido)}
                                </span>
                            </div>
                            <div className={styles.assignSummaryRow}>
                                <span className={styles.assignSummaryLabel}>En espera</span>
                                <span className={styles.assignSummaryValue}>
                                    <Clock size={14} aria-hidden />
                                    {formatElapsedSince(selectedPedido.timestamp, nowTick)}
                                </span>
                            </div>
                        </div>

                        <div className={styles.assignFlowDivider} aria-hidden>
                            <ArrowDown size={18} />
                        </div>

                        <div className={styles.assignTargetBlock}>
                            <span className={styles.assignSummaryLabel}>Asignar a</span>
                            <div className={styles.assignTargetCard}>
                                <span className={styles.assignTargetNum}>
                                    {pendingCarnicero.numero_carnicero}
                                </span>
                                <div className={styles.assignTargetInfo}>
                                    <span className={styles.assignTargetName}>
                                        {pendingCarnicero.nombre} {pendingCarnicero.apellido}
                                    </span>
                                    <span className={styles.assignTargetRole}>Carnicero</span>
                                </div>
                                <UserCheck size={22} className={styles.assignTargetIcon} aria-hidden />
                            </div>
                        </div>
                        <div className={styles.assignConfirmActions}>
                            <button
                                type="button"
                                className={styles.assignCancelBtn}
                                onClick={() => setPendingCarniceroId(null)}
                                disabled={assigningOrder}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className={styles.assignConfirmBtn}
                                onClick={handleConfirmAssign}
                                disabled={assigningOrder}
                            >
                                <UserCheck size={18} />
                                {assigningOrder ? 'Asignando…' : 'Confirmar asignación'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Sede;
