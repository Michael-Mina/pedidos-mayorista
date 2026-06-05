import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Search } from 'lucide-react';
import api from '../../services/api';
import { useAppDialog } from '../../context/AppDialogContext';
import styles from './ProductCatalog.module.css';

const ProductCatalog = ({ sedeNombre }) => {
    const { showToast, confirm } = useAppDialog();
    const [products, setProducts] = useState({ categories: [], cuts: [], tiposCorte: [] });
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalType, setModalType] = useState(null);
    const [editItem, setEditItem] = useState(null);
    const [formData, setFormData] = useState({});
    const [categorySearch, setCategorySearch] = useState('');
    const [productSearch, setProductSearch] = useState('');
    const [productCategoryFilter, setProductCategoryFilter] = useState('');

    const fetchCatalog = useCallback(async () => {
        setLoading(true);
        try {
            const [resCats, resCortes, resTipos] = await Promise.all([
                api.get('/categorias'),
                api.get('/cortes'),
                api.get('/tipos-corte'),
            ]);
            setProducts({
                categories: resCats.data,
                cuts: resCortes.data,
                tiposCorte: resTipos.data,
            });
        } catch (error) {
            console.error('Error fetching catalog:', error);
            showToast('No se pudo cargar el catálogo de productos', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        fetchCatalog();
    }, [fetchCatalog]);

    const handleOpenModal = (type, item = null) => {
        setModalType(type);
        setEditItem(item);
        if (type === 'cut' && item) {
            setFormData({ ...item, tipos_corte_ids: item.tipos_corte?.map((t) => t.id) || [] });
        } else {
            setFormData(item || {});
        }
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            let endpoint = '';
            let dataToSend = {};

            if (modalType === 'category') {
                endpoint = '/categorias';
                dataToSend = {
                    nombre: formData.nombre,
                    imagen_url: formData.imagen_url || null,
                };
            } else if (modalType === 'cut') {
                endpoint = '/cortes';
                dataToSend = {
                    nombre: formData.nombre,
                    categoria_id: parseInt(formData.categoria_id, 10),
                    imagen_url: formData.imagen_url || null,
                    tipos_corte_ids: formData.tipos_corte_ids || [],
                };
            } else if (modalType === 'tipoCorte') {
                endpoint = '/tipos-corte';
                dataToSend = { nombre: formData.nombre };
            }

            if (editItem) {
                await api.put(`${endpoint}/${editItem.id}`, dataToSend);
            } else {
                await api.post(endpoint, dataToSend);
            }
            setShowModal(false);
            fetchCatalog();
            showToast('Guardado correctamente', 'success');
        } catch (error) {
            console.error('Error saving catalog item:', error);
            showToast(
                'Error al guardar: ' + (error.response?.data?.detail?.[0]?.msg || error.response?.data?.detail || error.message),
                'error'
            );
        }
    };

    const handleDelete = async (type, id) => {
        const ok = await confirm({
            title: 'Eliminar elemento',
            message: '¿Está seguro de eliminar este elemento del catálogo de su sede?',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
        });
        if (!ok) return;

        const endpoints = {
            category: '/categorias',
            cut: '/cortes',
            tipoCorte: '/tipos-corte',
        };
        try {
            await api.delete(`${endpoints[type]}/${id}`);
            fetchCatalog();
            showToast('Eliminado correctamente', 'success');
        } catch (error) {
            showToast(
                error.response?.data?.detail || 'Error al eliminar',
                'error'
            );
        }
    };

    const filteredCategories = useMemo(
        () => products.categories.filter((cat) =>
            cat.nombre.toLowerCase().includes(categorySearch.trim().toLowerCase())
        ),
        [products.categories, categorySearch]
    );

    const filteredCuts = useMemo(() => products.cuts.filter((cut) => {
        if (productCategoryFilter && String(cut.categoria_id) !== productCategoryFilter) {
            return false;
        }
        const term = productSearch.trim().toLowerCase();
        if (!term) return true;
        return cut.nombre.toLowerCase().includes(term);
    }), [products.cuts, productCategoryFilter, productSearch]);

    if (loading) {
        return <p className={styles.catalogIntro}>Cargando catálogo…</p>;
    }

    return (
        <>
            <p className={styles.catalogIntro}>
                Catálogo de <strong>{sedeNombre || 'su sede'}</strong>. Los productos que configure aquí
                solo estarán disponibles para los mayoristas de esta sede.
            </p>

            <div className={styles.productsGrid}>
                <div className={styles.column}>
                    <div className={styles.managementHeader}>
                        <h2>Categorías</h2>
                        <button type="button" className="premium-button" onClick={() => handleOpenModal('category')}>
                            <Plus size={14} />
                        </button>
                    </div>
                    <div className={styles.searchBar}>
                        <Search size={16} />
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Buscar categoría..."
                            value={categorySearch}
                            onChange={(e) => setCategorySearch(e.target.value)}
                        />
                    </div>
                    <div className={`glass-card ${styles.sectionScroll} ${styles.catalogListScroll}`} style={{ padding: 0 }}>
                        <table className={styles.table}>
                            <tbody>
                                {filteredCategories.map((cat) => (
                                    <tr key={cat.id}>
                                        <td className={styles.productCell}>
                                            {cat.imagen_url && (
                                                <img src={cat.imagen_url} alt={cat.nombre} className={styles.tableImg} />
                                            )}
                                            <span>{cat.nombre}</span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button type="button" onClick={() => handleOpenModal('category', cat)} style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', marginRight: '5px' }}>✎</button>
                                            <button type="button" onClick={() => handleDelete('category', cat.id)} style={{ background: 'transparent', border: 'none', color: 'var(--error)' }}>✕</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className={styles.column}>
                    <div className={styles.managementHeader}>
                        <h2>Productos</h2>
                        <button type="button" className="premium-button" onClick={() => handleOpenModal('cut')}>
                            <Plus size={14} />
                        </button>
                    </div>
                    <div className={styles.productFilters}>
                        <div className={styles.searchBar}>
                            <Search size={16} />
                            <input
                                type="text"
                                className="input-field"
                                placeholder="Buscar producto..."
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                            />
                        </div>
                        <div className={styles.productCategoryFilter}>
                            <label htmlFor="jefe-product-category-filter">Filtrar por categoría</label>
                            <select
                                id="jefe-product-category-filter"
                                className="input-field"
                                value={productCategoryFilter}
                                onChange={(e) => setProductCategoryFilter(e.target.value)}
                            >
                                <option value="">Todas las categorías</option>
                                {products.categories.map((cat) => (
                                    <option key={cat.id} value={String(cat.id)}>{cat.nombre}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className={`glass-card ${styles.sectionScroll} ${styles.catalogListScroll}`} style={{ padding: 0 }}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Nombre</th>
                                    <th>Categoría</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCuts.map((cut) => (
                                    <tr key={cut.id}>
                                        <td className={styles.productCell}>
                                            {cut.imagen_url && (
                                                <img src={cut.imagen_url} alt={cut.nombre} className={styles.tableImg} />
                                            )}
                                            <span>{cut.nombre}</span>
                                        </td>
                                        <td>{products.categories.find((c) => c.id === cut.categoria_id)?.nombre}</td>
                                        <td>
                                            <button type="button" onClick={() => handleOpenModal('cut', cut)} style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', marginRight: '5px' }}>✎</button>
                                            <button type="button" onClick={() => handleDelete('cut', cut.id)} style={{ background: 'transparent', border: 'none', color: 'var(--error)' }}>✕</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className={styles.column}>
                    <div className={styles.managementHeader}>
                        <h2>Cortes (Preparaciones)</h2>
                        <button type="button" className="premium-button" onClick={() => handleOpenModal('tipoCorte')}>
                            <Plus size={14} />
                        </button>
                    </div>
                    <div className={`glass-card ${styles.sectionScroll} ${styles.catalogListScroll}`} style={{ padding: 0 }}>
                        <table className={styles.table}>
                            <tbody>
                                {products.tiposCorte.map((tipo) => (
                                    <tr key={tipo.id}>
                                        <td className={styles.productCell}>
                                            <span>{tipo.nombre}</span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button type="button" onClick={() => handleOpenModal('tipoCorte', tipo)} style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', marginRight: '5px' }}>✎</button>
                                            <button type="button" onClick={() => handleDelete('tipoCorte', tipo.id)} style={{ background: 'transparent', border: 'none', color: 'var(--error)' }}>✕</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {showModal && (
                <div className={styles.modalOverlay} onClick={() => setShowModal(false)} role="presentation">
                    <div className={`${styles.modal} glass-card`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                        <h3>
                            {editItem ? 'Editar' : 'Crear'}{' '}
                            {modalType === 'category' ? 'Categoría' : modalType === 'cut' ? 'Producto' : 'Corte'}
                        </h3>
                        <form onSubmit={handleSubmit}>
                            {modalType === 'category' && (
                                <>
                                    <input placeholder="Nombre Categoría" className="input-field" value={formData.nombre || ''} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} required />
                                    <input placeholder="Imagen URL (opcional)" className="input-field" value={formData.imagen_url || ''} onChange={(e) => setFormData({ ...formData, imagen_url: e.target.value })} />
                                </>
                            )}
                            {modalType === 'cut' && (
                                <>
                                    <input placeholder="Nombre del Producto" className="input-field" value={formData.nombre || ''} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} required />
                                    <input placeholder="Imagen URL (opcional)" className="input-field" value={formData.imagen_url || ''} onChange={(e) => setFormData({ ...formData, imagen_url: e.target.value })} />
                                    <select
                                        className="input-field"
                                        value={formData.categoria_id || ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setFormData({ ...formData, categoria_id: val ? parseInt(val, 10) : '' });
                                        }}
                                        required
                                    >
                                        <option value="">Seleccionar Categoría</option>
                                        {products.categories.map((c) => (
                                            <option key={c.id} value={c.id}>{c.nombre}</option>
                                        ))}
                                    </select>
                                    <div style={{ marginTop: '10px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                            Cortes permitidos (opcional):
                                        </label>
                                        <div className={styles.tiposGrid}>
                                            {products.tiposCorte.map((tc) => (
                                                <label key={tc.id} className={styles.tipoCheck}>
                                                    <input
                                                        type="checkbox"
                                                        checked={(formData.tipos_corte_ids || []).includes(tc.id)}
                                                        onChange={(e) => {
                                                            const currentIds = formData.tipos_corte_ids || [];
                                                            if (e.target.checked) {
                                                                setFormData({ ...formData, tipos_corte_ids: [...currentIds, tc.id] });
                                                            } else {
                                                                setFormData({ ...formData, tipos_corte_ids: currentIds.filter((id) => id !== tc.id) });
                                                            }
                                                        }}
                                                    />
                                                    {tc.nombre}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                            {modalType === 'tipoCorte' && (
                                <input placeholder="Nombre del Corte (Ej: Mariposa)" className="input-field" value={formData.nombre || ''} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} required />
                            )}
                            <div className={styles.modalActions}>
                                <button type="button" onClick={() => setShowModal(false)} className="premium-button" style={{ background: 'var(--bg-card)' }}>Cancelar</button>
                                <button type="submit" className="premium-button">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
};

export default ProductCatalog;
