import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import publicClientService from '../../services/api/publicClient';
import { socketService } from '../../services/api/socket';
import styles from './PanelTurnos.module.css';

const PanelTurnosTV = () => {
    const { slug } = useParams();
    const [sede, setSede] = useState(null);
    const [display, setDisplay] = useState({ actual: null, proximos: [], ultimo_atendido: null });
    const [clock, setClock] = useState(() => new Date());

    const refresh = useCallback(async () => {
        try {
            const data = await publicClientService.getTurnoDisplay(slug);
            setDisplay(data);
        } catch {
            /* polling fallback silently */
        }
    }, [slug]);

    useEffect(() => {
        publicClientService.getSedeInfo(slug).then((info) => {
            setSede(info);
            socketService.connect(`sede_${info.id}`);
        }).catch(() => {});
    }, [slug]);

    useEffect(() => {
        refresh();
        const poll = setInterval(refresh, 15000);
        socketService.onTurnUpdate((payload) => setDisplay(payload));
        return () => {
            clearInterval(poll);
            socketService.offTurnUpdate();
        };
    }, [refresh]);

    useEffect(() => {
        const id = setInterval(() => setClock(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    return (
        <div className={styles.tvPage}>
            <header className={styles.tvHeader}>
                <div>
                    <h1>{sede?.nombre || 'Turnos'}</h1>
                    <p>Atención al cliente</p>
                </div>
                <time className={styles.tvClock}>
                    {clock.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                </time>
            </header>

            <main className={styles.tvMain}>
                <section className={styles.nowServing}>
                    <span className={styles.nowLabel}>Turno en atención</span>
                    <div className={styles.nowNumber}>
                        {display.actual?.numero ?? '—'}
                    </div>
                </section>

                <section className={styles.nextSection}>
                    <h2>Próximos turnos</h2>
                    <div className={styles.nextGrid}>
                        {(display.proximos || []).length === 0 ? (
                            <p className={styles.emptyNext}>Sin turnos en espera</p>
                        ) : (
                            display.proximos.map((t) => (
                                <div key={t.id} className={styles.nextCard}>{t.numero}</div>
                            ))
                        )}
                    </div>
                </section>
            </main>

            {display.ultimo_atendido && (
                <footer className={styles.tvFooter}>
                    Último atendido: <strong>{display.ultimo_atendido.numero}</strong>
                </footer>
            )}
        </div>
    );
};

export default PanelTurnosTV;
