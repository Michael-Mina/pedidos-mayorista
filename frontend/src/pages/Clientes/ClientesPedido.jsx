import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ShoppingCart, Trash2, Package, Pencil, Edit2, X, AlertCircle } from 'lucide-react';
import publicClientService from '../../services/api/publicClient';
import { socketService } from '../../services/api/socket';
import PedidoProductoFlow from '../../components/PedidoProductoFlow/PedidoProductoFlow';
import { usePedidoProductoFlow } from '../../components/PedidoProductoFlow/usePedidoProductoFlow';
import { buildDetallePayload, formatItemCantidad } from '../../utils/pedidoCantidad';
import mayoristaStyles from '../Mayorista/Mayorista.module.css';
import styles from './Clientes.module.css';

const ClientesPedido = () => {
    const { slug } = useParams();
    const [sede, setSede] = useState(null);
    const [showContactModal, setShowContactModal] = useState(true);
    const [contactModalMode, setContactModalMode] = useState('initial');
    const [contact, setContact] = useState({ nombre: '', telefono: '' });
    const [categories, setCategories] = useState([]);
    const [cortes, setCortes] = useState([]);
    const [tiposCorte, setTiposCorte] = useState([]);
    const [items, setItems] = useState([]);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [confirmed, setConfirmed] = useState(null);
    const [error, setError] = useState('');

    const handleItemAdded = useCallback((item, editingIndex) => {
        if (editingIndex !== null) {
            setItems((prev) => prev.map((it, i) => (i === editingIndex ? item : it)));
        } else {
            setItems((prev) => [...prev, item]);
        }
    }, []);

    const flow = usePedidoProductoFlow({
        tiposCorte,
        pesoUnidad: 'lb',
        onItemAdded: handleItemAdded,
    });

    const selectedCategoryIdRef = useRef(null);

    useEffect(() => {
        selectedCategoryIdRef.current = flow.selection?.category?.id ?? null;
    }, [flow.selection?.category?.id]);

    const reloadCatalog = useCallback(async () => {
        try {
            const [cats, tipos] = await Promise.all([
                publicClientService.getCategories(slug),
                publicClientService.getTiposCorte(slug),
            ]);
            setCategories(cats);
            setTiposCorte(tipos);
            const catId = selectedCategoryIdRef.current;
            if (catId) {
                const cortesRes = await publicClientService.getCortes(slug, catId);
                setCortes(cortesRes);
            }
        } catch (err) {
            console.error('Error reloading catalog:', err);
        }
    }, [slug]);

    useEffect(() => {
        sessionStorage.removeItem(`cliente_pedido_${slug}`);
        setContact({ nombre: '', telefono: '' });
        setContactModalMode('initial');
        setShowContactModal(true);
        publicClientService.getSedeInfo(slug).then(setSede).catch(() => setError('Sede no encontrada'));
        reloadCatalog().catch((err) => setError(err.message));
    }, [slug, reloadCatalog]);

    useEffect(() => {
        if (!sede?.id) return undefined;
        socketService.connect(`sede_${sede.id}`);
        socketService.onCatalogUpdate((payload) => {
            if (payload?.sede_id && String(payload.sede_id) !== String(sede.id)) return;
            reloadCatalog();
        });
        return () => {
            socketService.offCatalogUpdate();
            socketService.disconnect();
        };
    }, [sede?.id, reloadCatalog]);

    const confirmContact = (e) => {
        e.preventDefault();
        if (!contact.nombre.trim() || !contact.telefono.trim()) return;
        setContact({
            nombre: contact.nombre.trim(),
            telefono: contact.telefono.trim(),
        });
        setShowContactModal(false);
    };

    const openEditContact = () => {
        if (!contact.nombre) return;
        setContactModalMode('edit');
        setShowContactModal(true);
    };

    const closeContactModal = () => {
        if (contactModalMode === 'edit') {
            setShowContactModal(false);
            return;
        }
    };

    const handleCategoryClick = async (cat) => {
        selectedCategoryIdRef.current = cat.id;
        flow.setSelection({ ...flow.selection, category: cat });
        const res = await publicClientService.getCortes(slug, cat.id);
        setCortes(res);
        flow.setStep(2);
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
        flow.hydrateFromCartItem(items[index], index);
        setError('');
    };

    const handleAddToCart = () => {
        const result = flow.submitPedidoItem();
        if (!result.ok && result.error) setError(result.error);
        else if (result.ok) setError('');
    };

    const submitOrder = async () => {
        if (!items.length || submitting) return;
        setSubmitting(true);
        setError('');
        try {
            const pedido = await publicClientService.createPedido(slug, {
                cliente_nombre: contact.nombre,
                cliente_telefono: contact.telefono,
                detalles: items.map((item) => buildDetallePayload(item)),
            });
            setShowConfirmModal(false);
            setConfirmed(pedido);
            setItems([]);
        } catch (err) {
            setError(err.message || 'No se pudo enviar el pedido');
        } finally {
            setSubmitting(false);
        }
    };

    if (error && !sede) {
        return <div className={styles.page}><div className={`${styles.errorBox} glass-card`}>{error}</div></div>;
    }

    if (confirmed) {
        return (
            <div className={styles.page}>
                <div className={`${styles.confirmBox} glass-card`}>
                    <h1>¡Pedido enviado!</h1>
                    <p>Su número de pedido</p>
                    <div className={styles.confirmNumber}>#{confirmed.numero_pedido || confirmed.id}</div>
                    <p>Le avisaremos por SMS o WhatsApp cuando cambie el estado de su pedido.</p>
                    <Link to={`/clientes/${slug}`} className="premium-button" style={{ display: 'inline-block', marginTop: 20, textDecoration: 'none' }}>
                        Volver al inicio
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.pedidoPage}>
            {showContactModal && (
                <div
                    className={styles.modalOverlay}
                    onClick={contactModalMode === 'edit' ? closeContactModal : undefined}
                    role="presentation"
                >
                    <form
                        className={`${styles.modal} glass-card`}
                        onSubmit={confirmContact}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2>Sus datos</h2>
                        <p>
                            {contactModalMode === 'initial'
                                ? 'Ingrese nombre y teléfono para recibir avisos del pedido'
                                : 'Modifique sus datos si es necesario'}
                        </p>
                        <div className={styles.modalField}>
                            <label htmlFor="cliente-nombre">Nombre</label>
                            <input
                                id="cliente-nombre"
                                className="input-field"
                                value={contact.nombre}
                                onChange={(e) => setContact({ ...contact, nombre: e.target.value })}
                                required
                            />
                        </div>
                        <div className={styles.modalField}>
                            <label htmlFor="cliente-telefono">Teléfono</label>
                            <input
                                id="cliente-telefono"
                                className="input-field"
                                type="tel"
                                value={contact.telefono}
                                onChange={(e) => setContact({ ...contact, telefono: e.target.value })}
                                required
                            />
                        </div>
                        <div className={styles.modalActions}>
                            {contactModalMode === 'initial' ? (
                                <Link to={`/clientes/${slug}`} className={styles.modalBackBtn}>
                                    <ArrowLeft size={16} /> Volver
                                </Link>
                            ) : (
                                <button type="button" className={styles.modalBackBtn} onClick={closeContactModal}>
                                    Cancelar
                                </button>
                            )}
                            <button type="submit" className="premium-button">
                                {contactModalMode === 'initial' ? 'Continuar' : 'Guardar'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {showConfirmModal && (
                <div className={styles.modalOverlay} onClick={() => !submitting && setShowConfirmModal(false)} role="presentation">
                    <div className={`${styles.modal} ${styles.confirmModal} glass-card`} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.confirmModalHeader}>
                            <h2><Package size={22} /> Confirmar pedido</h2>
                            <button type="button" className={styles.confirmCloseBtn} onClick={() => setShowConfirmModal(false)} disabled={submitting} aria-label="Cerrar">
                                <X size={22} />
                            </button>
                        </div>
                        <p>Revise su pedido antes de enviarlo.</p>
                        <div className={styles.confirmSummary}>
                            <p><strong>Cliente:</strong> {contact.nombre}</p>
                            <p><strong>Teléfono:</strong> {contact.telefono}</p>
                            <p><strong>Productos:</strong> {items.length}</p>
                            <div className={styles.confirmList}>
                                {items.map((item, idx) => (
                                    <div key={idx} className={styles.confirmItem}>
                                        <div className={styles.confirmItemInfo}>
                                            <span>{item.name} — {item.type}</span>
                                            {item.observaciones && (
                                                <span className={styles.confirmItemObs}>{item.observaciones}</span>
                                            )}
                                        </div>
                                        <strong>{formatItemCantidad(item)}</strong>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className={styles.confirmWarning}>
                            <AlertCircle size={16} />
                            <span>Una vez enviado no podrá modificar el pedido.</span>
                        </div>
                        {error && <p className={styles.errorText}>{error}</p>}
                        <div className={styles.modalActions}>
                            <button
                                type="button"
                                className={styles.modalBackBtn}
                                onClick={() => setShowConfirmModal(false)}
                                disabled={submitting}
                            >
                                Modificar
                            </button>
                            <button
                                type="button"
                                className="premium-button"
                                onClick={submitOrder}
                                disabled={submitting}
                            >
                                {submitting ? 'Enviando…' : 'Confirmar y enviar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <header className={`${mayoristaStyles.header} glass-card`}>
                <Link to={`/clientes/${slug}`} className={styles.backLink} style={{ margin: 0 }}>
                    <ArrowLeft size={18} /> Volver
                </Link>
                <div className={mayoristaStyles.logo}>
                    Pedido cliente {sede ? `| ${sede.nombre}` : ''}
                </div>
                {!showContactModal && contact.nombre && (
                    <button type="button" className={styles.contactBadge} onClick={openEditContact} title="Modificar datos">
                        <span className={styles.contactBadgeName}>{contact.nombre}</span>
                        <span className={styles.contactBadgePhone}>{contact.telefono}</span>
                        <Pencil size={12} className={styles.contactBadgeIcon} aria-hidden />
                    </button>
                )}
            </header>

            <main className={styles.pedidoLayout}>
                <aside className={`${styles.pedidoColumn} glass-card`}>
                    <h2 className={mayoristaStyles.colTitle}><ShoppingCart size={20} /> Su pedido</h2>
                    <div className={mayoristaStyles.itemsList}>
                        {items.length === 0 ? (
                            <p className={mayoristaStyles.emptyMsg}>No hay artículos agregados</p>
                        ) : (
                            items.map((item, idx) => (
                                <div key={idx} className={mayoristaStyles.orderItem}>
                                    <div className={mayoristaStyles.itemMain}>
                                        <div className={mayoristaStyles.itemInfo}>
                                            <span className={mayoristaStyles.itemName}>{item.name} - {item.type}</span>
                                            {item.observaciones && <span className={mayoristaStyles.itemObs}>{item.observaciones}</span>}
                                        </div>
                                        <span className={mayoristaStyles.itemQty}>{formatItemCantidad(item)}</span>
                                    </div>
                                    <div className={mayoristaStyles.itemActions}>
                                        <button type="button" className={mayoristaStyles.actionIconButton} onClick={() => handleEditItem(idx)} title="Editar">
                                            <Edit2 size={14} />
                                        </button>
                                        <button type="button" className={`${mayoristaStyles.actionIconButton} ${mayoristaStyles.delete}`} onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    {error && <p className={styles.errorText}>{error}</p>}
                    <button
                        type="button"
                        className="premium-button"
                        style={{ width: '100%', marginTop: 'auto' }}
                        disabled={!items.length || submitting}
                        onClick={() => setShowConfirmModal(true)}
                    >
                        {submitting ? 'Enviando…' : 'Enviar pedido'}
                    </button>
                </aside>

                <section className={`${styles.pedidoColumn} ${styles.pedidoSelector} glass-card`}>
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
                        pesoUnidad="lb"
                        styles={mayoristaStyles}
                        gridClassName={styles.pedidoGrid}
                        bodyClassName={styles.pedidoSelectorBody}
                    />
                </section>
            </main>
        </div>
    );
};

export default ClientesPedido;
