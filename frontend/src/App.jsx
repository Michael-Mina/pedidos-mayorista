import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppDialogProvider } from './context/AppDialogContext';
import Login from './pages/Login/Login';
import Mayorista from './pages/Mayorista/Mayorista';
import Sede from './pages/Sede/Sede';
import Admin from './pages/Admin/Admin';

import JefeCarnes from './pages/JefeCarnes/JefeCarnes';
import { homePathForUser, userHasPanel } from './utils/rolePanels';

const ProtectedRoute = ({ children, allowedPanels }) => {
  const { user, loading } = useAuth();

  if (loading) return <div>Cargando...</div>;
  if (!user) return <Navigate to="/login" />;
  if (allowedPanels && !userHasPanel(user, allowedPanels)) {
    return <Navigate to="/" />;
  }

  return children;
};

const HomeRedirect = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  return <Navigate to={homePathForUser(user)} replace />;
};

const App = () => {
  return (
    <AuthProvider>
      <AppDialogProvider>
        <Router>
        <div className="app-container">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={
              <ProtectedRoute allowedPanels={['admin']}>
                <Admin />
              </ProtectedRoute>
            } />
            <Route path="/mayorista" element={
              <ProtectedRoute allowedPanels={['mayorista']}>
                <Mayorista />
              </ProtectedRoute>
            } />
            <Route path="/sede" element={
              <ProtectedRoute allowedPanels={['sede']}>
                <Sede />
              </ProtectedRoute>
            } />
            <Route path="/jefe" element={
              <ProtectedRoute allowedPanels={['jefe']}>
                <JefeCarnes />
              </ProtectedRoute>
            } />
            <Route path="/" element={<HomeRedirect />} />
          </Routes>
        </div>
        </Router>
      </AppDialogProvider>
    </AuthProvider>
  );
};

export default App;
