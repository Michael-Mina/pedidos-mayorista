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
    Package,
    Users,
    UserPlus,
    ToggleLeft,
    ToggleRight,
    Edit2,
    Trash2,
    Info
} from 'lucide-react';
import styles from './JefeCarnes.module.css';

const JefeCarnes = () => {
    const { user, logout } = useAuth();
    const [globalOrders, setGlobalOrders] = useState([]);
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
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [reportProblem, setReportProblem] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 8;

    // Custom Notifications State
    const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
    const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null });
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
            fetchCarniceros();

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
                        className={`${styles.navItem} ${activeTab === 'personal' ? styles.active : ''}`}
                        onClick={() => setActiveTab('personal')}
                    >
                        <Users size={20} />
                        Personal
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
                        activeTab === 'personal' ? 'Gestión de Personal' :
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
