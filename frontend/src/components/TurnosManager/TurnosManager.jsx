import React, { useCallback, useEffect, useState } from 'react';
import { Copy, PhoneCall, CheckCircle } from 'lucide-react';
import api from '../../services/api';
import { getApiBaseUrl } from '../../config/api';
import { socketService } from '../../services/api/socket';
import { useAppDialog } from '../../context/AppDialogContext';
import styles from './TurnosManager.module.css';

const TurnosManager = ({ sedeId, sedeSlug, sedeNombre }) => {
    const { showToast } = useAppDialog();
    const [turnos, setTurnos] = useState([]);
    const [display, setDisplay] = useState({ actual: null, proximos: [], ultimo_atendido: null });
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        if (!sedeId) return;
        try {
            const [listRes, sedeRes] = await Promise.all([
                api.get(`/sedes/${sedeId}/turnos`),
                sedeSlug
                    ? Promise.resolve({ data: { slug: sedeSlug } })
                    : api.get('/sedes').then((r) => ({
                        data: r.data.find((s) => s.id === sedeId) || {},
                    })),
            ]);
            setTurnos(Array.isArray(listRes.data) ? listRes.data : []);
            const slug = sedeRes.data?.slug || sedeSlug;
            if (slug) {
                const displayRes = await fetch(
                    `${getApiBaseUrl()}/public/sedes/${encodeURIComponent(slug)}/turnos/display`
                );
                if (displayRes.ok) {
                    setDisplay(await displayRes.json());
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [sedeId, sedeSlug]);

    useEffect(() => {
        refresh();
        if (sedeId) {
            socketService.connect(`sede_${sedeId}`);
            socketService.onTurnUpdate((payload) => setDisplay(payload));
        }
        return () => socketService.offTurnUpdate();
    }, [sedeId, refresh]);

    const llamarSiguiente = async () => {
        try {
            await api.put(`/turnos/sede/${sedeId}/siguiente`);
            await refresh();
            showToast('Turno llamado', 'success');
        } catch (err) {
            showToast(err.response?.data?.detail || 'No hay turnos en espera', 'warning');
        }
    };

    const atenderActual = async () => {
        if (!display.actual?.id) return;
        try {
            await api.put(`/turnos/${display.actual.id}/atender`);
            await refresh();
            showToast('Turno marcado como atendido', 'success');
        } catch (err) {
            showToast(err.response?.data?.detail || 'Error al atender turno', 'error');
        }
    };

    const copyTvLink = () => {
        const slug = sedeSlug;
        if (!slug) return;
        const url = `${window.location.origin}/turnos/${slug}`;
        navigator.clipboard.writeText(url).then(
            () => showToast('Link del TV copiado', 'success'),
            () => showToast(url, 'info')
        );
    };

    const esperando = turnos.filter((t) => t.estado === 'esperando');

    if (loading) return <p className={styles.loading}>Cargando turnos…</p>;

    return (
        <div className={styles.wrapper}>
            <div className={styles.toolbar}>
                <button type="button" className="premium-button" onClick={llamarSiguiente}>
                    <PhoneCall size={16} /> Llamar siguiente
                </button>
                <button type="button" className="premium-button" onClick={atenderActual} disabled={!display.actual}>
                    <CheckCircle size={16} /> Marcar atendido
                </button>
                {sedeSlug && (
                    <button type="button" className={`premium-button ${styles.secondaryBtn}`} onClick={copyTvLink}>
                        <Copy size={16} /> Copiar link TV
                    </button>
                )}
            </div>

            <div className={styles.displayRow}>
                <div className={`${styles.displayCard} glass-card`}>
                    <span className={styles.label}>En atención</span>
                    <strong className={styles.actualNum}>{display.actual?.numero ?? '—'}</strong>
                </div>
                <div className={`${styles.displayCard} glass-card`}>
                    <span className={styles.label}>En espera</span>
                    <strong className={styles.waitCount}>{esperando.length}</strong>
                </div>
            </div>

            <p className={styles.intro}>
                Cola de turnos de <strong>{sedeNombre || 'su sede'}</strong>. Pantalla TV:{' '}
                {sedeSlug ? `/turnos/${sedeSlug}` : '—'}
            </p>

            <div className={`glass-card ${styles.listCard}`}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Número</th>
                            <th>Estado</th>
                            <th>Hora</th>
                        </tr>
                    </thead>
                    <tbody>
                        {turnos.length === 0 ? (
                            <tr><td colSpan={3}>No hay turnos registrados hoy</td></tr>
                        ) : (
                            turnos.slice(0, 50).map((t) => (
                                <tr key={t.id}>
                                    <td><strong>{t.numero}</strong></td>
                                    <td>{t.estado.replace('_', ' ')}</td>
                                    <td>{new Date(t.created_at).toLocaleTimeString('es-CO')}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default TurnosManager;
