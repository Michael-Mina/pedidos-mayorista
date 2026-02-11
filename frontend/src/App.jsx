import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login/Login';
import Mayorista from './pages/Mayorista/Mayorista';
import Carnicero from './pages/Carnicero/Carnicero';
import Admin from './pages/Admin/Admin';

import JefeCarnes from './pages/JefeCarnes/JefeCarnes';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) return <div>Cargando...</div>;
  if (!user) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" />;
  }

  return children;
};

const HomeRedirect = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;

  switch (user.role) {
    case 'admin': return <Navigate to="/admin" />;
    case 'mayorista': return <Navigate to="/mayorista" />;
    case 'jefe_carnes': return <Navigate to="/jefe" />;
    case 'sede_butcher': return <Navigate to="/carnicero" />;
    case 'carnicero': return <Navigate to="/carnicero" />;
    default: return <Navigate to="/login" />;
  }
};

const App = () => {
  return (
    <AuthProvider>
      <Router>
        <div className="app-container">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Admin />
              </ProtectedRoute>
            } />
            <Route path="/mayorista" element={
              <ProtectedRoute allowedRoles={['mayorista']}>
                <Mayorista />
              </ProtectedRoute>
            } />
            <Route path="/carnicero" element={
              <ProtectedRoute allowedRoles={['sede_butcher', 'carnicero']}>
                <Carnicero />
              </ProtectedRoute>
            } />
            <Route path="/jefe" element={
              <ProtectedRoute allowedRoles={['jefe_carnes']}>
                <JefeCarnes />
              </ProtectedRoute>
            } />
            <Route path="/" element={<HomeRedirect />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
};

export default App;
