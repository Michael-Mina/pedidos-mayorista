import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Monitor, ShoppingBag, Tv, LogOut, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { setSedeTabletAccess } from '../../utils/sedeTabletAccess';
import styles from './SedeHub.module.css';

const SedeHub = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [sede, setSede] = useState(null);
    const [error, setError] = useState('');
    const [showTabletModal, setShowTabletModal] = useState(false);
    const [tabletPassword, setTabletPassword] = useState('');
    const [tabletError, setTabletError] = useState('');
    const [verifying, setVerifying] = useState(false);

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

    const openTabletModal = () => {
        setTabletPassword('');
        setTabletError('');
        setShowTabletModal(true);
    };

    const closeTabletModal = () => {
        if (verifying) return;
        setShowTabletModal(false);
        setTabletPassword('');
        setTabletError('');
    };

    const handleTabletAccess = async (e) => {
        e.preventDefault();
        if (!tabletPassword.trim()) {
            setTabletError('Ingrese la contraseña de la sede');
            return;
        }
        setVerifying(true);
        setTabletError('');
        try {
            await api.post('/auth/verify-password', { password: tabletPassword });
            setSedeTabletAccess(user.id);
            setShowTabletModal(false);
            navigate('/sede/tablet');
        } catch (err) {
            const detail = err.response?.data?.detail;
            setTabletError(typeof detail === 'string' ? detail : 'Contraseña incorrecta');
        } finally {
            setVerifying(false);
        }
    };

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
                        <button
                            type="button"
                            className={`${styles.optionCard} glass-card`}
                            onClick={openTabletModal}
                        >
                            <Monitor size={48} />
                            <h2>Tablet sede</h2>
                            <p>Ver pedidos entrantes y asignar carniceros</p>
                        </button>

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

            {showTabletModal && (
                <div className={styles.modalOverlay} onClick={closeTabletModal} role="presentation">
                    <div
                        className={`${styles.modal} glass-card`}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="tablet-access-title"
                    >
                        <div className={styles.modalIcon}>
                            <Lock size={28} />
                        </div>
                        <h2 id="tablet-access-title">Acceso a tablet sede</h2>
                        <p>Ingrese la contraseña de la sede para administrar pedidos.</p>
                        <form onSubmit={handleTabletAccess}>
                            <label className={styles.modalLabel} htmlFor="tablet-password">
                                Contraseña
                            </label>
                            <input
                                id="tablet-password"
                                type="password"
                                className={`input-field ${styles.modalInput}`}
                                value={tabletPassword}
                                onChange={(e) => setTabletPassword(e.target.value)}
                                placeholder="Contraseña de la sede"
                                autoFocus
                                disabled={verifying}
                            />
                            {tabletError && <p className={styles.modalError}>{tabletError}</p>}
                            <div className={styles.modalActions}>
                                <button
                                    type="button"
                                    className={styles.modalCancelBtn}
                                    onClick={closeTabletModal}
                                    disabled={verifying}
                                >
                                    Cancelar
                                </button>
                                <button type="submit" className="premium-button" disabled={verifying}>
                                    {verifying ? 'Verificando…' : 'Ingresar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SedeHub;
