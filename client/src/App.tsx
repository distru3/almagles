import { useEffect } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Spinner from './components/Spinner';
import Home from './pages/Home';
import CategoryPage from './pages/CategoryPage';
import PostPage from './pages/PostPage';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import AdminDashboard from './pages/admin/AdminDashboard';
import { WritePage, SchedulePage } from './pages/write/WriterPages';
import AccessDenied from './pages/AccessDenied';
import NotFound from './pages/NotFound';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner full />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/access-denied" replace />;
  return <>{children}</>;
}

function RequireWriter({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner full />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'writer' || user.managedCategoryIds.length === 0) {
    return <Navigate to="/access-denied" replace />;
  }
  return <>{children}</>;
}

function RequireSchedulePage({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner full />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin' || !user.canManageSchedule) {
    return <Navigate to="/access-denied" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/category/:slug" element={<CategoryPage />} />
          <Route path="/post/:id" element={<PostPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/access-denied" element={<AccessDenied />} />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminDashboard />
              </RequireAdmin>
            }
          />
          <Route
            path="/write"
            element={
              <RequireWriter>
                <WritePage />
              </RequireWriter>
            }
          />
          <Route
            path="/manage/schedule"
            element={
              <RequireSchedulePage>
                <SchedulePage />
              </RequireSchedulePage>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}