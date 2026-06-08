import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ticket } from 'lucide-react';
import publicClientService from '../../services/api/publicClient';
import printTurnoTicket from '../../utils/turnoPrint';
import styles from './Clientes.module.css';

const ClientesTurno = () => {
    const { slug } = useParams();
    const navigate = useNavigate();
    const [sedeNombre, setSedeNombre] = useState('');
    const [display, setDisplay] = useState({
        actual: null,
        proximo_numero: 1,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const refreshDisplay = useCallback(async () => {
        try {
            const [info, turnoDisplay] = await Promise.all([
                publicClientService.getSedeInfo(slug),
                publicClientService.getTurnoDisplay(slug),
            ]);
            setSedeNombre(info.nombre || '');
            setDisplay(turnoDisplay);
        } catch {
            /* mantener último estado visible */
        }
    }, [slug]);

    useEffect(() => {
        refreshDisplay();
        const poll = setInterval(refreshDisplay, 10000);
        return () => clearInterval(poll);
    }, [refreshDisplay]);

    const handleGenerate = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await publicClientService.createTurno(slug);
            const printed = printTurnoTicket({
                numero: data.numero,
                sedeNombre,
            });
            if (!printed) {
                sessionStorage.setItem(
                    `turno_ticket_${slug}`,
                    JSON.stringify({ numero: data.numero, sedeNombre, at: Date.now() })
                );
            }
            navigate(`/clientes/${slug}`, {
                replace: true,
                state: {
                    turnoGenerado: data.numero,
                    ticketPopupBlocked: !printed,
                },
            });
        } catch (err) {
            setError(err.message || 'No se pudo generar el turno');
            setLoading(false);
        }
    };

    const turnoActual = display.actual?.numero ?? '—';
    const proximoTurno = display.proximo_numero ?? '—';

    return (
        <div className={styles.page}>
            <Link to={`/clientes/${slug}`} className={styles.backLink}>
                <ArrowLeft size={18} /> Volver
            </Link>

            <div className={`${styles.turnoIntro} glass-card`}>
                <Ticket size={56} />
                <h1>Sacar turno</h1>
                <p>Presione el botón para obtener su número de atención</p>

                <div className={styles.turnoStatusRow}>
                    <div className={styles.turnoStatusCard}>
                        <span className={styles.turnoStatusLabel}>Turno en atención</span>
                        <strong className={styles.turnoStatusValue}>{turnoActual}</strong>
                    </div>
                    <div className={styles.turnoStatusCard}>
                        <span className={styles.turnoStatusLabel}>Próximo turno a generar</span>
                        <strong className={`${styles.turnoStatusValue} ${styles.turnoStatusNext}`}>
                            {proximoTurno}
                        </strong>
                    </div>
                </div>

                {error && <p className={styles.errorText}>{error}</p>}
                <button
                    type="button"
                    className={`premium-button ${styles.bigButton}`}
                    onClick={handleGenerate}
                    disabled={loading}
                >
                    {loading ? 'Generando…' : 'Generar turno'}
                </button>
            </div>
        </div>
    );
};

export default ClientesTurno;
