import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Minus, Plus, ShoppingCart, Trash2, Package } from 'lucide-react';
import publicClientService from '../../services/api/publicClient';
import mayoristaStyles from '../Mayorista/Mayorista.module.css';
import styles from './Clientes.module.css';

const SESSION_KEY = (slug) => `cliente_pedido_${slug}`;

const ClientesPedido = () => {
    const { slug } = useParams();
    const [sede, setSede] = useState(null);
    const [showContactModal, setShowContactModal] = useState(true);
    const [contact, setContact] = useState({ nombre: '', telefono: '' });
    const [step, setStep] = useState(1);
    const [categories, setCategories] = useState([]);
    const [cortes, setCortes] = useState([]);
    const [tiposCorte, setTiposCorte] = useState([]);
    const [selection, setSelection] = useState({ category: null, corte: null, tipoCorte: null });
    const [items, setItems] = useState([]);
    const [tempQty, setTempQty] = useState(1.0);
    const [tempObs, setTempObs] = useState('');
    const [editingIndex, setEditingIndex] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [confirmed, setConfirmed] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        const saved = sessionStorage.getItem(SESSION_KEY(slug));
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed.nombre && parsed.telefono) {
                    setContact(parsed);
                    setShowContactModal(false);
                }
            } catch {
                /* ignore */
            }
        }
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
        sessionStorage.setItem(SESSION_KEY(slug), JSON.stringify({
            nombre: contact.nombre.trim(),
            telefono: contact.telefono.trim(),
        }));
        setShowContactModal(false);
    };

    const handleCategoryClick = async (cat) => {
        setSelection({ ...selection, category: cat });
        const res = await publicClientService.getCortes(slug, cat.id);
        setCortes(res);
        setStep(2);
    };

    const handleAddToCart = () => {
        if (tempQty <= 0) return;
        const newItem = {
            corte_id: selection.corte.id,
            tipo_corte_id: selection.tipoCorte.id,
            name: selection.corte.nombre,
            type: selection.tipoCorte.nombre,
            qty: tempQty,
            observaciones: tempObs,
        };
        if (editingIndex !== null) {
            setItems((prev) => prev.map((it, i) => (i === editingIndex ? newItem : it)));
            setEditingIndex(null);
        } else {
            setItems((prev) => [...prev, newItem]);
        }
        setStep(1);
        setSelection({ category: null, corte: null, tipoCorte: null });
        setTempQty(1.0);
        setTempObs('');
    };

    const submitOrder = async () => {
        if (!items.length || submitting) return;
        setSubmitting(true);
        setError('');
        try {
            const pedido = await publicClientService.createPedido(slug, {
                cliente_nombre: contact.nombre,
                cliente_telefono: contact.telefono,
                detalles: items.map((item) => ({
                    corte_id: item.corte_id,
                    tipo_corte_id: item.tipo_corte_id,
                    cantidad_kg: item.qty,
                    observaciones: item.observaciones || null,
                })),
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
        <div className={mayoristaStyles.container}>
            {showContactModal && (
                <div className={styles.modalOverlay}>
                    <form className={`${styles.modal} glass-card`} onSubmit={confirmContact}>
                        <h2>Sus datos</h2>
                        <p>Ingrese nombre y teléfono para recibir avisos del pedido</p>
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
                        <button type="submit" className="premium-button" style={{ width: '100%' }}>Continuar</button>
                    </form>
                </div>
            )}

            <header className={`${mayoristaStyles.header} glass-card`} style={{ marginBottom: 16 }}>
                <Link to={`/clientes/${slug}`} className={styles.backLink} style={{ margin: 0 }}>
                    <ArrowLeft size={18} /> Volver
                </Link>
                <div className={mayoristaStyles.logo}>
                    Pedido cliente {sede ? `| ${sede.nombre}` : ''}
                </div>
                <div className={mayoristaStyles.userInfo}>
                    <span>{contact.nombre}</span>
                </div>
            </header>

            <main className={mayoristaStyles.mainGrid}>
                <aside className={`${mayoristaStyles.column} ${mayoristaStyles.summaryColumn} glass-card`}>
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
                                        <span className={mayoristaStyles.itemQty}>{item.qty}kg</span>
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

                <section className={`${mayoristaStyles.column} ${mayoristaStyles.selectorColumn} glass-card`}>
                    <h2 className={mayoristaStyles.colTitle}><Package size={20} /> Seleccionar productos</h2>
                    {step === 1 && (
                        <div className={mayoristaStyles.grid}>
                            {categories.map((cat) => (
                                <button key={cat.id} type="button" className={mayoristaStyles.card} onClick={() => handleCategoryClick(cat)}>
                                    {cat.imagen_url ? <img src={cat.imagen_url} alt={cat.nombre} className={mayoristaStyles.cardImg} /> : <span className={mayoristaStyles.cardIcon}>🥩</span>}
                                    <h3>{cat.nombre}</h3>
                                </button>
                            ))}
                        </div>
                    )}
                    {step === 2 && (
                        <div>
                            <button type="button" onClick={() => setStep(1)} className={mayoristaStyles.backBtn}>← Categorías</button>
                            <div className={mayoristaStyles.grid}>
                                {cortes.map((corte) => (
                                    <button key={corte.id} type="button" className={mayoristaStyles.card} onClick={() => { setSelection({ ...selection, corte }); setStep(3); }}>
                                        {corte.imagen_url ? <img src={corte.imagen_url} alt={corte.nombre} className={mayoristaStyles.cardImg} /> : <span className={mayoristaStyles.cardIcon}>🥓</span>}
                                        <h3>{corte.nombre}</h3>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {step === 3 && (
                        <div>
                            <button type="button" onClick={() => setStep(2)} className={mayoristaStyles.backBtn}>← Productos</button>
                            <div className={mayoristaStyles.grid}>
                                {((selection.corte?.tipos_corte?.length ? selection.corte.tipos_corte : tiposCorte)).map((tipo) => (
                                    <button key={tipo.id} type="button" className={mayoristaStyles.card} onClick={() => { setSelection({ ...selection, tipoCorte: tipo }); setStep(4); }}>
                                        <span className={mayoristaStyles.cardIcon}>🔪</span>
                                        <h3>{tipo.nombre}</h3>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {step === 4 && (
                        <div className={mayoristaStyles.qtyForm}>
                            <button type="button" onClick={() => setStep(3)} className={mayoristaStyles.backBtn}>← Preparación</button>
                            <h3>{selection.corte?.nombre} - {selection.tipoCorte?.nombre}</h3>
                            <div className={mayoristaStyles.formGroup}>
                                <label>Kilogramos</label>
                                <div className={mayoristaStyles.qtyControl}>
                                    <button type="button" className={mayoristaStyles.qtyBtn} onClick={() => setTempQty((p) => Math.max(0.5, p - 0.5))}><Minus size={16} /></button>
                                    <input type="number" step="0.1" className={`${mayoristaStyles.qtyInput} input-field`} value={tempQty} onChange={(e) => setTempQty(parseFloat(e.target.value) || '')} />
                                    <button type="button" className={mayoristaStyles.qtyBtn} onClick={() => setTempQty((p) => (parseFloat(p) || 0) + 0.5)}><Plus size={16} /></button>
                                </div>
                            </div>
                            <div className={mayoristaStyles.formGroup}>
                                <label>Observaciones</label>
                                <textarea className="input-field" rows="3" value={tempObs} onChange={(e) => setTempObs(e.target.value)} />
                            </div>
                            <button type="button" className="premium-button" onClick={handleAddToCart}><Plus size={18} /> Agregar</button>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
};

export default ClientesPedido;
