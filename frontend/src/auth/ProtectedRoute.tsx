import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from './AuthContext';
import { UserRole } from '../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { isAuthenticated, role, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-brand rounded-full animate-spin"></div>
          <span className="text-xs text-slate-500">Verifying credentials...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-red-200 p-6 rounded-lg shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-md bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
              <ShieldAlert size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-navy">Access Restricted</h2>
              <p className="text-xs text-slate-500">Role authorization check failed</p>
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed mb-5">
            Your current role <span className="font-semibold text-red-700">{role}</span> is not
            authorized to access this module. Allowed roles: {allowedRoles.join(', ')}.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => window.history.back()}
              className="btn-secondary"
            >
              Return Previous
            </button>
            <a href="/dashboard" className="btn-primary">
              Go to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
