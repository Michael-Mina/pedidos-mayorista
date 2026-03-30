import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import styles from './Admin.module.css';
import api from '../../services/api';
import {
    LayoutDashboard, Users, MapPin, Package, LogOut,
    TrendingUp, BarChart3, Plus, RefreshCw
} from 'lucide-react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    LineElement,
    PointElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
    Filler
} from 'chart.js';
import { Bar, Pie, Line } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    LineElement,
    PointElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
    Filler
);

const Admin = () => {
    const { logout } = useAuth();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [stats, setStats] = useState({ sedeOrders: [], topCuts: [] });
    const [usersList, setUsersList] = useState([]);
    const [sedesList, setSedesList] = useState([]);
    const [products, setProducts] = useState({ categories: [], cuts: [] });
    const [loading, setLoading] = useState(true);

    // UI State for Modals
    const [showModal, setShowModal] = useState(false);
    const [modalType, setModalType] = useState(null); // 'user', 'sede', 'category', 'cut'
    const [editItem, setEditItem] = useState(null);
    const [formData, setFormData] = useState({});

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const fetchData = async () => {
        setLoading(true);
        try {
            if (activeTab === 'dashboard') {
                const [sedeStats, cutStats, resUsers, resSedes] = await Promise.all([
                    api.get('/stats/orders-by-sede'),
                    api.get('/stats/top-cuts'),
                    api.get('/users'),
                    api.get('/sedes')
                ]);
                setStats({ sedeOrders: sedeStats.data, topCuts: cutStats.data });
                setUsersList(resUsers.data);
                setSedesList(resSedes.data);
            } else if (activeTab === 'users') {
                const [resUsers, resSedes] = await Promise.all([
                    api.get('/users'),
                    api.get('/sedes')
                ]);
                setUsersList(resUsers.data);
                setSedesList(resSedes.data);
            } else if (activeTab === 'sedes') {
                const res = await api.get('/sedes');
                setSedesList(res.data);
            } else if (activeTab === 'products') {
                const [resCats, resCortes] = await Promise.all([
                    api.get('/categorias'),
                    api.get('/cortes')
                ]);
                setProducts({ categories: resCats.data, cuts: resCortes.data });
            }
        } catch (error) {
            console.error("Error fetching admin data:", error);
        }
        setLoading(false);
    };

    const handleOpenModal = (type, item = null) => {
        setModalType(type);
        setEditItem(item);
        setFormData(item || {});
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            let endpoint = '';
            let dataToSend = {};

            if (modalType === 'user') {
                endpoint = '/users';
                dataToSend = {
                    username: formData.username,
                    role: formData.role,
                    sede_id: formData.sede_id
                };
            } else if (modalType === 'sede') {
                endpoint = '/sedes';
                dataToSend = {
                    id: formData.id,
                    nombre: formData.nombre,
                    password: formData.password || null
                };
            } else if (modalType === 'category') {
                endpoint = '/categorias';
                dataToSend = {
                    nombre: formData.nombre,
                    imagen_url: formData.imagen_url || null
                };
            } else if (modalType === 'cut') {
                endpoint = '/cortes';
                dataToSend = {
                    nombre: formData.nombre,
                    categoria_id: parseInt(formData.categoria_id),
                    imagen_url: formData.imagen_url || null
                };
            }

            if (editItem) {
                await api.put(`${endpoint}/${editItem.id}`, dataToSend);
            } else {
                if (modalType === 'user') {
                    // Use register for new users to handle password hashing
                    // Butchers don't necessarily need a password
                    const params = {};
                    if (formData.password) params.password = formData.password;
                    await api.post('/register', { ...dataToSend, password: formData.password || null }, { params });
                } else {
                    await api.post(endpoint, dataToSend);
                }
            }
            setShowModal(false);
            fetchData();
        } catch (error) {
            console.error("Error detailed:", error.response?.data);
            alert("Error al guardar: " + (error.response?.data?.detail?.[0]?.msg || error.response?.data?.detail || error.message));
        }
    };

    const handleDelete = async (type, id) => {
        if (!window.confirm("¿Está seguro de eliminar este elemento?")) return;
        try {
            let endpoint = '';
            if (type === 'user') endpoint = '/users';
            if (type === 'sede') endpoint = '/sedes';
            if (type === 'category') endpoint = '/categorias';
            if (type === 'cut') endpoint = '/cortes';

            await api.delete(`${endpoint}/${id}`);
            fetchData();
        } catch (error) {
            alert("Error al eliminar");
        }
    };

    const barData = {
        labels: stats.sedeOrders.map(s => s.name),
        datasets: [{
            label: 'Pedidos por Sede',
            data: stats.sedeOrders.map(s => s.count),
            backgroundColor: 'rgba(46, 204, 113, 0.5)',
            borderColor: '#2ecc71',
            borderWidth: 1
        }]
    };

    const pieData = {
        labels: stats.topCuts.map(c => c.name),
        datasets: [{
            data: stats.topCuts.map(c => c.total_kg),
            backgroundColor: [
                'rgba(46, 204, 113, 0.6)',
                'rgba(52, 152, 219, 0.6)',
                'rgba(155, 89, 182, 0.6)',
                'rgba(241, 196, 15, 0.6)',
                'rgba(231, 76, 60, 0.6)',
            ],
            borderWidth: 0
        }]
    };

    return (
        <div className={styles.adminContainer}>
            {/* Sidebar */}
            <nav className={styles.sidebar}>
                <div className={styles.sidebarLogo}>Caña<span>veral</span></div>
                <div
                    className={`${styles.navItem} ${activeTab === 'dashboard' ? styles.activeNavItem : ''}`}
                    onClick={() => setActiveTab('dashboard')}
                >
                    <LayoutDashboard size={20} /> Panel de Control
                </div>
                <div
                    className={`${styles.navItem} ${activeTab === 'users' ? styles.activeNavItem : ''}`}
                    onClick={() => setActiveTab('users')}
                >
                    <Users size={20} /> Usuarios
                </div>
                <div
                    className={`${styles.navItem} ${activeTab === 'sedes' ? styles.activeNavItem : ''}`}
                    onClick={() => setActiveTab('sedes')}
                >
                    <MapPin size={20} /> Sedes
                </div>
                <div
                    className={`${styles.navItem} ${activeTab === 'products' ? styles.activeNavItem : ''}`}
                    onClick={() => setActiveTab('products')}
                >
                    <Package size={20} /> Productos
                </div>

                <div className={styles.navItem} style={{ marginTop: 'auto', color: 'var(--error)' }} onClick={logout}>
                    <LogOut size={20} /> Cerrar Sesión
                </div>
            </nav>

            {/* Main Content */}
            <main className={styles.mainContent}>
                {activeTab === 'dashboard' && (
                    <div className={styles.dashboardWrapper}>
                        <div className={styles.topBanner}>
                            <h1>RESUMEN DE OPERACIONES</h1>
                            <button className="premium-button" onClick={fetchData}><RefreshCw size={18} /></button>
                        </div>

                        <div className={styles.dashboardGrid}>
                            {/* Left Column - Small KPIs */}
                            <div className={styles.kpiColumn}>
                                <div className={`${styles.kpiCard} glass-card`}>
                                    <div className={styles.kpiInfo}>
                                        <span>PEDIDOS TOTALES</span>
                                        <h2>{stats.sedeOrders.reduce((a, b) => a + b.count, 0)}</h2>
                                    </div>
                                    <div className={styles.miniChart}>
                                        <Line
                                            data={{
                                                labels: ['', '', '', '', '', ''],
                                                datasets: [{
                                                    data: [30, 45, 35, 60, 40, 55],
                                                    borderColor: '#2ecc71',
                                                    backgroundColor: 'rgba(46, 204, 113, 0.1)',
                                                    fill: true,
                                                    tension: 0.4,
                                                    pointRadius: 0
                                                }]
                                            }}
                                            options={{ plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } }, maintainAspectRatio: false }}
                                        />
                                    </div>
                                    <div className={styles.kpiFooter}>
                                        <span style={{ color: '#2ecc71' }}>+12% vs ayer</span>
                                    </div>
                                </div>

                                <div className={`${styles.kpiCard} glass-card`}>
                                    <div className={styles.kpiInfo}>
                                        <span>KG PROMEDIO / PEDIDO</span>
                                        <h2>{stats.topCuts.length > 0 ? (stats.topCuts.reduce((a, b) => a + b.total_kg, 0) / (stats.sedeOrders.reduce((a, b) => a + b.count, 0) || 1)).toFixed(1) : '0'} kg</h2>
                                    </div>
                                    <div className={styles.miniChart}>
                                        <Line
                                            data={{
                                                labels: ['', '', '', '', '', ''],
                                                datasets: [{
                                                    data: [20, 25, 22, 30, 28, 35],
                                                    borderColor: '#3498db',
                                                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                                                    fill: true,
                                                    tension: 0.4,
                                                    pointRadius: 0
                                                }]
                                            }}
                                            options={{ plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } }, maintainAspectRatio: false }}
                                        />
                                    </div>
                                    <div className={styles.kpiFooter}>
                                        <span style={{ color: '#e74c3c' }}>-5% vs semana anterior</span>
                                    </div>
                                </div>
                            </div>

                            {/* Main Trend Chart */}
                            <div className={`${styles.mainChartCard} glass-card`}>
                                <div className={styles.cardHeader}>
                                    <h3>TENDENCIA DE PEDIDOS POR SEDE</h3>
                                    <div className={styles.chartLegend}>
                                        <Bar
                                            data={{
                                                labels: stats.sedeOrders.map(s => s.name),
                                                datasets: [{
                                                    label: 'Pedidos',
                                                    data: stats.sedeOrders.map(s => s.count),
                                                    backgroundColor: ['#2ecc71', '#3498db', '#f1c40f', '#e74c3c'],
                                                    borderRadius: 5
                                                }]
                                            }}
                                            options={{
                                                plugins: { legend: { display: false } },
                                                scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } },
                                                maintainAspectRatio: false
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Bottom Row - More KPIs and Distribution */}
                            <div className={`${styles.smallCard} glass-card`}>
                                <div className={styles.kpiInfo}>
                                    <span>MAYORISTAS ACTIVOS</span>
                                    <h2>{usersList.filter(u => u.role === 'mayorista').length}</h2>
                                </div>
                                <div className={styles.miniChart}>
                                    <Line
                                        data={{
                                            labels: ['', '', '', '', '', ''],
                                            datasets: [{
                                                data: [5, 8, 7, 10, 9, 12],
                                                borderColor: '#f1c40f',
                                                backgroundColor: 'rgba(241, 196, 15, 0.1)',
                                                fill: true,
                                                tension: 0.4,
                                                pointRadius: 0
                                            }]
                                        }}
                                        options={{ plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } }, maintainAspectRatio: false }}
                                    />
                                </div>
                            </div>

                            <div className={`${styles.smallCard} glass-card`}>
                                <div className={styles.kpiInfo}>
                                    <span>CIUDADES CUBIERTAS</span>
                                    <h2>{[...new Set(sedesList.map(s => s.ciudad))].length}</h2>
                                </div>
                                <div className={styles.miniChart}>
                                    <Line
                                        data={{
                                            labels: ['', '', '', '', '', ''],
                                            datasets: [{
                                                data: [1, 2, 2, 3, 3, 4],
                                                borderColor: '#9b59b6',
                                                backgroundColor: 'rgba(155, 89, 182, 0.1)',
                                                fill: true,
                                                tension: 0.4,
                                                pointRadius: 0
                                            }]
                                        }}
                                        options={{ plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } }, maintainAspectRatio: false }}
                                    />
                                </div>
                            </div>

                            <div className={`${styles.pieCard} glass-card`}>
                                <h3>CORTES MÁS SOLICITADOS</h3>
                                <div style={{ height: '200px' }}>
                                    <Pie data={pieData} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#888', font: { size: 10 } } } } }} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'users' && (
                    <>
                        <div className={styles.managementHeader}>
                            <h1>Gestión de Usuarios</h1>
                            <button className="premium-button" onClick={() => handleOpenModal('user')}><Plus size={18} /> Nuevo Usuario</button>
                        </div>
                        <div className="glass-card" style={{ padding: '0px' }}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Usuario</th>
                                        <th>Rol</th>
                                        <th>Sede</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {usersList.map(u => (
                                        <tr key={u.id}>
                                            <td>{u.username}</td>
                                            <td><span className={styles.badge}>{u.role}</span></td>
                                            <td>{sedesList.find(s => s.id === u.sede_id)?.nombre || u.sede_id}</td>
                                            <td>
                                                <button onClick={() => handleOpenModal('user', u)} style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', marginRight: '10px' }}>Editar</button>
                                                <button onClick={() => handleDelete('user', u.id)} style={{ background: 'transparent', border: 'none', color: 'var(--error)' }}>Eliminar</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {activeTab === 'sedes' && (
                    <>
                        <div className={styles.managementHeader}>
                            <h1>Sedes / Sucursales</h1>
                            <button className="premium-button" onClick={() => handleOpenModal('sede')}><Plus size={18} /> Agregar Sede</button>
                        </div>
                        <div className="glass-card" style={{ padding: '0px' }}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Centro de Operación (C.O)</th>
                                        <th>Nombre</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sedesList.map(s => (
                                        <tr key={s.id}>
                                            <td>{s.id}</td>
                                            <td>{s.nombre}</td>
                                            <td>
                                                <button onClick={() => handleOpenModal('sede', s)} style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', marginRight: '10px' }}>Editar</button>
                                                <button onClick={() => handleDelete('sede', s.id)} style={{ background: 'transparent', border: 'none', color: 'var(--error)' }}>Borrar</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {activeTab === 'products' && (
                    <div className={styles.productsGrid}>
                        <div className={styles.column}>
                            <div className={styles.managementHeader}>
                                <h2>Categorías</h2>
                                <button className="premium-button" onClick={() => handleOpenModal('category')}><Plus size={14} /></button>
                            </div>
                            <div className="glass-card" style={{ padding: '0px' }}>
                                <table className={styles.table}>
                                    <tbody>
                                        {products.categories.map(cat => (
                                            <tr key={cat.id}>
                                                <td className={styles.productCell}>
                                                    {cat.imagen_url && <img src={cat.imagen_url} alt={cat.nombre} className={styles.tableImg} />}
                                                    <span>{cat.nombre}</span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button onClick={() => handleOpenModal('category', cat)} style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', marginRight: '5px' }}>✎</button>
                                                    <button onClick={() => handleDelete('category', cat.id)} style={{ background: 'transparent', border: 'none', color: 'var(--error)' }}>✕</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className={styles.column}>
                            <div className={styles.managementHeader}>
                                <h2>Cortes / Productos</h2>
                                <button className="premium-button" onClick={() => handleOpenModal('cut')}><Plus size={14} /></button>
                            </div>
                            <div className="glass-card" style={{ padding: '0px' }}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Nombre</th>
                                            <th>Categoría</th>
                                            <th>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {products.cuts.map(cut => (
                                            <tr key={cut.id}>
                                                <td className={styles.productCell}>
                                                    {cut.imagen_url && <img src={cut.imagen_url} alt={cut.nombre} className={styles.tableImg} />}
                                                    <span>{cut.nombre}</span>
                                                </td>
                                                <td>{products.categories.find(c => c.id === cut.categoria_id)?.nombre}</td>
                                                <td>
                                                    <button onClick={() => handleOpenModal('cut', cut)} style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', marginRight: '5px' }}>✎</button>
                                                    <button onClick={() => handleDelete('cut', cut.id)} style={{ background: 'transparent', border: 'none', color: 'var(--error)' }}>✕</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* Modal for CRUD */}
            {showModal && (
                <div className={styles.modalOverlay}>
                    <div className={`${styles.modal} glass-card`}>
                        <h3>{editItem ? 'Editar' : 'Crear'} {
                            modalType === 'user' ? 'Usuario' :
                                modalType === 'sede' ? 'Sede' :
                                    modalType === 'category' ? 'Categoría' :
                                        modalType === 'cut' ? 'Corte' : modalType
                        }</h3>
                        <form onSubmit={handleSubmit}>
                            {modalType === 'user' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <input placeholder="Nombre de usuario" className="input-field" value={formData.username || ''} onChange={e => setFormData({ ...formData, username: e.target.value })} required />
                                    {!editItem && formData.role !== 'carnicero' && (
                                        <input placeholder="Contraseña" type="password" className="input-field" onChange={e => setFormData({ ...formData, password: e.target.value })} required />
                                    )}
                                    <select className="input-field" value={formData.role || ''} onChange={e => setFormData({ ...formData, role: e.target.value })} required>
                                        <option value="">Seleccionar Rol</option>
                                        <option value="admin">Administrador</option>
                                        <option value="mayorista">Mayorista</option>
                                        <option value="jefe_carnes">Jefe de Carnes</option>
                                    </select>
                                    <select className="input-field" value={formData.sede_id || ''} onChange={e => setFormData({ ...formData, sede_id: e.target.value })} required>
                                        <option value="">Seleccionar Sede</option>
                                        {sedesList.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                                    </select>
                                </div>
                            )}
                            {modalType === 'sede' && (
                                <>
                                    <input type="text" placeholder="Centro de Operación (C.O)" className="input-field" value={formData.id || ''} onChange={e => setFormData({ ...formData, id: e.target.value })} disabled={!!editItem} required />
                                    <input placeholder="Nombre de la sede" className="input-field" value={formData.nombre || ''} onChange={e => setFormData({ ...formData, nombre: e.target.value })} required />
                                    <input placeholder={editItem ? "Nueva Contraseña (dejar vacío si no cambia)" : "Contraseña de acceso"} type="password" className="input-field" value={formData.password || ''} onChange={e => setFormData({ ...formData, password: e.target.value })} required={!editItem} />
                                </>
                            )}
                            {modalType === 'category' && (
                                <>
                                    <input placeholder="Nombre Categoría" className="input-field" value={formData.nombre || ''} onChange={e => setFormData({ ...formData, nombre: e.target.value })} required />
                                    <input placeholder="Imagen URL (opcional)" className="input-field" value={formData.imagen_url || ''} onChange={e => setFormData({ ...formData, imagen_url: e.target.value })} />
                                </>
                            )}
                            {modalType === 'cut' && (
                                <>
                                    <input placeholder="Nombre del Corte" className="input-field" value={formData.nombre || ''} onChange={e => setFormData({ ...formData, nombre: e.target.value })} required />
                                    <input placeholder="Imagen URL (opcional)" className="input-field" value={formData.imagen_url || ''} onChange={e => setFormData({ ...formData, imagen_url: e.target.value })} />
                                    <select className="input-field" value={formData.categoria_id || ''} onChange={e => {
                                        const val = e.target.value;
                                        setFormData({ ...formData, categoria_id: val ? parseInt(val) : '' });
                                    }} required>
                                        <option value="">Seleccionar Categoría</option>
                                        {products.categories.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                    </select>
                                </>
                            )}
                            <div className={styles.modalActions}>
                                <button type="button" onClick={() => setShowModal(false)} className="premium-button" style={{ background: 'var(--bg-card)' }}>Cancelar</button>
                                <button type="submit" className="premium-button">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Admin;
