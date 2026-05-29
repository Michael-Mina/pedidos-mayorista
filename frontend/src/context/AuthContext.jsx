import React, { createContext, useState, useContext, useEffect } from 'react';
import { getApiBaseUrl } from '../config/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
        setLoading(false);
    }, []);

    const login = async (username, password) => {
        const apiUrl = getApiBaseUrl();
        try {
            const response = await fetch(`${apiUrl}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            if (!response.ok) {
                let detail = 'Credenciales incorrectas';
                try {
                    const errorData = await response.json();
                    detail = errorData.detail || detail;
                } catch {
                    /* respuesta no JSON */
                }
                throw new Error(typeof detail === 'string' ? detail : 'Login failed');
            }

            const data = await response.json();
            const { access_token, user: userData } = data;

            localStorage.setItem('token', access_token);
            localStorage.setItem('user', JSON.stringify(userData));
            setUser(userData);
            return userData;
        } catch (error) {
            console.error('Login Error:', error);
            if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
                throw new Error(
                    `No se pudo conectar con el servidor (${apiUrl}). Compruebe que la API esté activa en Render.`
                );
            }
            throw error;
        }
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
    };

    const refreshUser = async () => {
        if (!user) return;
        try {
            const response = await fetch(`${getApiBaseUrl()}/users`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (response.ok) {
                const users = await response.json();
                const updatedUser = users.find(u => u.id === user.id);
                if (updatedUser) {
                    setUser(updatedUser);
                    localStorage.setItem('user', JSON.stringify(updatedUser));
                }
            }
        } catch (error) {
            console.error("Refresh User Error:", error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, refreshUser, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
