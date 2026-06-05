import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import styles from './Admin.module.css';
import api, { downloadAdminBackupPart, downloadAdminReport } from '../../services/api';
import {
    LayoutDashboard, Users, MapPin, Package, LogOut,
    TrendingUp, BarChart3, Plus, RefreshCw, Search, Menu, X,
    HardDriveDownload, AlertCircle, CheckCircle2, Calendar, Filter, FileSpreadsheet, Shield, Trash2, Edit2, Ban, Check
} from 'lucide-react';
import { PANEL_LABELS } from '../../utils/rolePanels';
import { filterPanelUsers, normalizeRoleCode } from '../../utils/userListFilters';
import LoggedUserLabel from '../../components/LoggedUserLabel/LoggedUserLabel';

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

const DASHBOARD_PERIODS = [
    { value: 'all', label: 'Todo el tiempo' },
    { value: 'today', label: 'Hoy' },
    { value: 'last_7_days', label: 'Últimos 7 días' },
    { value: 'last_30_days', label: 'Últimos 30 días' },
    { value: 'this_month', label: 'Este mes' },
    { value: 'custom', label: 'Personalizado (desde / hasta)' },
];

const formatDateParam = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const getDashboardDateRange = (period, customFrom, customTo) => {
    if (period === 'custom') {
        if (!customFrom || !customTo) return { invalid: true };
        if (customFrom > customTo) return { invalid: true };
        return { date_from: customFrom, date_to: customTo };
    }
    if (period === 'all') return {};
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let start = new Date(end);
    switch (period) {
        case 'today':
            break;
        case 'last_7_days':
            start.setDate(start.getDate() - 6);
            break;
        case 'last_30_days':
            start.setDate(start.getDate() - 29);
            break;
        case 'this_month':
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        default:
            return {};
    }
    return { date_from: formatDateParam(start), date_to: formatDateParam(end) };
};

const buildDashboardStatsParams = (period, dateFrom, dateTo, compareMode, selectedSedes) => {
    const range = getDashboardDateRange(period, dateFrom, dateTo);
    if (range.invalid) return null;
    const params = { ...range };
    if (compareMode === 'specific' && selectedSedes.length > 0) {
        params.sede_ids = selectedSedes.map((id) => parseInt(id, 10));
    }
    return params;
};

const DEFAULT_DASHBOARD_FILTERS = {
    period: 'all',
    dateFrom: '',
    dateTo: '',
    compareMode: 'all',
    selectedSedes: [],
};

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

const BACKUP_DOWNLOAD_PARTS = [
    { id: 'schema', file: 'schema.sql', description: 'Estructura de tablas' },
    { id: 'data', file: 'data.sql', description: 'Datos de la aplicación' },
    { id: 'static', file: 'static.zip', description: 'Imágenes en el servidor' },
    { id: 'manifest', file: 'manifest.json', description: 'Metadatos del respaldo' },
];

