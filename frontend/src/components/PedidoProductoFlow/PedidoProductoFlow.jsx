import React from 'react';
import { Package, Search } from 'lucide-react';
import ClientePedidoSelector from '../ClientePedidoSelector/ClientePedidoSelector';

const PedidoProductoFlow = ({
    step,
    cortes,
    tiposCorte,
    selection,
    pedidoModo,
    modoCantidad,
    filteredCategories,
    filteredCortes,
    filteredTiposCorte,
    productSearch,
    setProductSearch,
    productSearchPlaceholder,
    showProductSearch,
    onCategoryClick,
    onCorteSelect,
    onSelectPedidoModo,
    onSelectTipoCorte,
    onSelectSubmodoPorciones,
    onSelectorBack,
    tempPorciones,
    setTempPorciones,
    tempGramosPorcion,
    setTempGramosPorcion,
    tempPesoTotal,
    setTempPesoTotal,
    tempObs,
    setTempObs,
    onSubmit,
    isEditing,
    pesoUnidad,
    styles,
    gridClassName,
    bodyClassName,
    headerTitle = 'Seleccionar productos',
}) => (
    <>
        <div className={styles.selectorHeader}>
            <h2 className={styles.colTitle}><Package size={20} /> {headerTitle}</h2>
            {showProductSearch && (
                <div className={styles.selectorSearch}>
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
        <div className={bodyClassName || styles.selectorBody}>
            {step === 1 && (
                <div className={gridClassName}>
                    {filteredCategories.map((cat) => (
                        <button key={cat.id} type="button" className={styles.card} onClick={() => onCategoryClick(cat)}>
                            {cat.imagen_url ? (
                                <img src={cat.imagen_url} alt={cat.nombre} className={styles.cardImg} />
                            ) : (
                                <span className={styles.cardIcon}>🥩</span>
                            )}
                            <h3>{cat.nombre}</h3>
                        </button>
                    ))}
                    {!filteredCategories.length && (
                        <p className={styles.emptyMsg}>No se encontraron categorías.</p>
                    )}
                </div>
            )}

            {step === 2 && (
                <div>
                    <button type="button" onClick={() => onSelectorBack(1)} className={styles.backBtn}>
                        ← Categorías
                    </button>
                    <div className={gridClassName}>
                        {filteredCortes.map((corte) => (
                            <button key={corte.id} type="button" className={styles.card} onClick={() => onCorteSelect(corte)}>
                                {corte.imagen_url ? (
                                    <img src={corte.imagen_url} alt={corte.nombre} className={styles.cardImg} />
                                ) : (
                                    <span className={styles.cardIcon}>🥓</span>
                                )}
                                <h3>{corte.nombre}</h3>
                            </button>
                        ))}
                    </div>
                    {!filteredCortes.length && (
                        <p className={styles.emptyMsg}>No se encontraron productos.</p>
                    )}
                </div>
            )}

            {step >= 3 && (
                <ClientePedidoSelector
                    step={step}
                    selection={selection}
                    pedidoModo={pedidoModo}
                    modoCantidad={modoCantidad}
                    tiposCorte={tiposCorte}
                    filteredTiposCorte={filteredTiposCorte}
                    onSelectPedidoModo={onSelectPedidoModo}
                    onSelectTipoCorte={onSelectTipoCorte}
                    onSelectSubmodoPorciones={onSelectSubmodoPorciones}
                    onBack={onSelectorBack}
                    tempPorciones={tempPorciones}
                    setTempPorciones={setTempPorciones}
                    tempGramosPorcion={tempGramosPorcion}
                    setTempGramosPorcion={setTempGramosPorcion}
                    tempQtyLb={tempPesoTotal}
                    setTempQtyLb={setTempPesoTotal}
                    tempObs={tempObs}
                    setTempObs={setTempObs}
                    onSubmit={onSubmit}
                    isEditing={isEditing}
                    pesoTotalUnidad={pesoUnidad}
                    styles={styles}
                    gridClassName={gridClassName}
                />
            )}
        </div>
    </>
);

export default PedidoProductoFlow;
