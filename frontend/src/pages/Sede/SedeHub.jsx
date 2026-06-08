import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Monitor, ShoppingBag, Tv, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import styles from './SedeHub.module.css';

const SedeHub = () => {
    const { user, logout } = useAuth();
    const [sede, setSede] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!user?.sede_id) {
            setError('Usuario sin sede asignada');
            return;
        }
        api.get('/sedes')
            .then((res) => {
                const found = res.data.find((s) => s.id === user.sede_id);
                if (found) setSede(found);
                else setError('Sede no encontrada');
            })
            .catch(() => setError('No se pudo cargar la sede'));
    }, [user?.sede_id]);

    const slug = sede?.slug;
    const publicPanelsReady = Boolean(slug);

    return (
        <div className={styles.page}>
            <header className={styles.topBar}>
                <div className={styles.brand}>
                    <Monitor size={22} />
                    <span>Pedidos <strong>Mayorista</strong></span>
                </div>
                <button type="button" onClick={logout} className={styles.logoutBtn} title="Cerrar sesión">
                    <LogOut size={20} />
                </button>
            </header>

            {error ? (
                <div className={`${styles.errorBox} glass-card`}>{error}</div>
            ) : !sede ? (
                <p className={styles.loading}>Cargando…</p>
            ) : (
                <>
                    <header className={styles.header}>
                        <h1>{sede.nombre}</h1>
                        <p>Seleccione el panel al que desea ingresar</p>
                    </header>

                    {!publicPanelsReady && (
                        <p className={styles.slugWarning}>
                            Configure el slug de la sede en administración para habilitar los paneles de clientes y TV.
                        </p>
                    )}

                    <div className={styles.optionGrid}>
                        <Link to="/sede/tablet" className={`${styles.optionCard} glass-card`}>
                            <Monitor size={48} />
                            <h2>Tablet sede</h2>
                            <p>Ver pedidos entrantes y asignar carniceros</p>
                        </Link>

                        {publicPanelsReady ? (
                            <Link to={`/clientes/${slug}`} className={`${styles.optionCard} glass-card`}>
                                <ShoppingBag size={48} />
                                <h2>Pedidos clientes</h2>
                                <p>Panel para que los clientes armen sus pedidos</p>
                            </Link>
                        ) : (
                            <div className={`${styles.optionCard} ${styles.optionCardDisabled} glass-card`}>
                                <ShoppingBag size={48} />
                                <h2>Pedidos clientes</h2>
                                <p>Requiere slug de sede configurado</p>
                            </div>
                        )}

                        {publicPanelsReady ? (
                            <Link to={`/turnos/${slug}`} className={`${styles.optionCard} glass-card`}>
                                <Tv size={48} />
                                <h2>TV turnos</h2>
                                <p>Pantalla de turnos en tiempo real</p>
                            </Link>
                        ) : (
                            <div className={`${styles.optionCard} ${styles.optionCardDisabled} glass-card`}>
                                <Tv size={48} />
                                <h2>TV turnos</h2>
                                <p>Requiere slug de sede configurado</p>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default SedeHub;
