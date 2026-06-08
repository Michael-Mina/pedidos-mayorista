import React, { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Ticket, ShoppingBag } from 'lucide-react';
import publicClientService from '../../services/api/publicClient';
import styles from './Clientes.module.css';

const ClientesHome = () => {
    const { slug } = useParams();
    const location = useLocation();
    const [sede, setSede] = useState(null);
    const [error, setError] = useState('');
    const [turnoMsg, setTurnoMsg] = useState(null);

    useEffect(() => {
        publicClientService.getSedeInfo(slug)
            .then(setSede)
            .catch((err) => setError(err.message || 'Sede no encontrada'));
    }, [slug]);

    useEffect(() => {
        const state = location.state;
        if (state?.turnoGenerado) {
            setTurnoMsg({
                numero: state.turnoGenerado,
                blocked: Boolean(state.ticketPopupBlocked),
            });
            window.history.replaceState({}, document.title);
            return;
        }
        try {
            const raw = sessionStorage.getItem(`turno_ticket_${slug}`);
            if (raw) {
                const parsed = JSON.parse(raw);
                setTurnoMsg({ numero: parsed.numero, blocked: true });
                sessionStorage.removeItem(`turno_ticket_${slug}`);
            }
        } catch {
            /* ignore */
        }
    }, [location.state, slug]);

    if (error) {
        return (
            <div className={styles.page}>
                <div className={`${styles.errorBox} glass-card`}>{error}</div>
            </div>
        );
    }

    if (!sede) {
        return <div className={styles.page}><p className={styles.loading}>Cargando…</p></div>;
    }

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <h1>{sede.nombre}</h1>
                <p>Seleccione una opción para continuar</p>
            </header>
            {turnoMsg && (
                <div className={`${styles.turnoSuccessBanner} glass-card`}>
                    <p>Su turno es <strong>{turnoMsg.numero}</strong></p>
                    {turnoMsg.blocked && (
                        <p className={styles.turnoSuccessHint}>
                            Permita ventanas emergentes para ver el ticket en otra pestaña.
                        </p>
                    )}
                </div>
            )}
            <div className={styles.optionGrid}>
                <Link to={`/clientes/${slug}/turno`} className={`${styles.optionCard} glass-card`}>
                    <Ticket size={48} />
                    <h2>Sacar turno</h2>
                    <p>Obtenga un número para ser atendido en mostrador</p>
                </Link>
                <Link to={`/clientes/${slug}/pedido`} className={`${styles.optionCard} glass-card`}>
                    <ShoppingBag size={48} />
                    <h2>Hacer pedido</h2>
                    <p>Arme su pedido y reciba avisos por SMS o WhatsApp</p>
                </Link>
            </div>
        </div>
    );
};

export default ClientesHome;
