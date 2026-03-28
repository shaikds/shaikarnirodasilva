import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { NotificationProvider } from './context/NotificationContext';
import Layout from './components/Layout/Layout';
import Dashboard from './components/Dashboard/Dashboard';
import LeadList from './components/Leads/LeadList';
import KeywordManager from './components/Keywords/KeywordManager';
import NotificationPanel from './components/Notifications/NotificationPanel';

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <NotificationProvider>
            <Layout />
          </NotificationProvider>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="leads" element={<LeadList />} />
        <Route path="keywords" element={<KeywordManager />} />
        <Route path="notifications" element={<NotificationPanel />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
