/**
 * App.tsx — Verdant Finance Route Orchestrator
 *
 * Configures React Router routes for public auth forms and
 * protected dashboard, transactions, and settings layouts.
 */

import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { PublicOnlyRoute } from './components/auth/PublicOnlyRoute';

// Auth Pages
import Login from './components/auth/Login';
import Signup from './components/auth/Signup';
import ForgotPassword from './components/auth/ForgotPassword';
import ResetPassword from './components/auth/ResetPassword';

// Protected Pages
import DashboardPage from './components/dashboard/DashboardPage';
import TransactionsPage from './components/transactions/TransactionsPage';
import Settings from './components/settings/Settings';

// Layout & Modals
import AppShell from './components/layout/AppShell';
import TransferModal from './components/transfer/TransferModal';

// Hooks & state
import { useAccounts } from './hooks/useAccounts';
import { useTransactions } from './hooks/useTransactions';
import { useLenis } from './hooks/useLenis';

import './index.css';

function MainAppRoutes() {
  // Smooth scroll
  useLenis();

  // Global modal state
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Data hooks (shared with modal)
  const {
    accounts,
    applyOptimisticTransfer,
    reconcileBalances,
  } = useAccounts();

  const {
    addPendingTransaction,
    updateTransactionStatus,
  } = useTransactions();

  return (
    <BrowserRouter>
      <Routes>
        {/* Unauthenticated routes (Redirect to /dashboard if logged in) */}
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
        </Route>

        {/* Authenticated routes (Redirect to /login if logged out) */}
        <Route element={<ProtectedRoute />}>
          {/* Main AppShell layout wrapper wraps all dashboard panels */}
          <Route
            path="/"
            element={
              <AppShell onOpenTransfer={() => setIsModalOpen(true)}>
                <DashboardPage onOpenTransfer={() => setIsModalOpen(true)} />
              </AppShell>
            }
          />
          <Route
            path="/dashboard"
            element={
              <AppShell onOpenTransfer={() => setIsModalOpen(true)}>
                <DashboardPage onOpenTransfer={() => setIsModalOpen(true)} />
              </AppShell>
            }
          />
          <Route
            path="/transactions"
            element={
              <AppShell onOpenTransfer={() => setIsModalOpen(true)}>
                <TransactionsPage />
              </AppShell>
            }
          />
          <Route
            path="/settings"
            element={
              <AppShell onOpenTransfer={() => setIsModalOpen(true)}>
                <Settings />
              </AppShell>
            }
          />
        </Route>

        {/* Fallback redirect */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>

      {/* Global Transfer Modal */}
      <TransferModal
        isOpen={isModalOpen}
        accounts={accounts}
        onClose={() => setIsModalOpen(false)}
        onOptimisticTransfer={applyOptimisticTransfer}
        onReconcile={reconcileBalances}
        onTransactionAdded={addPendingTransaction}
        onTransactionStatusUpdate={updateTransactionStatus}
      />
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainAppRoutes />
    </AuthProvider>
  );
}
