/**
 * PublicOnlyRoute.tsx — Unauthenticated Route Guard
 * Redirects authenticated users to /dashboard.
 */

import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader2 } from 'lucide-react';

export const PublicOnlyRoute: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[--color-bg]">
        <Loader2 className="animate-spin text-[--color-green]" size={36} />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};

export default PublicOnlyRoute;
