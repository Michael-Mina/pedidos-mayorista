import React from 'react';
import { Minus, Plus } from 'lucide-react';

const ClientePedidoSelector = ({
    step,
    selection,
    pedidoModo,
    modoCantidad,
    tiposCorte,
    filteredTiposCorte,
    onSelectPedidoModo,
    onSelectTipoCorte,
    onSelectSubmodoPorciones,
    onBack,
    tempPorciones,
    setTempPorciones,
    tempGramosPorcion,
    setTempGramosPorcion,
    tempQtyLb,
    setTempQtyLb,
    tempObs,
    setTempObs,
    onSubmit,
    isEditing = false,
    pesoTotalUnidad = 'lb',
    styles,
    gridClassName,
}) => {
    const corteNombre = selection.corte?.nombre ?? '';
    const pesoLabel = pesoTotalUnidad === 'kg' ? 'Kilogramos' : 'Libras';
    const pesoUnitShort = pesoTotalUnidad === 'kg' ? 'kg' : 'lb';
    const pesoPaso = pesoTotalUnidad === 'kg' ? 0.5 : 0.5;
    const pesoMin = pesoTotalUnidad === 'kg' ? 0.5 : 0.5;

    const ajustarPeso = (setter, delta, min, fallback) => {
        setter((p) => {
            const base = Number(p) || fallback;
            return Math.round(Math.max(min, base + delta) * 100) / 100;
        });
    };

    if (step === 3) {
        return (
            <div className={styles.qtyForm}>
                <button type="button" onClick={() => onBack(2)} className={styles.backBtn}>
                    ← Volver a partes
                </button>
                <h3>{corteNombre}</h3>
                <p className={styles.modeHint}>¿Cómo desea pedir este producto?</p>
                <div className={styles.modeGrid}>
                    <button type="button" className={styles.modeCard} onClick={() => onSelectPedidoModo('preparacion')}>
                        <span className={styles.modeCardIcon} aria-hidden>🔪</span>
                        <h4>Por preparación / tipo</h4>
                        <p>Elija delgado, grueso, etc. e indique el peso en {pesoUnitShort} con observaciones.</p>
                    </button>
                    <button type="button" className={styles.modeCard} onClick={() => onSelectPedidoModo('porciones')}>
                        <span className={styles.modeCardIcon} aria-hidden>🔢</span>
                        <h4>Por porciones</h4>
                        <p>Pida por cantidad de porciones (peso en gramos) o por {pesoUnitShort} totales.</p>
                    </button>
                </div>
            </div>
        );
    }

    if (step === 4 && pedidoModo === 'preparacion') {
        return (
            <div>
                <button type="button" onClick={() => onBack(3)} className={styles.backBtn}>← Volver</button>
                <h3 className={styles.stepSubtitle}>Tipo de preparación</h3>
                <div className={gridClassName}>
                    {filteredTiposCorte.map((tipo) => (
                        <button
                            key={tipo.id}
                            type="button"
                            className={styles.card}
                            onClick={() => onSelectTipoCorte(tipo)}
                        >
                            <span className={styles.cardIcon}>🔪</span>
                            <h3>{tipo.nombre}</h3>
                        </button>
                    ))}
                </div>
                {!filteredTiposCorte.length && (
                    <p className={styles.emptyMsg}>No se encontraron preparaciones.</p>
                )}
            </div>
        );
    }

    if (step === 4 && pedidoModo === 'porciones') {
        return (
            <div className={styles.qtyForm}>
                <button type="button" onClick={() => onBack(3)} className={styles.backBtn}>← Volver</button>
                <h3>{corteNombre}</h3>
                <p className={styles.modeHint}>¿Cómo desea pedir por porciones?</p>
                <div className={styles.modeGrid}>
                    <button type="button" className={styles.modeCard} onClick={() => onSelectSubmodoPorciones('porciones')}>
                        <span className={styles.modeCardIcon} aria-hidden>🔢</span>
                        <h4>Por cantidad de porciones</h4>
                        <p>Ej: 50 porciones de 100 g c/u. No importa el peso total.</p>
                    </button>
                    <button type="button" className={styles.modeCard} onClick={() => onSelectSubmodoPorciones('kg')}>
                        <span className={styles.modeCardIcon} aria-hidden>⚖️</span>
                        <h4>Por {pesoUnitShort} totales</h4>
                        <p>Ej: 10 {pesoUnitShort} en porciones de 100 g. No importa cuántas porciones salgan.</p>
                    </button>
                </div>
            </div>
        );
    }

    if (step === 5 && pedidoModo === 'empacado') {
        return (
            <div className={styles.qtyForm}>
                <button type="button" onClick={() => onBack(2)} className={styles.backBtn}>← Volver</button>
                <h3>{corteNombre}</h3>
                <p className={styles.modeHint}>Producto empacado — indique cuántas unidades necesita.</p>
                <div className={styles.formGroup}>
                    <label>Cantidad de unidades (paquetes)</label>
                    <div className={styles.qtyControl}>
                        <button type="button" className={styles.qtyBtn} onClick={() => setTempPorciones((p) => Math.max(1, (parseInt(p, 10) || 1) - 1))}>
                            <Minus size={16} />
                        </button>
                        <input
                            type="number"
                            step="1"
                            min="1"
                            className={`${styles.qtyInput} input-field`}
                            value={tempPorciones}
                            onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (val > 0) setTempPorciones(val);
                                else if (e.target.value === '') setTempPorciones('');
                            }}
                            onBlur={() => {
                                if (!tempPorciones || tempPorciones < 1) setTempPorciones(1);
                            }}
                        />
                        <button type="button" className={styles.qtyBtn} onClick={() => setTempPorciones((p) => (parseInt(p, 10) || 0) + 1)}>
                            <Plus size={16} />
                        </button>
                    </div>
                </div>
                <div className={styles.formGroup}>
                    <label>Observaciones</label>
                    <textarea
                        className="input-field"
                        rows="3"
                        placeholder="Ej: Marca preferida, fecha de vencimiento..."
                        value={tempObs}
                        onChange={(e) => setTempObs(e.target.value)}
                    />
                </div>
                <button type="button" className="premium-button" onClick={onSubmit}>
                    <Plus size={18} /> {isEditing ? 'Guardar cambios' : 'Agregar al pedido'}
                </button>
            </div>
        );
    }

    if (step === 5) {
        const titulo = pedidoModo === 'preparacion'
            ? `${corteNombre} — ${selection.tipoCorte?.nombre}`
            : corteNombre;

        return (
            <div className={styles.qtyForm}>
                <button type="button" onClick={() => onBack(4)} className={styles.backBtn}>← Volver</button>
                <h3>{titulo}</h3>
                <p className={styles.modeHint}>
                    {pedidoModo === 'preparacion' && `Indique el peso en ${pesoUnitShort} y observaciones.`}
                    {pedidoModo === 'porciones' && modoCantidad === 'porciones' && 'Indique cuántas porciones y el peso de cada una en gramos.'}
                    {pedidoModo === 'porciones' && modoCantidad === 'kg' && `Indique los ${pesoUnitShort} totales y el peso de cada porción en gramos.`}
                </p>

                {pedidoModo === 'porciones' && (
                    <div className={styles.formGroup}>
                        <label>Gramos por porción</label>
                        <div className={styles.qtyControl}>
                            <button type="button" className={styles.qtyBtn} onClick={() => setTempGramosPorcion((p) => Math.max(10, (Number(p) || 100) - 10))}>
                                <Minus size={16} />
                            </button>
                            <input
                                type="number"
                                step="10"
                                min="10"
                                className={`${styles.qtyInput} input-field`}
                                value={tempGramosPorcion}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (val > 0) setTempGramosPorcion(val);
                                    else if (e.target.value === '') setTempGramosPorcion('');
                                }}
                                onBlur={() => {
                                    if (!tempGramosPorcion || tempGramosPorcion <= 0) setTempGramosPorcion(100);
                                }}
                            />
                            <button type="button" className={styles.qtyBtn} onClick={() => setTempGramosPorcion((p) => (Number(p) || 0) + 10)}>
                                <Plus size={16} />
                            </button>
                        </div>
                    </div>
                )}

                {pedidoModo === 'porciones' && modoCantidad === 'porciones' && (
                    <div className={styles.formGroup}>
                        <label>Cantidad de porciones</label>
                        <div className={styles.qtyControl}>
                            <button type="button" className={styles.qtyBtn} onClick={() => setTempPorciones((p) => Math.max(1, (parseInt(p, 10) || 1) - 1))}>
                                <Minus size={16} />
                            </button>
                            <input
                                type="number"
                                step="1"
                                min="1"
                                className={`${styles.qtyInput} input-field`}
                                value={tempPorciones}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    if (val > 0) setTempPorciones(val);
                                    else if (e.target.value === '') setTempPorciones('');
                                }}
                                onBlur={() => {
                                    if (!tempPorciones || tempPorciones < 1) setTempPorciones(1);
                                }}
                            />
                            <button type="button" className={styles.qtyBtn} onClick={() => setTempPorciones((p) => (parseInt(p, 10) || 0) + 1)}>
                                <Plus size={16} />
                            </button>
                        </div>
                    </div>
                )}

                {(pedidoModo === 'preparacion' || (pedidoModo === 'porciones' && modoCantidad === 'kg')) && (
                    <div className={styles.formGroup}>
                        <label>{pesoLabel}</label>
                        <div className={styles.qtyControl}>
                            <button type="button" className={styles.qtyBtn} onClick={() => ajustarPeso(setTempQtyLb, -pesoPaso, pesoMin, 1)}>
                                <Minus size={16} />
                            </button>
                            <input
                                type="number"
                                step={pesoPaso}
                                min={pesoMin}
                                className={`${styles.qtyInput} input-field`}
                                value={tempQtyLb}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (val > 0) setTempQtyLb(val);
                                    else if (e.target.value === '') setTempQtyLb('');
                                }}
                                onBlur={() => {
                                    if (!tempQtyLb || tempQtyLb <= 0) setTempQtyLb(1);
                                }}
                            />
                            <button type="button" className={styles.qtyBtn} onClick={() => ajustarPeso(setTempQtyLb, pesoPaso, pesoMin, 1)}>
                                <Plus size={16} />
                            </button>
                        </div>
                    </div>
                )}

                <div className={styles.formGroup}>
                    <label>Observaciones</label>
                    <textarea
                        className="input-field"
                        rows="3"
                        placeholder="Ej: Sin grasa..."
                        value={tempObs}
                        onChange={(e) => setTempObs(e.target.value)}
                    />
                </div>
                <button type="button" className="premium-button" onClick={onSubmit}>
                    <Plus size={18} /> {isEditing ? 'Guardar cambios' : 'Agregar al pedido'}
                </button>
            </div>
        );
    }

    return null;
};

export default ClientePedidoSelector;
