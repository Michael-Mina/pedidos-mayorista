import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, Ticket } from 'lucide-react';
import publicClientService from '../../services/api/publicClient';
import styles from './Clientes.module.css';

const ClientesTurno = () => {
    const { slug } = useParams();
    const [turno, setTurno] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleGenerate = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await publicClientService.createTurno(slug);
            setTurno(data);
        } catch (err) {
            setError(err.message || 'No se pudo generar el turno');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.page}>
            <Link to={`/clientes/${slug}`} className={styles.backLink}>
                <ArrowLeft size={18} /> Volver
            </Link>

            {!turno ? (
                <div className={`${styles.turnoIntro} glass-card`}>
                    <Ticket size={56} />
                    <h1>Sacar turno</h1>
                    <p>Presione el botón para obtener su número de atención</p>
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
            ) : (
                <div className={`${styles.turnoResult} glass-card`} id="ticket-print">
                    <p className={styles.turnoLabel}>Su turno es</p>
                    <div className={styles.turnoNumber}>{turno.numero}</div>
                    <p className={styles.turnoHint}>Espere a que llamen su número en pantalla</p>
                    <div className={styles.turnoActions}>
                        <button type="button" className="premium-button" onClick={() => window.print()}>
                            <Printer size={18} /> Imprimir
                        </button>
                        <button type="button" className={`premium-button ${styles.secondaryBtn}`} onClick={handleGenerate}>
                            Nuevo turno
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClientesTurno;
