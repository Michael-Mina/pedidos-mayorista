const fs = require('fs');

const path = 'c:\\Users\\ADMIN\\Documents\\proyectos cañaveral\\Mayorista\\frontend\\src\\pages\\JefeCarnes\\JefeCarnes.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add Icons
content = content.replace(
    'Package\n} from \'lucide-react\';',
    'Package,\n    Users,\n    UserPlus,\n    ToggleLeft,\n    ToggleRight\n} from \'lucide-react\';'
);

// 2. Add functions
const functionsToInject = `
    const fetchCarniceros = async () => {
        try {
            if (user && user.sede_id) {
                const response = await api.get(\`/users/carniceros/\${user.sede_id}\`);
                setCarniceros(response.data);
            }
        } catch (error) {
            console.error("Error fetching carniceros:", error);
        }
    };

    const toggleCarniceroAvailability = async (carniceroId, currentStatus) => {
        try {
            await api.put(\`/users/carniceros/\${carniceroId}/availability?is_available=\${!currentStatus}\`);
            fetchCarniceros();
        } catch (error) {
            console.error("Error toggling availability:", error);
            alert("Error al actualizar la disponibilidad.");
        }
    };

    const handleAddCarnicero = async (e) => {
        e.preventDefault();
        try {
            await api.post('/users/carniceros', {
                username: newCarnicero.numero_carnicero,
                role: 'carnicero',
                sede_id: user.sede_id,
                session_active: newCarnicero.is_available ? 1 : 0,
                nombre: newCarnicero.nombre,
                apellido: newCarnicero.apellido,
                numero_carnicero: newCarnicero.numero_carnicero,
                is_available: newCarnicero.is_available,
                password: newCarnicero.password || newCarnicero.numero_carnicero
            });
            setShowAddCarnicero(false);
            setNewCarnicero({ nombre: '', apellido: '', numero_carnicero: '', is_available: true, password: '' });
            fetchCarniceros();
            alert("Carnicero creado exitosamente.");
        } catch (error) {
            console.error("Error al crear carnicero:", error);
            alert("Error al crear el carnicero.");
        }
    };
`;
// Put it right before return(
content = content.replace('    return (', functionsToInject + '\n    return (');

// 3. Add to useEffect
content = content.replace(
    'fetchData();',
    'fetchData();\n            fetchCarniceros();'
);

// 4. Add Sidebar Nav Item
const navItem = `
                    <button
                        className={\`\${styles.navItem} \${activeTab === 'personal' ? styles.active : ''}\`}
                        onClick={() => setActiveTab('personal')}
                    >
                        <Users size={20} />
                        Personal
                    </button>
                    `;
content = content.replace(
    '<button\n                        className={`${styles.navItem} ${activeTab === \'history\'',
    navItem + '<button\n                        className={`${styles.navItem} ${activeTab === \'history\''
);

// 5. Add Personal View
const personalView = `
                    {activeTab === 'personal' && (
                        <div className={styles.personalView}>
                            <div className={styles.sectionHeader} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                                <h2>Gestión de Personal</h2>
                                <button className={styles.btnPrimary} style={{ padding: '8px 16px', background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => setShowAddCarnicero(true)}>
                                    <UserPlus size={18} />
                                    Añadir Carnicero
                                </button>
                            </div>

                            <table className={styles.mainTable}>
                                <thead>
                                    <tr>
                                        <th>Número</th>
                                        <th>Nombre</th>
                                        <th>Apellido</th>
                                        <th>Disponibilidad</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {carniceros.map(carnicero => (
                                        <tr key={carnicero.id} className={styles.orderRow} style={{cursor: 'default'}}>
                                            <td><strong>{carnicero.numero_carnicero || carnicero.username}</strong></td>
                                            <td>{carnicero.nombre || 'N/A'}</td>
                                            <td>{carnicero.apellido || 'N/A'}</td>
                                            <td>
                                                <button 
                                                    onClick={() => toggleCarniceroAvailability(carnicero.id, carnicero.is_available)}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', color: carnicero.is_available ? '#2ecc71' : '#e74c3c' }}
                                                >
                                                    {carnicero.is_available ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                                                    {carnicero.is_available ? 'Disponible' : 'No Disponible'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {carniceros.length === 0 && (
                                        <tr><td colSpan="4" style={{textAlign: 'center', padding: '2rem'}}>No hay carniceros registrados en esta sede.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
`;

content = content.replace(
    '{/* MODAL ORDER DETAILS */}',
    personalView + '\n                {/* MODAL ORDER DETAILS */}'
);

content = content.replace('{/* MODAL ORDER DETAILS */}', \`
                {/* MODAL ADD CARNICERO */}
                {showAddCarnicero && (
                    <div className={styles.modalOverlay} onClick={() => setShowAddCarnicero(false)}>
                        <div className={styles.modalContent} style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
                            <div className={styles.modalHeader}>
                                <h2 className={styles.modalTitle}><UserPlus size={24} /> Nuevo Carnicero</h2>
                                <button className={styles.closeIconBtn} onClick={() => setShowAddCarnicero(false)}><X size={24} /></button>
                            </div>
                            <form className={styles.modalBody} onSubmit={handleAddCarnicero}>
                                <div style={{ marginBottom: '15px' }}>
                                    <label style={{ display: 'block', marginBottom: '5px' }}>Nombre</label>
                                    <input type="text" required value={newCarnicero.nombre} onChange={e => setNewCarnicero({...newCarnicero, nombre: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }} />
                                </div>
                                <div style={{ marginBottom: '15px' }}>
                                    <label style={{ display: 'block', marginBottom: '5px' }}>Apellido</label>
                                    <input type="text" required value={newCarnicero.apellido} onChange={e => setNewCarnicero({...newCarnicero, apellido: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }} />
                                </div>
                                <div style={{ marginBottom: '15px' }}>
                                    <label style={{ display: 'block', marginBottom: '5px' }}>Número de Carnicero</label>
                                    <input type="text" required value={newCarnicero.numero_carnicero} onChange={e => setNewCarnicero({...newCarnicero, numero_carnicero: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }} />
                                </div>
                                <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <label style={{ display: 'block' }}>¿Está Disponible?</label>
                                    <input type="checkbox" checked={newCarnicero.is_available} onChange={e => setNewCarnicero({...newCarnicero, is_available: e.target.checked})} style={{ width: '20px', height: '20px' }} />
                                </div>
                                <button type="submit" style={{ width: '100%', padding: '10px', background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                                    Guardar Carnicero
                                </button>
                            </form>
                        </div>
                    </div>
                )}
                {/* MODAL ORDER DETAILS */}
\`);

fs.writeFileSync(path, content, 'utf8');
console.log('Modified JefeCarnes.jsx successfully');
