import React from 'react';
import { useAuth } from './AuthContext';
import { UserRole } from '../types';

interface RoleGuardProps {
  allowed: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ allowed, children, fallback = null }) => {
  const { role } = useAuth();

  if (!role || !allowed.includes(role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
