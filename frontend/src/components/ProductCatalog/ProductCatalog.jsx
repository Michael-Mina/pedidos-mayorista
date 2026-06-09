import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Plus, Search, Download, Upload } from 'lucide-react';
import api, { downloadCatalogExcel, downloadCatalogTemplate, importCatalogExcel } from '../../services/api';
import { useAppDialog } from '../../context/AppDialogContext';
import styles from './ProductCatalog.module.css';

const TIPO_LABELS = {
    categoria: 'Categoría',
    tipo_corte: 'Preparación',
    corte: 'Producto',
};

const MODAL_FROM_TIPO = {
    categoria: 'category',
    tipo_corte: 'tipoCorte',
    corte: 'cut',
};

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
    const [excelBusy, setExcelBusy] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [showImportSummary, setShowImportSummary] = useState(false);
    const fileInputRef = useRef(null);

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

    const handleOpenModal = (type, item = null, prefilled = null) => {
        setModalType(type);
        setEditItem(item);
        if (item) {
            if (type === 'cut') {
                setFormData({
                    ...item,
                    tipos_corte_ids: item.tipos_corte?.map((t) => t.id) || [],
                    es_empacado: Boolean(item.es_empacado),
                });
            } else {
                setFormData({ ...item });
            }
        } else if (prefilled) {
            setFormData(prefilled);
        } else {
            setFormData(type === 'cut' ? { es_empacado: false } : {});
        }
        setShowModal(true);
    };

    const findCategoryByName = useCallback((name) => {
        const key = (name || '').trim().toLowerCase();
        if (!key) return null;
        return products.categories.find((c) => c.nombre.trim().toLowerCase() === key) || null;
    }, [products.categories]);

    const buildPrefillFromEntry = useCallback((entry) => {
        if (entry.tipo === 'categoria') {
            return { nombre: entry.nombre, imagen_url: entry.imagen_url || '' };
        }
        if (entry.tipo === 'tipo_corte') {
            return { nombre: entry.nombre };
        }
        if (entry.tipo === 'corte') {
            const cat = findCategoryByName(entry.categoria);
            const prepIds = [];
            if (entry.preparaciones) {
                entry.preparaciones.split(',').forEach((raw) => {
                    const prepName = raw.trim().toLowerCase();
                    if (!prepName) return;
                    const tipo = products.tiposCorte.find((t) => t.nombre.trim().toLowerCase() === prepName);
                    if (tipo) prepIds.push(tipo.id);
                });
            }
            return {
                nombre: entry.nombre,
                imagen_url: entry.imagen_url || '',
                categoria_id: cat?.id || '',
                tipos_corte_ids: prepIds,
            };
        }
        return {};
    }, [findCategoryByName, products.tiposCorte]);

    const handleEditFromImport = (entry) => {
        const modalType = MODAL_FROM_TIPO[entry.tipo];
        if (!modalType) return;

        if (entry.existente_id) {
            let item = null;
            if (entry.tipo === 'categoria') {
                item = products.categories.find((c) => c.id === entry.existente_id);
            } else if (entry.tipo === 'tipo_corte') {
                item = products.tiposCorte.find((t) => t.id === entry.existente_id);
            } else if (entry.tipo === 'corte') {
                item = products.cuts.find((c) => c.id === entry.existente_id);
            }
            if (item) {
                handleOpenModal(modalType, item);
                return;
            }
        }

        handleOpenModal(modalType, null, buildPrefillFromEntry(entry));
    };

    const handleExportExcel = async () => {
        setExcelBusy(true);
        try {
            await downloadCatalogExcel();
            showToast('Catálogo descargado', 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo descargar el catálogo', 'error');
        } finally {
            setExcelBusy(false);
        }
    };

    const handleDownloadTemplate = async () => {
        setExcelBusy(true);
        try {
            await downloadCatalogTemplate();
            showToast('Plantilla descargada', 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo descargar la plantilla', 'error');
        } finally {
            setExcelBusy(false);
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;

        setExcelBusy(true);
        try {
            const result = await importCatalogExcel(file);
            setImportResult(result);
            setShowImportSummary(true);
            await fetchCatalog();
            const { totals } = result;
            showToast(
                `Carga finalizada: ${totals.creados} creados, ${totals.omitidos} omitidos, ${totals.errores} errores`,
                totals.errores > 0 ? 'warning' : 'success'
            );
        } catch (error) {
            showToast(error.message || 'No se pudo importar el catálogo', 'error');
        } finally {
            setExcelBusy(false);
        }
    };

    const handleRetryImport = () => {
        fileInputRef.current?.click();
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
                const esEmpacado = Boolean(formData.es_empacado);
                dataToSend = {
                    nombre: formData.nombre,
                    categoria_id: parseInt(formData.categoria_id, 10),
                    imagen_url: formData.imagen_url || null,
                    es_empacado: esEmpacado,
                    tipos_corte_ids: esEmpacado ? [] : (formData.tipos_corte_ids || []),
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
        <div className={styles.catalogPage}>
            <p className={styles.catalogIntro}>
                Catálogo de <strong>{sedeNombre || 'su sede'}</strong>. Los productos que configure aquí
                solo estarán disponibles para los mayoristas de esta sede.
            </p>

            <div className={styles.excelToolbar}>
                <button
                    type="button"
                    className="premium-button"
                    onClick={handleExportExcel}
                    disabled={excelBusy}
                >
                    <Download size={16} />
                    Descargar Excel
                </button>
                <button
                    type="button"
                    className="premium-button"
                    onClick={handleRetryImport}
                    disabled={excelBusy}
                >
                    <Upload size={16} />
                    Cargar catálogo
                </button>
                <button
                    type="button"
                    className={`premium-button ${styles.excelToolbarSecondary}`}
                    onClick={handleDownloadTemplate}
                    disabled={excelBusy}
                >
                    Plantilla
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xlsm"
                    className={styles.hiddenFileInput}
                    onChange={handleFileChange}
                />
            </div>

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

            {showImportSummary && importResult && (
                <div className={styles.modalOverlay} onClick={() => setShowImportSummary(false)} role="presentation">
                    <div
                        className={`${styles.importSummaryModal} glass-card`}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="import-summary-title"
                    >
                        <h3 id="import-summary-title">Resumen de carga del catálogo</h3>
                        <div className={styles.importTotals}>
                            <span className={styles.importOk}>
                                Creados: {importResult.totals?.creados ?? 0}
                            </span>
                            <span className={styles.importSkip}>
                                Omitidos: {importResult.totals?.omitidos ?? 0}
                            </span>
                            <span className={styles.importErr}>
                                Errores: {importResult.totals?.errores ?? 0}
                            </span>
                        </div>

                        {(importResult.created?.categorias?.length > 0
                            || importResult.created?.tipos_corte?.length > 0
                            || importResult.created?.cortes?.length > 0) && (
                            <section className={styles.importSection}>
                                <h4>Elementos cargados</h4>
                                {importResult.created.categorias?.length > 0 && (
                                    <ul className={styles.importList}>
                                        {importResult.created.categorias.map((item) => (
                                            <li key={`cat-${item.id}`}>
                                                <span className={styles.importBadge}>Categoría</span>
                                                {item.nombre}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {importResult.created.tipos_corte?.length > 0 && (
                                    <ul className={styles.importList}>
                                        {importResult.created.tipos_corte.map((item) => (
                                            <li key={`tipo-${item.id}`}>
                                                <span className={styles.importBadge}>Preparación</span>
                                                {item.nombre}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {importResult.created.cortes?.length > 0 && (
                                    <ul className={styles.importList}>
                                        {importResult.created.cortes.map((item) => (
                                            <li key={`corte-${item.id}`}>
                                                <span className={styles.importBadge}>Producto</span>
                                                {item.nombre}
                                                {item.categoria ? ` (${item.categoria})` : ''}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        )}

                        {importResult.skipped?.length > 0 && (
                            <section className={styles.importSection}>
                                <h4>No cargados (ya existían)</h4>
                                <ul className={styles.importList}>
                                    {importResult.skipped.map((entry, idx) => (
                                        <li key={`skip-${idx}`} className={styles.importRow}>
                                            <div className={styles.importRowInfo}>
                                                <span className={styles.importBadge}>{TIPO_LABELS[entry.tipo] || entry.tipo}</span>
                                                <strong>{entry.nombre}</strong>
                                                <span className={styles.importMotivo}>{entry.motivo}</span>
                                                {entry.fila ? <span className={styles.importFila}>Fila {entry.fila}</span> : null}
                                            </div>
                                            <button
                                                type="button"
                                                className={styles.importEditBtn}
                                                onClick={() => handleEditFromImport(entry)}
                                            >
                                                Editar
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {importResult.errors?.length > 0 && (
                            <section className={styles.importSection}>
                                <h4>Con errores</h4>
                                <ul className={styles.importList}>
                                    {importResult.errors.map((entry, idx) => (
                                        <li key={`err-${idx}`} className={styles.importRow}>
                                            <div className={styles.importRowInfo}>
                                                <span className={`${styles.importBadge} ${styles.importBadgeError}`}>
                                                    {TIPO_LABELS[entry.tipo] || entry.tipo}
                                                </span>
                                                <strong>{entry.nombre}</strong>
                                                <span className={styles.importMotivo}>{entry.motivo}</span>
                                                {entry.fila ? <span className={styles.importFila}>Fila {entry.fila}</span> : null}
                                            </div>
                                            <button
                                                type="button"
                                                className={styles.importEditBtn}
                                                onClick={() => handleEditFromImport(entry)}
                                            >
                                                Editar
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        <div className={styles.importActions}>
                            <button
                                type="button"
                                className="premium-button"
                                onClick={handleRetryImport}
                                disabled={excelBusy}
                            >
                                <Upload size={16} />
                                Volver a cargar
                            </button>
                            <button
                                type="button"
                                className={`premium-button ${styles.excelToolbarSecondary}`}
                                onClick={() => setShowImportSummary(false)}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showModal && (
                <div className={styles.modalOverlay} onClick={() => setShowModal(false)} role="presentation">
                    <div className={`${styles.modal} glass-card`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                        <h3>
                            {editItem ? 'Editar' : 'Crear'}{' '}
                            {modalType === 'category' ? 'Categoría' : modalType === 'cut' ? 'Producto' : 'Corte'}
                        </h3>
                        <form onSubmit={handleSubmit} className={styles.modalForm}>
                            {modalType === 'category' && (
                                <>
                                    <div className={styles.modalField}>
                                        <label htmlFor="cat-nombre">Nombre</label>
                                        <input id="cat-nombre" placeholder="Nombre categoría" className="input-field" value={formData.nombre || ''} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} required />
                                    </div>
                                    <div className={styles.modalField}>
                                        <label htmlFor="cat-img">Imagen URL (opcional)</label>
                                        <input id="cat-img" placeholder="https://..." className="input-field" value={formData.imagen_url || ''} onChange={(e) => setFormData({ ...formData, imagen_url: e.target.value })} />
                                    </div>
                                </>
                            )}
                            {modalType === 'cut' && (
                                <>
                                    <div className={styles.modalField}>
                                        <label htmlFor="cut-nombre">Nombre del producto</label>
                                        <input id="cut-nombre" placeholder="Ej: Salchichas, Queso..." className="input-field" value={formData.nombre || ''} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} required />
                                    </div>
                                    <div className={styles.modalField}>
                                        <label htmlFor="cut-img">Imagen URL (opcional)</label>
                                        <input id="cut-img" placeholder="https://..." className="input-field" value={formData.imagen_url || ''} onChange={(e) => setFormData({ ...formData, imagen_url: e.target.value })} />
                                    </div>
                                    <div className={styles.modalField}>
                                        <label htmlFor="cut-cat">Categoría</label>
                                        <select
                                            id="cut-cat"
                                            className="input-field"
                                            value={formData.categoria_id || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setFormData({ ...formData, categoria_id: val ? parseInt(val, 10) : '' });
                                            }}
                                            required
                                        >
                                            <option value="">Seleccionar categoría</option>
                                            {products.categories.map((c) => (
                                                <option key={c.id} value={c.id}>{c.nombre}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <label className={styles.empacadoToggle}>
                                        <input
                                            type="checkbox"
                                            checked={Boolean(formData.es_empacado)}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                es_empacado: e.target.checked,
                                                tipos_corte_ids: e.target.checked ? [] : (formData.tipos_corte_ids || []),
                                            })}
                                        />
                                        <span>
                                            <strong>Producto empacado</strong>
                                            <small>Sin corte ni porcionamiento — el pedido será por unidades (paquetes) y observaciones.</small>
                                        </span>
                                    </label>
                                    {!formData.es_empacado && (
                                        <div className={styles.modalField}>
                                            <label>Cortes / preparaciones permitidos (opcional)</label>
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
                                    )}
                                </>
                            )}
                            {modalType === 'tipoCorte' && (
                                <div className={styles.modalField}>
                                    <label htmlFor="tipo-nombre">Nombre del corte</label>
                                    <input id="tipo-nombre" placeholder="Ej: Mariposa" className="input-field" value={formData.nombre || ''} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} required />
                                </div>
                            )}
                            <div className={styles.modalActions}>
                                <button type="button" onClick={() => setShowModal(false)} className="premium-button" style={{ background: 'var(--bg-card)' }}>Cancelar</button>
                                <button type="submit" className="premium-button">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductCatalog;
