import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, ShoppingCart, Trash2, Package, Pencil, Search } from 'lucide-react';
import publicClientService from '../../services/api/publicClient';
import PreparacionCantidadSteps from '../../components/PreparacionCantidadSteps/PreparacionCantidadSteps';
import { buildCartItem, buildDetallePayload, formatItemCantidad } from '../../utils/pedidoCantidad';
import mayoristaStyles from '../Mayorista/Mayorista.module.css';
import styles from './Clientes.module.css';

const ClientesPedido = () => {
    const { slug } = useParams();
    const [sede, setSede] = useState(null);
    const [showContactModal, setShowContactModal] = useState(true);
    const [contactModalMode, setContactModalMode] = useState('initial');
    const [contact, setContact] = useState({ nombre: '', telefono: '' });
    const [step, setStep] = useState(1);
    const [categories, setCategories] = useState([]);
    const [cortes, setCortes] = useState([]);
    const [tiposCorte, setTiposCorte] = useState([]);
    const [selection, setSelection] = useState({ category: null, corte: null, tipoCorte: null });
    const [items, setItems] = useState([]);
    const [tempQty, setTempQty] = useState(1.0);
    const [tempObs, setTempObs] = useState('');
    const [modoCantidad, setModoCantidad] = useState(null);
    const [tempPorciones, setTempPorciones] = useState(1);
    const [tempGramosPorcion, setTempGramosPorcion] = useState(0.25);
    const [editingIndex, setEditingIndex] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [confirmed, setConfirmed] = useState(null);
    const [error, setError] = useState('');
    const [productSearch, setProductSearch] = useState('');

    useEffect(() => {
        sessionStorage.removeItem(`cliente_pedido_${slug}`);
        setContact({ nombre: '', telefono: '' });
        setContactModalMode('initial');
        setShowContactModal(true);
        publicClientService.getSedeInfo(slug).then(setSede).catch(() => setError('Sede no encontrada'));
        Promise.all([
            publicClientService.getCategories(slug),
            publicClientService.getTiposCorte(slug),
        ]).then(([cats, tipos]) => {
            setCategories(cats);
            setTiposCorte(tipos);
        }).catch((err) => setError(err.message));
    }, [slug]);

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
        setSelection({ ...selection, category: cat });
        const res = await publicClientService.getCortes(slug, cat.id);
        setCortes(res);
        setStep(2);
    };

    const filterProductItems = useCallback((items) => {
        const q = productSearch.trim().toLowerCase();
        if (!q) return items;
        return items.filter((item) => (item.nombre || '').toLowerCase().includes(q));
    }, [productSearch]);

    const filteredCategories = useMemo(() => filterProductItems(categories), [categories, filterProductItems]);
    const filteredCortes = useMemo(() => filterProductItems(cortes), [cortes, filterProductItems]);
    const filteredTiposCorte = useMemo(() => {
        const base = selection.corte?.tipos_corte?.length ? selection.corte.tipos_corte : tiposCorte;
        return filterProductItems(base);
    }, [selection.corte, tiposCorte, filterProductItems]);

    const productSearchPlaceholder = step === 1
        ? 'Buscar categoría...'
        : step === 2
          ? 'Buscar producto...'
          : 'Buscar preparación...';

    const resetCantidadForm = () => {
        setModoCantidad(null);
        setTempPorciones(1);
        setTempGramosPorcion(0.25);
        setTempQty(1.0);
        setTempObs('');
    };

    const handleModeSelect = (modo) => {
        setModoCantidad(modo);
        setStep(5);
    };

    const handleAddToCart = () => {
        if (modoCantidad === 'porciones' && (!tempPorciones || tempPorciones < 1)) return;
        if (modoCantidad === 'kg' && (!tempQty || tempQty <= 0)) return;
        if (!tempGramosPorcion || tempGramosPorcion <= 0) return;

        const newItem = buildCartItem({
            selection,
            modoCantidad,
            tempPorciones,
            tempGramosPorcion,
            tempQty,
            tempObs,
            pesoUnidad: 'lb',
        });

        if (editingIndex !== null) {
            setItems((prev) => prev.map((it, i) => (i === editingIndex ? newItem : it)));
            setEditingIndex(null);
        } else {
            setItems((prev) => [...prev, newItem]);
        }
        setStep(1);
        setSelection({ category: null, corte: null, tipoCorte: null });
        resetCantidadForm();
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
                        onClick={submitOrder}
                    >
                        {submitting ? 'Enviando…' : 'Enviar pedido'}
                    </button>
                </aside>

                <section className={`${styles.pedidoColumn} ${styles.pedidoSelector} glass-card`}>
                    <div className={mayoristaStyles.selectorHeader}>
                        <h2 className={mayoristaStyles.colTitle}><Package size={20} /> Seleccionar productos</h2>
                        {step <= 3 && (
                            <div className={mayoristaStyles.selectorSearch}>
                                <Search size={16} />
                                <input
                                    type="search"
                                    placeholder={productSearchPlaceholder}
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    aria-label={productSearchPlaceholder}
                                />
                            </div>
                        )}
                    </div>
                    <div className={styles.pedidoSelectorBody}>
                    {step === 1 && (
                        <div className={styles.pedidoGrid}>
                            {filteredCategories.map((cat) => (
                                <button key={cat.id} type="button" className={mayoristaStyles.card} onClick={() => handleCategoryClick(cat)}>
                                    {cat.imagen_url ? <img src={cat.imagen_url} alt={cat.nombre} className={mayoristaStyles.cardImg} /> : <span className={mayoristaStyles.cardIcon}>🥩</span>}
                                    <h3>{cat.nombre}</h3>
                                </button>
                            ))}
                            {!filteredCategories.length && (
                                <p className={mayoristaStyles.emptyMsg}>No se encontraron categorías.</p>
                            )}
                        </div>
                    )}
                    {step === 2 && (
                        <div>
                            <button type="button" onClick={() => setStep(1)} className={mayoristaStyles.backBtn}>← Categorías</button>
                            <div className={styles.pedidoGrid}>
                                {filteredCortes.map((corte) => (
                                    <button key={corte.id} type="button" className={mayoristaStyles.card} onClick={() => { setSelection({ ...selection, corte }); setStep(3); }}>
                                        {corte.imagen_url ? <img src={corte.imagen_url} alt={corte.nombre} className={mayoristaStyles.cardImg} /> : <span className={mayoristaStyles.cardIcon}>🥓</span>}
                                        <h3>{corte.nombre}</h3>
                                    </button>
                                ))}
                            </div>
                            {!filteredCortes.length && (
                                <p className={mayoristaStyles.emptyMsg}>No se encontraron productos.</p>
                            )}
                        </div>
                    )}
                    {step === 3 && (
                        <div>
                            <button type="button" onClick={() => setStep(2)} className={mayoristaStyles.backBtn}>← Productos</button>
                            <div className={styles.pedidoGrid}>
                                {filteredTiposCorte.map((tipo) => (
                                    <button key={tipo.id} type="button" className={mayoristaStyles.card} onClick={() => { setSelection({ ...selection, tipoCorte: tipo }); setModoCantidad(null); setStep(4); }}>
                                        <span className={mayoristaStyles.cardIcon}>🔪</span>
                                        <h3>{tipo.nombre}</h3>
                                    </button>
                                ))}
                            </div>
                            {!filteredTiposCorte.length && (
                                <p className={mayoristaStyles.emptyMsg}>No se encontraron preparaciones.</p>
                            )}
                        </div>
                    )}
                    {step === 4 && (
                        <PreparacionCantidadSteps
                            step={4}
                            selection={selection}
                            onModeSelect={handleModeSelect}
                            onBackFromMode={() => setStep(3)}
                            styles={mayoristaStyles}
                            pesoUnidad="lb"
                        />
                    )}
                    {step === 5 && (
                        <PreparacionCantidadSteps
                            step={5}
                            selection={selection}
                            modoCantidad={modoCantidad}
                            onBackFromForm={() => setStep(4)}
                            tempPorciones={tempPorciones}
                            setTempPorciones={setTempPorciones}
                            tempGramosPorcion={tempGramosPorcion}
                            setTempGramosPorcion={setTempGramosPorcion}
                            tempQty={tempQty}
                            setTempQty={setTempQty}
                            tempObs={tempObs}
                            setTempObs={setTempObs}
                            onSubmit={handleAddToCart}
                            styles={mayoristaStyles}
                            pesoUnidad="lb"
                        />
                    )}
                    </div>
                </section>
            </main>
        </div>
    );
};

export default ClientesPedido;
