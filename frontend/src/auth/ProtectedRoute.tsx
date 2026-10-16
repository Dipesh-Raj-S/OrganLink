import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-700 border-t-cyan-400 rounded-full animate-spin"></div>
          <span className="text-xs font-mono uppercase tracking-widest text-slate-400">Verifying workstation credentials...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-red-900/60 p-6 rounded-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded bg-red-950/80 border border-red-700/60 flex items-center justify-center text-red-400 font-mono text-sm font-bold">
              403
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Access Restricted</h2>
              <p className="text-xs text-slate-400">Role authorization check failed</p>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed mb-5">
            Your current role <span className="font-mono text-red-300 font-semibold">{role}</span> is not authorized to access this module. Allowed roles: {allowedRoles.join(', ')}.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => window.history.back()}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors"
            >
              Return Previous
            </button>
            <a
              href="/dashboard"
              className="px-3 py-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded transition-colors"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
