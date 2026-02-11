import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api, { pedidoService, productService } from '../../services/api';
import { socketService } from '../../services/api/socket';
import styles from './Mayorista.module.css';
import { ShoppingCart, Package, History, LogOut, Plus, Trash2, Clock, Filter, Calendar, Search, X, AlertCircle, Minus, Edit2 } from 'lucide-react';

const Mayorista = () => {
    const { user, logout } = useAuth();
    const [step, setStep] = useState(1);
    const [categories, setCategories] = useState([]);
    const [cortes, setCortes] = useState([]);
    const [tiposCorte, setTiposCorte] = useState([]);
    const [pedidosHistory, setPedidosHistory] = useState([]);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [filterDate, setFilterDate] = useState(new Date().toLocaleDateString('sv-SE')); // sv-SE uses YYYY-MM-DD format logically
    const [reportingPedido, setReportingPedido] = useState(null);
    const [problemText, setProblemText] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [viewingOrder, setViewingOrder] = useState(null);
    const [tempQty, setTempQty] = useState(1.0);
    const [tempObs, setTempObs] = useState('');
    const [editingIndex, setEditingIndex] = useState(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    const [selection, setSelection] = useState({
        category: null,
        corte: null,
        tipoCorte: null
    });
    const [currentOrder, setCurrentOrder] = useState({
        cliente: '',
        items: []
    });

    useEffect(() => {
        if (user) {
            socketService.connect(`sede_${user.sede_id}`);
            fetchInitialData();

            socketService.onOrderUpdate((updatedOrder) => {
                setPedidosHistory(prev => {
                    const filtered = prev.filter(p => p.id !== updatedOrder.id);
                    return [updatedOrder, ...filtered];
                });
                // Update active modal if it's the same order
                setViewingOrder(prev => (prev?.id === updatedOrder.id ? updatedOrder : prev));
            });
        }

        return () => {
            socketService.offOrderUpdate();
            socketService.disconnect();
        };
    }, [user]);

    const fetchInitialData = async () => {
        try {
            const [cats, history, types] = await Promise.all([
                productService.getCategories(),
                pedidoService.getAll(user.sede_id),
                productService.getTiposCorte()
            ]);
            setCategories(cats);
            setPedidosHistory(history);
            setTiposCorte(types);
        } catch (error) {
            console.error("Error fetching data:", error);
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
        if (!problemText) return;
        try {
            await api.put(`/pedidos/${reportingPedido.id}/problema`, null, {
                params: { problema: problemText }
            });
            // Update local state
            setPedidosHistory(prev => prev.map(p =>
                p.id === reportingPedido.id ? { ...p, problema_reportado: problemText } : p
            ));
            setReportingPedido(null);
            setProblemText('');
            alert("Problema reportado con éxito");
        } catch (error) {
            console.error("Error reporting problem:", error);
            alert("No se pudo reportar el problema");
        }
    };

    const filteredHistory = pedidosHistory
        .filter(p => {
            const matchesDate = p.timestamp.startsWith(filterDate);
            const matchesSearch =
                p.cliente_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.id.toString().includes(searchTerm);
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
            {/* Header */}
            <header className={`${styles.header} glass-card`}>
                <div className={styles.logo}>Caña<span>veral</span> <small>| Mayorista</small></div>

                <div className={styles.headerActions}>
                    <button
                        className={`${styles.actionBtn} glass-card`}
                        onClick={() => setShowHistoryModal(true)}
                    >
                        <History size={18} /> Historial Global
                    </button>
                    <div className={styles.userInfo}>
                        <span>{user?.username}</span>
                        <button onClick={logout} className={styles.logoutBtn}><LogOut size={18} /></button>
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
                            <button onClick={() => setStep(2)} className={styles.backBtn}>← Volver a Cortes</button>
                            <div className={styles.grid}>
                                {tiposCorte.map(tipo => (
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
                                    onClick={() => setViewingOrder(item)}
                                    style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
                                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                    <div className={styles.historyInfo}>
                                        <strong>#{item.id} - {item.cliente_nombre}</strong>
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
                            <h2><Search size={22} /> Consulta de Pedidos</h2>
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
                                    placeholder="Buscar por Nombre o ID..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
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
                                            <td><strong>#{p.id}</strong></td>
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
                                                        onClick={() => setViewingOrder(p)}
                                                    >
                                                        <Search size={14} /> Detalles
                                                    </button>
                                                    <button
                                                        className={styles.reportBtn}
                                                        onClick={() => setReportingPedido(p)}
                                                        disabled={p.problema_reportado}
                                                    >
                                                        <AlertCircle size={14} /> {p.problema_reportado ? 'Reportado' : 'Reportar'}
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
                                    <p>No se encontraron pedidos para esta fecha.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Reporte de Problema */}
            {reportingPedido && (
                <div className={styles.modalOverlay} style={{ zIndex: 1100 }}>
                    <div className={`${styles.modalContent} glass-card`} style={{ maxWidth: '400px' }}>
                        <h3>Reportar problema en Pedido #{reportingPedido.id}</h3>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
                            Describe brevemente el inconveniente con este pedido para que la carnicería lo revise.
                        </p>
                        <textarea
                            className="input-field"
                            rows="4"
                            placeholder="Ej: Faltó un corte, peso incorrecto..."
                            value={problemText}
                            onChange={(e) => setProblemText(e.target.value)}
                        ></textarea>
                        <div className={styles.modalActions}>
                            <button className="premium-button" style={{ background: 'var(--error)' }} onClick={() => setReportingPedido(null)}>Cancelar</button>
                            <button className="premium-button" onClick={handleReportProblem} disabled={!problemText}>Enviar Reporte</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Detalles del Pedido */}
            {viewingOrder && (
                <div className={styles.modalOverlay} style={{ zIndex: 1200 }}>
                    <div className={`${styles.modalContent} glass-card`} style={{ maxWidth: '600px' }}>
                        <div className={styles.modalHeader}>
                            <h2><Package size={22} /> Detalles del Pedido #{viewingOrder.id}</h2>
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
        </div>
    );
};

export default Mayorista;
