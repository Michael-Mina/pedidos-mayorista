import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import styles from './Login.module.css';
import { LogIn } from 'lucide-react';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login, user } = useAuth();
    const navigate = useNavigate();

    // Redirect if already logged in
    React.useEffect(() => {
        if (user) {
            navigate('/');
        }
    }, [user, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        try {
            await login(username, password);
            navigate('/');
        } catch (err) {
            setError(err.message || 'Credenciales inválidas. Pruebe los usuarios creados en la DB.');
        }
    };

    return (
        <div className={styles.loginContainer}>
            <div className={`${styles.loginCard} glass-card`}>
                <h1 className={styles.logo}>Caña<span>veral</span></h1>
                <p style={{ color: 'var(--text-muted)', marginBottom: '30px' }}>Sistema de Gestión de Pedidos</p>

                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup}>
                        <label>Usuario</label>
                        <input
                            type="text"
                            className="input-field"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Ingrese su usuario"
                            required
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label>Contraseña</label>
                        <input
                            type="password"
                            className="input-field"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>
                    {error && <p style={{ color: 'var(--error)', fontSize: '0.85rem', marginBottom: '20px' }}>{error}</p>}

                    <button type="submit" className="premium-button" style={{ width: '100%', marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <LogIn size={20} />
                        Ingresar
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;
