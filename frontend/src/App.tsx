import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { DashboardLayout } from './layouts/DashboardLayout';

import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Donors } from './pages/Donors';
import { Recipients } from './pages/Recipients';
import { Hospitals } from './pages/Hospitals';
import { Matching } from './pages/Matching';
import { MatchRequests } from './pages/MatchRequests';
import { Allocations } from './pages/Allocations';
import { GraphView } from './pages/GraphView';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsConditions } from './pages/TermsConditions';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Auth Gateway */}
          <Route path="/login" element={<Login />} />

          {/* Protected Clinical Workstation Routes */}
          <Route
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />

            {/* Donors: ADMIN, COORDINATOR, DOCTOR */}
            <Route
              path="/donors"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'COORDINATOR', 'DOCTOR']}>
                  <Donors />
                </ProtectedRoute>
              }
            />

            {/* Recipients: ADMIN, COORDINATOR, DOCTOR */}
            <Route
              path="/recipients"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'COORDINATOR', 'DOCTOR']}>
                  <Recipients />
                </ProtectedRoute>
              }
            />

            {/* Hospitals: ADMIN only as specified */}
            <Route
              path="/hospitals"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <Hospitals />
                </ProtectedRoute>
              }
            />

            {/* Matching Page: Primary Feature */}
            <Route
              path="/matching/:recipientId?"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'COORDINATOR', 'DOCTOR']}>
                  <Matching />
                </ProtectedRoute>
              }
            />

            {/* Match Requests Queue */}
            <Route
              path="/match-requests"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'COORDINATOR', 'DOCTOR']}>
                  <MatchRequests />
                </ProtectedRoute>
              }
            />

            {/* Allocations: Visible to all including AUDITOR */}
            <Route path="/allocations" element={<Allocations />} />

            {/* Graph Visualization */}
            <Route path="/graph/:matchId" element={<GraphView />} />

            {/* Governance & Policies */}
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsConditions />} />
          </Route>

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
