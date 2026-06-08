import React from 'react';
import { Minus, Plus } from 'lucide-react';

const PreparacionCantidadSteps = ({
    step,
    selection,
    modoCantidad,
    onModeSelect,
    onBackFromMode,
    onBackFromForm,
    tempPorciones,
    setTempPorciones,
    tempGramosPorcion,
    setTempGramosPorcion,
    tempQty,
    setTempQty,
    tempObs,
    setTempObs,
    onSubmit,
    styles,
    pesoUnidad = 'kg',
}) => {
    const enLibras = pesoUnidad === 'lb';
    const titulo = `${selection.corte?.nombre} — ${selection.tipoCorte?.nombre}`;

    const pesoPorcionLabel = enLibras ? 'Libras por porción' : 'Gramos por porción';
    const pesoTotalLabel = enLibras ? 'Libras totales' : 'Kilogramos totales';
    const pesoPorcionDefault = enLibras ? 0.25 : 100;
    const pesoPorcionStep = enLibras ? 0.05 : 10;
    const pesoPorcionMin = enLibras ? 0.05 : 1;
    const pesoTotalStep = enLibras ? 0.5 : 0.5;
    const pesoTotalMin = enLibras ? 0.5 : 0.1;
    const pesoTotalDefault = enLibras ? 1 : 1.0;

    const ajustarPesoPorcion = (delta) => {
        setTempGramosPorcion((p) => {
            const base = Number(p) || pesoPorcionDefault;
            const next = enLibras
                ? Math.round(Math.max(pesoPorcionMin, base + delta) * 100) / 100
                : Math.max(pesoPorcionMin, base + delta);
            return next;
        });
    };

    const ajustarPesoTotal = (delta) => {
        setTempQty((p) => {
            const base = parseFloat(p) || pesoTotalDefault;
            const next = enLibras
                ? Math.round(Math.max(pesoTotalMin, base + delta) * 100) / 100
                : Math.max(pesoTotalMin, base + delta);
            return next;
        });
    };

    if (step === 4) {
        return (
            <div className={styles.qtyForm}>
                <button type="button" onClick={onBackFromMode} className={styles.backBtn}>
                    ← Volver a Preparación
                </button>
                <h3>{titulo}</h3>
                <p className={styles.modeHint}>¿Cómo desea pedir?</p>
                <div className={styles.modeGrid}>
                    <button type="button" className={styles.modeCard} onClick={() => onModeSelect('porciones')}>
                        <span className={styles.modeCardIcon} aria-hidden>🔢</span>
                        <h4>Por porciones</h4>
                        <p>
                            {enLibras
                                ? 'Ej: 50 porciones de 0.25 lb c/u. El peso total no importa.'
                                : 'Ej: 50 porciones de 100 g c/u. El peso total no importa.'}
                        </p>
                    </button>
                    <button type="button" className={styles.modeCard} onClick={() => onModeSelect('kg')}>
                        <span className={styles.modeCardIcon} aria-hidden>⚖️</span>
                        <h4>{enLibras ? 'Por libras' : 'Por kilogramos'}</h4>
                        <p>
                            {enLibras
                                ? 'Ej: 20 lb en porciones de 0.25 lb. La cantidad de porciones no importa.'
                                : 'Ej: 10 kg en porciones de 100 g. La cantidad de porciones no importa.'}
                        </p>
                    </button>
                </div>
            </div>
        );
    }

    if (step === 5) {
        return (
            <div className={styles.qtyForm}>
                <button type="button" onClick={onBackFromForm} className={styles.backBtn}>
                    ← Volver
                </button>
                <h3>{titulo}</h3>
                <p className={styles.modeHint}>
                    {modoCantidad === 'porciones'
                        ? 'Indique cuántas porciones y el peso de cada una.'
                        : `Indique el peso total en ${enLibras ? 'libras' : 'kilogramos'} y el peso de cada porción.`}
                </p>

                <div className={styles.formGroup}>
                    <label>{pesoPorcionLabel}</label>
                    <div className={styles.qtyControl}>
                        <button
                            type="button"
                            className={styles.qtyBtn}
                            onClick={() => ajustarPesoPorcion(-pesoPorcionStep)}
                        >
                            <Minus size={16} />
                        </button>
                        <input
                            type="number"
                            step={pesoPorcionStep}
                            min={pesoPorcionMin}
                            className={`${styles.qtyInput} input-field`}
                            value={tempGramosPorcion}
                            onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (val > 0) setTempGramosPorcion(val);
                                else if (e.target.value === '') setTempGramosPorcion('');
                            }}
                            onBlur={() => {
                                if (!tempGramosPorcion || tempGramosPorcion <= 0) {
                                    setTempGramosPorcion(pesoPorcionDefault);
                                }
                            }}
                        />
                        <button
                            type="button"
                            className={styles.qtyBtn}
                            onClick={() => ajustarPesoPorcion(pesoPorcionStep)}
                        >
                            <Plus size={16} />
                        </button>
                    </div>
                </div>

                {modoCantidad === 'porciones' ? (
                    <div className={styles.formGroup}>
                        <label>Cantidad de porciones</label>
                        <div className={styles.qtyControl}>
                            <button
                                type="button"
                                className={styles.qtyBtn}
                                onClick={() => setTempPorciones((p) => Math.max(1, (parseInt(p, 10) || 1) - 1))}
                            >
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
                            <button
                                type="button"
                                className={styles.qtyBtn}
                                onClick={() => setTempPorciones((p) => (parseInt(p, 10) || 0) + 1)}
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className={styles.formGroup}>
                        <label>{pesoTotalLabel}</label>
                        <div className={styles.qtyControl}>
                            <button
                                type="button"
                                className={styles.qtyBtn}
                                onClick={() => ajustarPesoTotal(-pesoTotalStep)}
                            >
                                <Minus size={16} />
                            </button>
                            <input
                                type="number"
                                step={pesoTotalStep}
                                min={pesoTotalMin}
                                className={`${styles.qtyInput} input-field`}
                                value={tempQty}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (val > 0) setTempQty(val);
                                    else if (e.target.value === '') setTempQty('');
                                }}
                                onBlur={() => {
                                    if (!tempQty || tempQty <= 0) setTempQty(pesoTotalDefault);
                                }}
                            />
                            <button
                                type="button"
                                className={styles.qtyBtn}
                                onClick={() => ajustarPesoTotal(pesoTotalStep)}
                            >
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
                    <Plus size={18} /> Agregar al pedido
                </button>
            </div>
        );
    }

    return null;
};

export default PreparacionCantidadSteps;