const Admin = () => {
    const { user, logout } = useAuth();
    const isMaster = user?.role === 'master';
    const [activeTab, setActiveTab] = useState('dashboard');
    const [stats, setStats] = useState({ sedeOrders: [], topCuts: [], ordersByEstado: [] });
    const [dashboardCompareMode, setDashboardCompareMode] = useState('all');
    const [dashboardSelectedSedes, setDashboardSelectedSedes] = useState([]);
    const [dashboardPeriodFilter, setDashboardPeriodFilter] = useState('all');
    const [dashboardDateFrom, setDashboardDateFrom] = useState('');
    const [dashboardDateTo, setDashboardDateTo] = useState('');
    const [dashboardFilterError, setDashboardFilterError] = useState('');
    const [showDashboardFiltersModal, setShowDashboardFiltersModal] = useState(false);
    const [filterDraft, setFilterDraft] = useState({
        period: 'all',
        dateFrom: '',
        dateTo: '',
        compareMode: 'all',
        selectedSedes: [],
    });
    const [usersList, setUsersList] = useState([]);
    const [sedesList, setSedesList] = useState([]);
    const [products, setProducts] = useState({ categories: [], cuts: [], tiposCorte: [] });
    const [loading, setLoading] = useState(true);

    // UI State for Modals
    const [showModal, setShowModal] = useState(false);
    const [modalType, setModalType] = useState(null); // 'user', 'sede', 'category', 'cut', 'tipoCorte'
    const [editItem, setEditItem] = useState(null);
    const [formData, setFormData] = useState({});
    const [categorySearch, setCategorySearch] = useState('');
    const [productSearch, setProductSearch] = useState('');
    const [productCategoryFilter, setProductCategoryFilter] = useState('');
    const [userSearch, setUserSearch] = useState('');
    const [userRoleFilter, setUserRoleFilter] = useState('');
    const [userSedeFilter, setUserSedeFilter] = useState('');
    const [menuOpen, setMenuOpen] = useState(false);
    const [isNarrowLayout, setIsNarrowLayout] = useState(() => window.innerWidth <= 768);
    const [backupLoadingPart, setBackupLoadingPart] = useState(null);
    const [reportLoading, setReportLoading] = useState(false);
    const [backupStatus, setBackupStatus] = useState(null);
    const [assignableRoles, setAssignableRoles] = useState([]);
    const [rolesCatalog, setRolesCatalog] = useState([]);
    const [roleForm, setRoleForm] = useState({
        code: '',
        label: '',
        panel: 'mayorista',
        can_assign: true,
    });
    const [roleFormError, setRoleFormError] = useState('');
    const [showRoleEditModal, setShowRoleEditModal] = useState(false);
    const [editingRole, setEditingRole] = useState(null);
    const [roleEditForm, setRoleEditForm] = useState({
        label: '',
        panel: 'mayorista',
        can_assign: true,
        is_enabled: true,
    });
    const [roleEditError, setRoleEditError] = useState('');

    const navTabs = useMemo(() => {
        const tabs = [
            { id: 'dashboard', label: 'Panel de Control', icon: LayoutDashboard },
            { id: 'users', label: 'Usuarios', icon: Users },
            { id: 'products', label: 'Productos', icon: Package },
        ];
        if (isMaster) {
            tabs.splice(2, 0,
                { id: 'roles', label: 'Roles', icon: Shield },
                { id: 'sedes', label: 'Sedes', icon: MapPin },
            );
            tabs.push({ id: 'backup', label: 'Respaldo', icon: HardDriveDownload });
        }
        return tabs;
    }, [isMaster]);

    useEffect(() => {
        if (!isMaster && (activeTab === 'sedes' || activeTab === 'roles' || activeTab === 'backup')) {
            setActiveTab('dashboard');
        }
    }, [isMaster, activeTab]);

    const loadAssignableRoles = useCallback(async () => {
        try {
            const res = await api.get('/roles/assignable');
            setAssignableRoles(res.data || []);
        } catch (e) {
            console.error('Error loading assignable roles', e);
        }
    }, []);

    const loadRolesCatalog = useCallback(async () => {
        if (!isMaster) return;
        try {
            const res = await api.get('/master/roles');
            setRolesCatalog(res.data || []);
        } catch (e) {
            console.error('Error loading roles catalog', e);
        }
    }, [isMaster]);

    useEffect(() => {
        loadAssignableRoles();
    }, [loadAssignableRoles]);

    const roleLabelFor = useCallback(
        (code) => {
            const norm = normalizeRoleCode(code);
            const row = [...assignableRoles, ...rolesCatalog].find(
                (r) => normalizeRoleCode(r.code) === norm
            );
            return row ? row.label : code;
        },
        [assignableRoles, rolesCatalog]
    );

    const mayoristaRoleCodes = useMemo(
        () =>
            [...assignableRoles, ...rolesCatalog]
                .filter((r) => r.panel === 'mayorista')
                .map((r) => r.code),
        [assignableRoles, rolesCatalog]
    );

    const goToTab = (tabId) => {
        setActiveTab(tabId);
        setMenuOpen(false);
    };

    useEffect(() => {
        if (!menuOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [menuOpen]);

    useEffect(() => {
        const onResize = () => {
            setIsNarrowLayout(window.innerWidth <= 768);
            if (window.innerWidth > 1024) setMenuOpen(false);
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        fetchData();
    }, [activeTab, dashboardPeriodFilter, dashboardCompareMode, dashboardSelectedSedes, dashboardDateFrom, dashboardDateTo]);

    useEffect(() => {
        if (activeTab !== 'products') {
            setCategorySearch('');
            setProductSearch('');
            setProductCategoryFilter('');
        }
        if (activeTab !== 'users') {
            setUserSearch('');
            setUserRoleFilter('');
            setUserSedeFilter('');
        }
    }, [activeTab]);

    const fetchData = async () => {
        setLoading(true);
        try {
            if (activeTab === 'dashboard') {
                if (dashboardCompareMode === 'specific' && dashboardSelectedSedes.length === 0) {
                    setDashboardFilterError('Seleccione al menos una sede para comparar.');
                    const [resUsers, resSedes] = await Promise.all([
                        api.get('/users'),
                        api.get('/sedes'),
                    ]);
                    setUsersList(resUsers.data);
                    setSedesList(resSedes.data);
                    setStats({ sedeOrders: [], topCuts: [], ordersByEstado: [] });
                    setLoading(false);
                    return;
                }

                const statsParams = buildDashboardStatsParams(
                    dashboardPeriodFilter,
                    dashboardDateFrom,
                    dashboardDateTo,
                    dashboardCompareMode,
                    dashboardSelectedSedes
                );
                if (!statsParams) {
                    setDashboardFilterError('Indique fechas Desde y Hasta válidas (Desde ≤ Hasta).');
                    const [resUsers, resSedes] = await Promise.all([
                        api.get('/users'),
                        api.get('/sedes'),
                    ]);
                    setUsersList(resUsers.data);
                    setSedesList(resSedes.data);
                    setStats({ sedeOrders: [], topCuts: [], ordersByEstado: [] });
                    setLoading(false);
                    return;
                }

                setDashboardFilterError('');
                const requests = [
                    api.get('/stats/orders-by-sede', { params: statsParams }),
                    api.get('/stats/top-cuts', { params: statsParams }),
                    api.get('/users'),
                    api.get('/sedes'),
                ];
                const singleSedeId =
                    dashboardCompareMode === 'specific' && dashboardSelectedSedes.length === 1
                        ? dashboardSelectedSedes[0]
                        : null;
                if (singleSedeId) {
                    requests.push(
                        api.get('/stats/orders-by-estado', {
                            params: { ...statsParams, sede_id: singleSedeId },
                        })
                    );
                }
                const results = await Promise.all(requests);
                const [sedeStats, cutStats, resUsers, resSedes, estadoStats] = results;
                setStats({
                    sedeOrders: sedeStats.data,
                    topCuts: cutStats.data,
                    ordersByEstado: estadoStats?.data ?? [],
                });
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
                const [resCats, resCortes, resTipos] = await Promise.all([
                    api.get('/categorias'),
                    api.get('/cortes'),
                    api.get('/tipos-corte')
                ]);
                setProducts({ categories: resCats.data, cuts: resCortes.data, tiposCorte: resTipos.data });
            } else if (activeTab === 'backup' && isMaster) {
                const res = await api.get('/admin/backup/status');
                setBackupStatus(res.data);
            } else if (activeTab === 'roles' && isMaster) {
                await loadRolesCatalog();
            }
        } catch (error) {
            console.error("Error fetching admin data:", error);
        }
        setLoading(false);
    };

    const handleOpenModal = (type, item = null) => {
        setModalType(type);
        setEditItem(item);
        if (type === 'cut' && item) {
            setFormData({ ...item, tipos_corte_ids: item.tipos_corte?.map(t => t.id) || [] });
        } else if (type === 'user' && item) {
            setFormData({
                username: item.username,
                role: item.role,
                sede_id: item.sede_id != null ? String(item.sede_id) : '',
                password: '',
            });
        } else {
            setFormData(item || {});
        }
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            let endpoint = '';
            let dataToSend = {};

            if (modalType === 'user') {
                endpoint = '/users';
                const sedeId = parseInt(formData.sede_id, 10);
                if (!formData.username?.trim() || !formData.role || Number.isNaN(sedeId)) {
                    alert('Complete usuario, rol y sede.');
                    return;
                }
                dataToSend = {
                    username: formData.username.trim(),
                    role: formData.role,
                    sede_id: sedeId,
                };
                if (formData.password?.trim()) {
                    dataToSend.password = formData.password;
                }
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
                    imagen_url: formData.imagen_url || null,
                    tipos_corte_ids: formData.tipos_corte_ids || []
                };
            } else if (modalType === 'tipoCorte') {
                endpoint = '/tipos-corte';
                dataToSend = {
                    nombre: formData.nombre
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

    const handleDownloadBackupPart = async (part) => {
        setBackupLoadingPart(part);
        try {
            await downloadAdminBackupPart(part);
        } catch (error) {
            alert(error.message || 'Error al descargar el respaldo');
        } finally {
            setBackupLoadingPart(null);
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
            if (type === 'tipoCorte') endpoint = '/tipos-corte';

            await api.delete(`${endpoint}/${id}`);
            fetchData();
        } catch (error) {
            alert("Error al eliminar");
        }
    };

    const openDashboardFiltersModal = () => {
        setFilterDraft({
            period: dashboardPeriodFilter,
            dateFrom: dashboardDateFrom,
            dateTo: dashboardDateTo,
            compareMode: dashboardCompareMode,
            selectedSedes: [...dashboardSelectedSedes],
        });
        setShowDashboardFiltersModal(true);
    };

    const applyDashboardFilters = () => {
        setDashboardPeriodFilter(filterDraft.period);
        setDashboardDateFrom(filterDraft.dateFrom);
        setDashboardDateTo(filterDraft.dateTo);
        setDashboardCompareMode(filterDraft.compareMode);
        setDashboardSelectedSedes([...filterDraft.selectedSedes]);
        setDashboardFilterError('');
        setShowDashboardFiltersModal(false);
    };

    const clearDashboardFilters = () => {
        setFilterDraft({ ...DEFAULT_DASHBOARD_FILTERS });
        setDashboardPeriodFilter(DEFAULT_DASHBOARD_FILTERS.period);
        setDashboardDateFrom(DEFAULT_DASHBOARD_FILTERS.dateFrom);
        setDashboardDateTo(DEFAULT_DASHBOARD_FILTERS.dateTo);
        setDashboardCompareMode(DEFAULT_DASHBOARD_FILTERS.compareMode);
        setDashboardSelectedSedes([]);
        setDashboardFilterError('');
        setShowDashboardFiltersModal(false);
    };

    const toggleDraftSede = (sedeId) => {
        const id = String(sedeId);
        setFilterDraft((prev) => ({
            ...prev,
            selectedSedes: prev.selectedSedes.includes(id)
                ? prev.selectedSedes.filter((s) => s !== id)
                : [...prev.selectedSedes, id],
        }));
    };

    const selectAllDraftSedes = () => {
        setFilterDraft((prev) => ({
            ...prev,
            selectedSedes: sedesList.map((s) => String(s.id)),
        }));
    };

    const clearDraftSedes = () => {
        setFilterDraft((prev) => ({ ...prev, selectedSedes: [] }));
    };

    const selectedPeriod = DASHBOARD_PERIODS.find((p) => p.value === dashboardPeriodFilter);
    const selectedSedesInView = sedesList.filter((s) =>
        dashboardSelectedSedes.includes(String(s.id))
    );
    const isAllSedesCompare = dashboardCompareMode === 'all';
    const isSingleSedeView = dashboardCompareMode === 'specific' && dashboardSelectedSedes.length === 1;
    const isMultiSedeCompare = dashboardCompareMode === 'specific' && dashboardSelectedSedes.length > 1;
    const totalPedidos = stats.sedeOrders.reduce((a, b) => a + b.count, 0);
    const totalKg = stats.topCuts.reduce((a, b) => a + (b.total_kg || 0), 0);
    const handleCreateRole = async (e) => {
        e.preventDefault();
        setRoleFormError('');
        try {
            await api.post('/master/roles', roleForm);
            setRoleForm({ code: '', label: '', panel: 'mayorista', can_assign: true });
            await loadRolesCatalog();
            await loadAssignableRoles();
        } catch (err) {
            const detail = err.response?.data?.detail;
            setRoleFormError(typeof detail === 'string' ? detail : 'No se pudo crear el rol');
        }
    };

    const deleteRoleRequest = async (roleId, force = false) => {
        await api.delete(`/master/roles/${roleId}`, { params: force ? { force: true } : {} });
        await loadRolesCatalog();
        await loadAssignableRoles();
    };

    const handleDeleteRole = async (role) => {
        if (role.code === 'master') {
            alert('El rol master no se puede eliminar.');
            return;
        }
        if (!window.confirm(`¿Eliminar el rol "${role.label}" (${role.code})?`)) return;
        try {
            await deleteRoleRequest(role.id, false);
        } catch (err) {
            const detail = err.response?.data?.detail;
            const msg = typeof detail === 'string' ? detail : 'No se pudo eliminar el rol';
            const usersMatch = msg.match(/Hay (\d+) usuario\(s\)/);
            if (usersMatch) {
                const n = usersMatch[1];
                const isOps = role.code === 'carnicero' || role.code === 'sede_butcher';
                const extra = isOps
                    ? '\n\nSon carniceros o tablets de sede (no aparecen en Gestión de Usuarios).'
                    : '';
                if (window.confirm(
                    `Hay ${n} usuario(s) con este rol.${extra}\n\n¿Eliminar el rol y también esas ${n} cuenta(s)?`
                )) {
                    try {
                        await deleteRoleRequest(role.id, true);
                        return;
                    } catch (err2) {
                        const d2 = err2.response?.data?.detail;
                        alert(typeof d2 === 'string' ? d2 : 'No se pudo eliminar el rol');
                        return;
                    }
                }
            }
            alert(msg);
        }
    };

    const openEditRole = (role) => {
        setEditingRole(role);
        setRoleEditForm({
            label: role.label,
            panel: role.panel,
            can_assign: role.can_assign,
            is_enabled: role.is_enabled !== false,
        });
        setRoleEditError('');
        setShowRoleEditModal(true);
    };

    const handleSaveRoleEdit = async (e) => {
        e.preventDefault();
        if (!editingRole) return;
        setRoleEditError('');
        try {
            await api.put(`/master/roles/${editingRole.id}`, {
                label: roleEditForm.label.trim(),
                panel: roleEditForm.panel,
                can_assign: roleEditForm.can_assign,
                is_enabled: roleEditForm.is_enabled,
            });
            setShowRoleEditModal(false);
            setEditingRole(null);
            await loadRolesCatalog();
            await loadAssignableRoles();
        } catch (err) {
            const detail = err.response?.data?.detail;
            setRoleEditError(typeof detail === 'string' ? detail : 'No se pudo guardar el rol');
        }
    };

    const handleToggleRoleEnabled = async (role) => {
        if (role.code === 'master') {
            alert('El rol master no se puede deshabilitar.');
            return;
        }
        const enabled = role.is_enabled !== false;
        const action = enabled ? 'deshabilitar' : 'habilitar';
        if (!window.confirm(
            enabled
                ? `¿Deshabilitar "${role.label}"? No se podrá asignar a usuarios nuevos ni iniciar sesión con este rol.`
                : `¿Habilitar "${role.label}"?`
        )) return;
        try {
            await api.put(`/master/roles/${role.id}`, { is_enabled: !enabled });
            await loadRolesCatalog();
            await loadAssignableRoles();
        } catch (err) {
            const detail = err.response?.data?.detail;
            alert(typeof detail === 'string' ? detail : `No se pudo ${action} el rol`);
        }
    };

    const mayoristasEnVista = usersList.filter((u) => {
        if (!mayoristaRoleCodes.includes(u.role)) return false;
        if (isAllSedesCompare) return true;
        return dashboardSelectedSedes.includes(String(u.sede_id));
    });
    const ciudadesEnVista = isAllSedesCompare
        ? [...new Set(sedesList.map((s) => s.ciudad).filter(Boolean))]
        : [...new Set(selectedSedesInView.map((s) => s.ciudad).filter(Boolean))];

    const mainChartLabels = isSingleSedeView
        ? stats.ordersByEstado.map((s) => s.name)
        : stats.sedeOrders.map((s) => s.name);
    const mainChartCounts = isSingleSedeView
        ? stats.ordersByEstado.map((s) => s.count)
        : stats.sedeOrders.map((s) => s.count);

    const mainChartTitle = isSingleSedeView
        ? `PEDIDOS POR ESTADO — ${selectedSedesInView[0]?.nombre || 'Sede'}`
        : isMultiSedeCompare
            ? 'COMPARACIÓN ENTRE SEDES SELECCIONADAS'
            : 'PEDIDOS POR SEDE';

    const periodBadgeLabel =
        dashboardPeriodFilter === 'custom' && dashboardDateFrom && dashboardDateTo
            ? `${dashboardDateFrom} → ${dashboardDateTo}`
            : selectedPeriod && dashboardPeriodFilter !== 'all'
                ? selectedPeriod.label
                : null;

    const sedeBadgeLabel = isAllSedesCompare
        ? null
        : isSingleSedeView
            ? selectedSedesInView[0]?.nombre
            : `${dashboardSelectedSedes.length} sedes`;

    const buildReportDownloadParams = () => {
        if (dashboardCompareMode === 'specific' && dashboardSelectedSedes.length === 0) {
            return null;
        }
        const range = getDashboardDateRange(
            dashboardPeriodFilter,
            dashboardDateFrom,
            dashboardDateTo
        );
        if (range.invalid) return null;
        const params = {
            ...range,
            period_label: periodBadgeLabel || 'Todo el tiempo',
            sede_label: isAllSedesCompare
                ? 'Todas las sedes'
                : isSingleSedeView
                    ? selectedSedesInView[0]?.nombre || 'Sede'
                    : `${dashboardSelectedSedes.length} sedes seleccionadas`,
        };
        if (dashboardCompareMode === 'specific' && dashboardSelectedSedes.length > 0) {
            params.sede_ids = dashboardSelectedSedes.map((id) => parseInt(id, 10));
        }
        return params;
    };

    const handleDownloadReport = async () => {
        const params = buildReportDownloadParams();
        if (!params) {
            alert(dashboardFilterError || 'Configure filtros válidos antes de descargar el reporte.');
            return;
        }
        setReportLoading(true);
        try {
            await downloadAdminReport(params);
        } catch (error) {
            alert(error.message || 'Error al descargar el reporte');
        } finally {
            setReportLoading(false);
        }
    };

    const barData = {
        labels: mainChartLabels,
        datasets: [{
            label: isSingleSedeView ? 'Pedidos por estado' : 'Pedidos por sede',
            data: mainChartCounts,
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

    const filteredCategories = products.categories.filter((cat) =>
        cat.nombre.toLowerCase().includes(categorySearch.trim().toLowerCase())
    );

    const filteredCuts = products.cuts.filter((cut) => {
        if (productCategoryFilter && String(cut.categoria_id) !== productCategoryFilter) {
            return false;
        }
        const term = productSearch.trim().toLowerCase();
        if (!term) return true;
        return cut.nombre.toLowerCase().includes(term);
    });

    const rolesForUserFilter = useMemo(
        () => [...assignableRoles, ...rolesCatalog],
        [assignableRoles, rolesCatalog]
    );

    const panelUsers = useMemo(
        () => filterPanelUsers(usersList, rolesForUserFilter),
        [usersList, rolesForUserFilter]
    );

    const availableUserRoles = useMemo(() => {
        const byNorm = new Map();
        panelUsers.forEach((user) => {
            if (!user.role) return;
            const norm = normalizeRoleCode(user.role);
            if (!byNorm.has(norm)) byNorm.set(norm, user.role);
        });
        return [...byNorm.values()].sort((a, b) =>
            roleLabelFor(a).localeCompare(roleLabelFor(b), 'es')
        );
    }, [panelUsers, roleLabelFor]);

    const filteredUsers = panelUsers.filter((user) => {
        const term = userSearch.trim().toLowerCase();
        const sedeName = sedesList.find((sede) => sede.id === user.sede_id)?.nombre || '';
        const matchesSearch = !term ||
            user.username.toLowerCase().includes(term) ||
            user.role.toLowerCase().includes(term) ||
            roleLabelFor(user.role).toLowerCase().includes(term) ||
            sedeName.toLowerCase().includes(term) ||
            String(user.sede_id ?? '').toLowerCase().includes(term);
        const matchesRole = !userRoleFilter ||
            normalizeRoleCode(user.role) === normalizeRoleCode(userRoleFilter);
        const matchesSede = !userSedeFilter || String(user.sede_id) === userSedeFilter;

        return matchesSearch && matchesRole && matchesSede;
    });

    return (
        <div className={styles.adminContainer}>
            {/* Sidebar móvil + escritorio */}
            <header className={styles.mobileTopBar}>
                <button
                    type="button"
                    className={styles.menuToggle}
                    onClick={() => setMenuOpen((open) => !open)}
                    aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
                    aria-expanded={menuOpen}
                >
                    {menuOpen ? <X size={22} /> : <Menu size={22} />}
                </button>
                <div className={styles.mobileLogo}>Pedidos <span>Mayorista</span></div>
                <span className={styles.mobileTopSpacer} aria-hidden="true" />
            </header>

            {menuOpen && (
                <button
                    type="button"
                    className={styles.sidebarBackdrop}
                    onClick={() => setMenuOpen(false)}
                    aria-label="Cerrar menú"
                />
            )}

            <nav className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}>
                <div className={styles.sidebarLogo}>Pedidos <span>Mayorista</span></div>
                {navTabs.map(({ id, label, icon: Icon }) => (
                    <div
                        key={id}
                        className={`${styles.navItem} ${activeTab === id ? styles.activeNavItem : ''}`}
                        onClick={() => goToTab(id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && goToTab(id)}
                    >
                        <Icon size={20} /> {label}
                    </div>
                ))}

                <div className={styles.sidebarFooter}>
                    <LoggedUserLabel user={user} />
                    <div
                        className={`${styles.navItem} ${styles.navLogout}`}
                        onClick={() => { setMenuOpen(false); logout(); }}
                        role="button"
                        tabIndex={0}
                    >
                        <LogOut size={20} /> Cerrar Sesión
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className={styles.mainContent}>
                {activeTab === 'dashboard' && (
                    <div className={styles.dashboardWrapper}>
                        <div className={styles.topBanner}>
                            <div className={styles.topBannerLeft}>
                                <h1>RESUMEN DE OPERACIONES</h1>
                                <div className={styles.filterBadges}>
                                    {periodBadgeLabel && (
                                        <span className={styles.sedeFilterBadge}>{periodBadgeLabel}</span>
                                    )}
                                    {sedeBadgeLabel && (
                                        <span className={styles.sedeFilterBadge}>{sedeBadgeLabel}</span>
                                    )}
                                    {!periodBadgeLabel && !sedeBadgeLabel && (
                                        <span className={styles.sedeFilterBadgeMuted}>Sin filtros activos</span>
                                    )}
                                </div>
                                {dashboardFilterError && (
                                    <p className={styles.filterError} role="alert">{dashboardFilterError}</p>
                                )}
                            </div>
                            <div className={styles.topBannerActions}>
                                <button
                                    type="button"
                                    className={`premium-button ${styles.filtersOpenBtn}`}
                                    onClick={openDashboardFiltersModal}
                                >
                                    <Filter size={18} /> Filtros
                                </button>
                                <button
                                    type="button"
                                    className={`premium-button ${styles.reportBtn}`}
                                    onClick={handleDownloadReport}
                                    disabled={reportLoading || !!dashboardFilterError}
                                    title="Descargar reporte Excel con los filtros aplicados"
                                >
                                    <FileSpreadsheet size={18} />
                                    {reportLoading ? 'Generando…' : 'Excel'}
                                </button>
                                <button type="button" className="premium-button" onClick={fetchData} aria-label="Actualizar datos">
                                    <RefreshCw size={18} />
                                </button>
                            </div>
                        </div>

                        {showDashboardFiltersModal && (
                            <div
                                className={styles.modalOverlay}
                                onClick={() => setShowDashboardFiltersModal(false)}
                                role="presentation"
                            >
                                <div
                                    className={`${styles.modal} ${styles.filtersModal} glass-card`}
                                    onClick={(e) => e.stopPropagation()}
                                    role="dialog"
                                    aria-modal="true"
                                    aria-labelledby="dashboard-filters-title"
                                >
                                    <h3 id="dashboard-filters-title">Filtros del resumen</h3>

                                    <div className={styles.filtersModalBody}>
                                        <label className={styles.sedeFilterLabel}>
                                            <Calendar size={16} aria-hidden="true" />
                                            <span>Periodo</span>
                                            <select
                                                className={styles.sedeFilterSelect}
                                                value={filterDraft.period}
                                                onChange={(e) => setFilterDraft((p) => ({ ...p, period: e.target.value }))}
                                            >
                                                {DASHBOARD_PERIODS.map((period) => (
                                                    <option key={period.value} value={period.value}>
                                                        {period.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>

                                        {filterDraft.period === 'custom' && (
                                            <div className={styles.filterDateRow}>
                                                <label className={styles.sedeFilterLabel}>
                                                    <span>Desde</span>
                                                    <input
                                                        type="date"
                                                        className={styles.dateFilterInput}
                                                        value={filterDraft.dateFrom}
                                                        onChange={(e) => setFilterDraft((p) => ({ ...p, dateFrom: e.target.value }))}
                                                    />
                                                </label>
                                                <label className={styles.sedeFilterLabel}>
                                                    <span>Hasta</span>
                                                    <input
                                                        type="date"
                                                        className={styles.dateFilterInput}
                                                        value={filterDraft.dateTo}
                                                        onChange={(e) => setFilterDraft((p) => ({ ...p, dateTo: e.target.value }))}
                                                    />
                                                </label>
                                            </div>
                                        )}

                                        <label className={styles.sedeFilterLabel}>
                                            <MapPin size={16} aria-hidden="true" />
                                            <span>Comparar</span>
                                            <select
                                                className={styles.sedeFilterSelect}
                                                value={filterDraft.compareMode}
                                                onChange={(e) => {
                                                    const mode = e.target.value;
                                                    setFilterDraft((p) => ({
                                                        ...p,
                                                        compareMode: mode,
                                                        selectedSedes: mode === 'all' ? [] : p.selectedSedes,
                                                    }));
                                                }}
                                            >
                                                <option value="all">Todas las sedes</option>
                                                <option value="specific">Sedes específicas</option>
                                            </select>
                                        </label>

                                        {filterDraft.compareMode === 'specific' && (
                                            <div className={styles.sedeComparePanel}>
                                                <div className={styles.sedeCompareActions}>
                                                    <span className={styles.sedeCompareHint}>
                                                        Seleccione una o más sedes para comparar
                                                    </span>
                                                    <button type="button" className={styles.linkButton} onClick={selectAllDraftSedes}>
                                                        Todas
                                                    </button>
                                                    <button type="button" className={styles.linkButton} onClick={clearDraftSedes}>
                                                        Ninguna
                                                    </button>
                                                </div>
                                                <div className={styles.sedeCheckboxGrid}>
                                                    {sedesList.map((sede) => (
                                                        <label key={sede.id} className={styles.sedeCheckboxItem}>
                                                            <input
                                                                type="checkbox"
                                                                checked={filterDraft.selectedSedes.includes(String(sede.id))}
                                                                onChange={() => toggleDraftSede(sede.id)}
                                                            />
                                                            <span>{sede.nombre}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className={`${styles.modalActions} ${styles.filtersModalActions}`}>
                                        <button
                                            type="button"
                                            className={styles.linkButton}
                                            onClick={clearDashboardFilters}
                                        >
                                            Limpiar filtros
                                        </button>
                                        <div className={styles.filtersModalActionsRight}>
                                            <button
                                                type="button"
                                                className="premium-button"
                                                style={{ background: 'var(--bg-card)' }}
                                                onClick={() => setShowDashboardFiltersModal(false)}
                                            >
                                                Cancelar
                                            </button>
                                            <button type="button" className="premium-button" onClick={applyDashboardFilters}>
                                                Aplicar filtros
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className={styles.dashboardGrid}>
                            {/* Left Column - Small KPIs */}
                            <div className={styles.kpiColumn}>
                                <div className={`${styles.kpiCard} glass-card`}>
                                    <div className={styles.kpiInfo}>
                                        <span>PEDIDOS TOTALES</span>
                                        <h2>{totalPedidos}</h2>
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
                                        <h2>{totalPedidos > 0 ? (totalKg / totalPedidos).toFixed(1) : '0'} kg</h2>
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
                                    <h3>{mainChartTitle}</h3>
                                    <div className={styles.chartLegend}>
                                        <Bar
                                            data={{
                                                labels: mainChartLabels,
                                                datasets: [{
                                                    label: isSingleSedeView ? 'Pedidos por estado' : 'Pedidos por sede',
                                                    data: mainChartCounts,
                                                    backgroundColor: ['#2ecc71', '#3498db', '#f1c40f', '#e74c3c', '#9b59b6'],
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
                                    <span>MAYORISTAS {isAllSedesCompare ? 'ACTIVOS' : 'EN SELECCIÓN'}</span>
                                    <h2>{mayoristasEnVista.length}</h2>
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
                                    <span>{isAllSedesCompare ? 'CIUDADES CUBIERTAS' : 'CIUDADES EN SELECCIÓN'}</span>
                                    <h2>{ciudadesEnVista.length}</h2>
                                    {!isAllSedesCompare && ciudadesEnVista.length > 0 && (
                                        <p className={styles.kpiSubtext}>{ciudadesEnVista.join(', ')}</p>
                                    )}
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
                                <div className={styles.pieChartWrap}>
                                    <Pie
                                        data={pieData}
                                        options={{
                                            maintainAspectRatio: false,
                                            responsive: true,
                                            plugins: {
                                                legend: {
                                                    position: isNarrowLayout ? 'bottom' : 'right',
                                                    labels: { color: '#888', font: { size: 10 }, boxWidth: 12 },
                                                },
                                            },
                                        }}
                                    />
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
                        <div className={styles.userFilters}>
                            <div className={styles.searchBar}>
                                <Search size={16} />
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="Buscar por usuario, rol o sede..."
                                    value={userSearch}
                                    onChange={(e) => setUserSearch(e.target.value)}
                                />
                            </div>
                            <select
                                className="input-field"
                                value={userRoleFilter}
                                onChange={(e) => setUserRoleFilter(e.target.value)}
                            >
                                <option value="">Todos los roles</option>
                                {availableUserRoles.map((role) => (
                                    <option key={role} value={role}>{roleLabelFor(role)}</option>
                                ))}
                            </select>
                            <select
                                className="input-field"
                                value={userSedeFilter}
                                onChange={(e) => setUserSedeFilter(e.target.value)}
                            >
                                <option value="">Todas las sedes</option>
                                {sedesList.map((sede) => (
                                    <option key={sede.id} value={String(sede.id)}>{sede.nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div className={`glass-card ${styles.managementScroll}`} style={{ padding: '0px' }}>
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
                                    {filteredUsers.map(u => (
                                        <tr key={u.id}>
                                            <td>{u.username}</td>
                                            <td><span className={styles.badge}>{roleLabelFor(u.role)}</span></td>
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

                {activeTab === 'roles' && isMaster && (
                    <>
                        <div className={styles.managementHeader}>
                            <h1>Catálogo de roles</h1>
                        </div>
                        <p className={styles.rolesHint}>
                            Defina roles personalizados (ej. supervisor, mayorista regional). El <strong>panel</strong> define la pantalla al iniciar sesión.
                            Los carniceros y tablets de sede no se listan aquí: se gestionan en <strong>Jefe de carnes</strong> y al crear sedes.
                        </p>
                        <form className={`glass-card ${styles.roleCreateForm}`} onSubmit={handleCreateRole}>
                            <h2>Nuevo rol</h2>
                            {roleFormError && <p className={styles.filterError} role="alert">{roleFormError}</p>}
                            <div className={styles.roleFormGrid}>
                                <input
                                    className="input-field"
                                    placeholder="Código (ej. jefe_piso)"
                                    value={roleForm.code}
                                    onChange={(e) => setRoleForm({ ...roleForm, code: e.target.value })}
                                    required
                                />
                                <input
                                    className="input-field"
                                    placeholder="Nombre visible (ej. Jefe de piso)"
                                    value={roleForm.label}
                                    onChange={(e) => setRoleForm({ ...roleForm, label: e.target.value })}
                                    required
                                />
                                <select
                                    className="input-field"
                                    value={roleForm.panel}
                                    onChange={(e) => setRoleForm({ ...roleForm, panel: e.target.value })}
                                >
                                    {Object.entries(PANEL_LABELS).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                                <label className={styles.roleCheckLabel}>
                                    <input
                                        type="checkbox"
                                        checked={roleForm.can_assign}
                                        onChange={(e) => setRoleForm({ ...roleForm, can_assign: e.target.checked })}
                                    />
                                    Permitir asignar a usuarios nuevos
                                </label>
                            </div>
                            <button type="submit" className="premium-button">
                                <Plus size={18} /> Crear rol
                            </button>
                        </form>
                        <div className={`glass-card ${styles.managementScroll}`} style={{ padding: 0 }}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Código</th>
                                        <th>Nombre</th>
                                        <th>Panel</th>
                                        <th>Asignable</th>
                                        <th>Estado</th>
                                        <th>Sistema</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rolesCatalog.map((r) => {
                                        const isActive = r.is_enabled !== false;
                                        return (
                                        <tr key={r.id} className={!isActive ? styles.roleRowDisabled : ''}>
                                            <td><code>{r.code}</code></td>
                                            <td>{r.label}</td>
                                            <td>{PANEL_LABELS[r.panel] || r.panel}</td>
                                            <td>{r.can_assign ? 'Sí' : 'No'}</td>
                                            <td>
                                                <span className={isActive ? styles.roleStatusActive : styles.roleStatusDisabled}>
                                                    {isActive ? 'Activo' : 'Deshabilitado'}
                                                </span>
                                            </td>
                                            <td>{r.is_system ? 'Sí' : 'No'}</td>
                                            <td>
                                                <div className={styles.roleActions}>
                                                    <button
                                                        type="button"
                                                        className={styles.roleActionEdit}
                                                        onClick={() => openEditRole(r)}
                                                        title="Editar rol"
                                                    >
                                                        <Edit2 size={15} /> Editar
                                                    </button>
                                                    {r.code !== 'master' && (
                                                        <button
                                                            type="button"
                                                            className={isActive ? styles.roleActionDisable : styles.roleActionEnable}
                                                            onClick={() => handleToggleRoleEnabled(r)}
                                                            title={isActive ? 'Deshabilitar rol' : 'Habilitar rol'}
                                                        >
                                                            {isActive ? <Ban size={15} /> : <Check size={15} />}
                                                            {isActive ? 'Deshabilitar' : 'Habilitar'}
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        className={styles.roleActionDelete}
                                                        onClick={() => handleDeleteRole(r)}
                                                        disabled={r.code === 'master'}
                                                        title={r.code === 'master' ? 'El rol master no se elimina' : 'Eliminar rol'}
                                                    >
                                                        <Trash2 size={15} /> Eliminar
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {isMaster && activeTab === 'sedes' && (
                    <>
                        <div className={styles.managementHeader}>
                            <h1>Sedes / Sucursales</h1>
                            <button className="premium-button" onClick={() => handleOpenModal('sede')}><Plus size={18} /> Agregar Sede</button>
                        </div>
                        <div className={`glass-card ${styles.managementScroll}`} style={{ padding: '0px' }}>
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
                            <div className={styles.searchBar}>
                                <Search size={16} />
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="Buscar categoría..."
                                    value={categorySearch}
                                    onChange={(e) => setCategorySearch(e.target.value)}
                                />
                            </div>
                            <div className={`glass-card ${styles.sectionScroll}`} style={{ padding: '0px' }}>
                                <table className={styles.table}>
                                    <tbody>
                                        {filteredCategories.map(cat => (
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
                                <h2>Productos</h2>
                                <button className="premium-button" onClick={() => handleOpenModal('cut')}><Plus size={14} /></button>
                            </div>
                            <div className={styles.productFilters}>
                                <div className={styles.searchBar}>
                                    <Search size={16} />
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="Buscar producto..."
                                        value={productSearch}
                                        onChange={(e) => setProductSearch(e.target.value)}
                                    />
                                </div>
                                <div className={styles.productCategoryFilter}>
                                    <label htmlFor="product-category-filter">Filtrar por categoría</label>
                                    <select
                                        id="product-category-filter"
                                        className="input-field"
                                        value={productCategoryFilter}
                                        onChange={(e) => setProductCategoryFilter(e.target.value)}
                                    >
                                        <option value="">Todas las categorías</option>
                                        {products.categories.map((cat) => (
                                            <option key={cat.id} value={String(cat.id)}>{cat.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className={`glass-card ${styles.sectionScroll} ${styles.productsListScroll}`} style={{ padding: '0px' }}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Nombre</th>
                                            <th>Categoría</th>
                                            <th>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredCuts.map(cut => (
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
                        <div className={styles.column}>
                            <div className={styles.managementHeader}>
                                <h2>Cortes (Preparaciones)</h2>
                                <button className="premium-button" onClick={() => handleOpenModal('tipoCorte')}><Plus size={14} /></button>
                            </div>
                            <div className={`glass-card ${styles.sectionScroll}`} style={{ padding: '0px' }}>
                                <table className={styles.table}>
                                    <tbody>
                                        {products.tiposCorte && products.tiposCorte.map(tipo => (
                                            <tr key={tipo.id}>
                                                <td className={styles.productCell}>
                                                    <span>{tipo.nombre}</span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button onClick={() => handleOpenModal('tipoCorte', tipo)} style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', marginRight: '5px' }}>✎</button>
                                                    <button onClick={() => handleDelete('tipoCorte', tipo.id)} style={{ background: 'transparent', border: 'none', color: 'var(--error)' }}>✕</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {isMaster && activeTab === 'backup' && (
                    <div className={styles.backupWrapper}>
                        <div className={styles.topBanner}>
                            <h1>RESPALDO DE DATOS</h1>
                        </div>
                        <div className={`${styles.backupCard} glass-card`}>
                            <p className={styles.backupIntro}>
                                Descargue cada componente por separado o el archivo ZIP completo con
                                estructura, datos, imágenes estáticas y metadatos del respaldo.
                            </p>
                            <ul className={styles.backupPartList}>
                                {BACKUP_DOWNLOAD_PARTS.map(({ id, file, description }) => (
                                    <li key={id} className={styles.backupPartItem}>
                                        <div className={styles.backupPartInfo}>
                                            <strong><code>{file}</code></strong>
                                            <span>{description}</span>
                                        </div>
                                        <button
                                            type="button"
                                            className={styles.backupPartBtn}
                                            onClick={() => handleDownloadBackupPart(id)}
                                            disabled={
                                                Boolean(backupLoadingPart) ||
                                                !backupStatus?.backup_available
                                            }
                                        >
                                            <HardDriveDownload size={14} />
                                            {backupLoadingPart === id ? 'Generando…' : 'Descargar'}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {backupStatus && (
                                <div className={styles.backupStatusRow}>
                                    {backupStatus.backup_available ? (
                                        <>
                                            <CheckCircle2 size={18} className={styles.statusOk} />
                                            <span>
                                                Servidor listo · BD: {backupStatus.database}
                                                {backupStatus.backup_method === 'python' && (
                                                    <> · modo Python (sin pg_dump)</>
                                                )}
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <AlertCircle size={18} className={styles.statusError} />
                                            <span>
                                                No se puede conectar a la base de datos para generar el respaldo.
                                            </span>
                                        </>
                                    )}
                                </div>
                            )}
                            <button
                                type="button"
                                className="premium-button"
                                onClick={() => handleDownloadBackupPart('zip')}
                                disabled={
                                    Boolean(backupLoadingPart) ||
                                    !backupStatus?.backup_available
                                }
                            >
                                <HardDriveDownload size={18} />
                                {backupLoadingPart === 'zip'
                                    ? 'Generando respaldo…'
                                    : 'Descargar respaldo ZIP completo'}
                            </button>
                            <p className={styles.backupHint}>
                                La descarga puede tardar unos segundos según el tamaño de la base de datos.
                                Guarde el archivo en un lugar seguro fuera del servidor.
                            </p>
                        </div>
                    </div>
                )}
            </main>

            {showRoleEditModal && editingRole && (
                <div className={styles.modalOverlay} onClick={() => setShowRoleEditModal(false)}>
                    <div
                        className={`${styles.modal} glass-card`}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                    >
                        <h3>Editar rol — <code>{editingRole.code}</code></h3>
                        {roleEditError && <p className={styles.filterError} role="alert">{roleEditError}</p>}
                        <form onSubmit={handleSaveRoleEdit}>
                            <div className={styles.roleFormGrid}>
                                <input
                                    className="input-field"
                                    placeholder="Nombre visible"
                                    value={roleEditForm.label}
                                    onChange={(e) => setRoleEditForm({ ...roleEditForm, label: e.target.value })}
                                    required
                                />
                                <select
                                    className="input-field"
                                    value={roleEditForm.panel}
                                    onChange={(e) => setRoleEditForm({ ...roleEditForm, panel: e.target.value })}
                                    disabled={editingRole.code === 'master'}
                                >
                                    {Object.entries(PANEL_LABELS).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                                <label className={styles.roleCheckLabel}>
                                    <input
                                        type="checkbox"
                                        checked={roleEditForm.can_assign}
                                        onChange={(e) => setRoleEditForm({ ...roleEditForm, can_assign: e.target.checked })}
                                        disabled={editingRole.code === 'master'}
                                    />
                                    Permitir asignar a usuarios nuevos
                                </label>
                                <label className={styles.roleCheckLabel}>
                                    <input
                                        type="checkbox"
                                        checked={roleEditForm.is_enabled}
                                        onChange={(e) => setRoleEditForm({ ...roleEditForm, is_enabled: e.target.checked })}
                                        disabled={editingRole.code === 'master'}
                                    />
                                    Rol activo (puede iniciar sesión)
                                </label>
                            </div>
                            <div className={styles.modalActions}>
                                <button
                                    type="button"
                                    className="premium-button"
                                    style={{ background: 'var(--bg-card)' }}
                                    onClick={() => setShowRoleEditModal(false)}
                                >
                                    Cancelar
                                </button>
                                <button type="submit" className="premium-button">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal for CRUD */}
            {showModal && (
                <div className={styles.modalOverlay}>
                    <div className={`${styles.modal} glass-card`}>
                        <h3>{editItem ? 'Editar' : 'Crear'} {
                            modalType === 'user' ? 'Usuario' :
                                modalType === 'sede' ? 'Sede' :
                                    modalType === 'category' ? 'Categoría' :
                                        modalType === 'cut' ? 'Producto' :
                                            modalType === 'tipoCorte' ? 'Corte' : modalType
                        }</h3>
                        <form onSubmit={handleSubmit}>
                            {modalType === 'user' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <input placeholder="Nombre de usuario" className="input-field" value={formData.username || ''} onChange={e => setFormData({ ...formData, username: e.target.value })} required />
                                    <input
                                        placeholder={editItem ? 'Nueva contraseña (opcional)' : 'Contraseña'}
                                        type="password"
                                        className="input-field"
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                                        required={!editItem && formData.role !== 'carnicero'}
                                    />
                                    <select className="input-field" value={formData.role || ''} onChange={e => setFormData({ ...formData, role: e.target.value })} required>
                                        <option value="">Seleccionar Rol</option>
                                        {assignableRoles.map((r) => (
                                            <option key={r.code} value={r.code}>
                                                {r.label} — {PANEL_LABELS[r.panel] || r.panel}
                                            </option>
                                        ))}
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
                                    <input placeholder="Nombre del Producto" className="input-field" value={formData.nombre || ''} onChange={e => setFormData({ ...formData, nombre: e.target.value })} required />
                                    <input placeholder="Imagen URL (opcional)" className="input-field" value={formData.imagen_url || ''} onChange={e => setFormData({ ...formData, imagen_url: e.target.value })} />
                                    <select className="input-field" value={formData.categoria_id || ''} onChange={e => {
                                        const val = e.target.value;
                                        setFormData({ ...formData, categoria_id: val ? parseInt(val) : '' });
                                    }} required>
                                        <option value="">Seleccionar Categoría</option>
                                        {products.categories.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                    </select>
                                    <div style={{ marginTop: '10px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Cortes permitidos (opcional):</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', maxHeight: '150px', overflowY: 'auto', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                                            {products.tiposCorte.map(tc => (
                                                <label key={tc.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-light)', fontSize: '0.9rem', cursor: 'pointer' }}>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={(formData.tipos_corte_ids || []).includes(tc.id)}
                                                        onChange={(e) => {
                                                            const currentIds = formData.tipos_corte_ids || [];
                                                            if (e.target.checked) {
                                                                setFormData({...formData, tipos_corte_ids: [...currentIds, tc.id]});
                                                            } else {
                                                                setFormData({...formData, tipos_corte_ids: currentIds.filter(id => id !== tc.id)});
                                                            }
                                                        }}
                                                    />
                                                    {tc.nombre}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                            {modalType === 'tipoCorte' && (
                                <>
                                    <input placeholder="Nombre del Corte (Ej: Mariposa)" className="input-field" value={formData.nombre || ''} onChange={e => setFormData({ ...formData, nombre: e.target.value })} required />
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
