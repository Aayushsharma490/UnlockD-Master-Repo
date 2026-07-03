/**
 * App.tsx — Verdant Finance Route Orchestrator
 *
 * Configures React Router routes for public auth forms and
 * protected dashboard, transactions, budgets, settings, and cooperative groups layouts.
 */

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { PublicOnlyRoute } from './components/auth/PublicOnlyRoute';
import { motion, AnimatePresence } from 'framer-motion';

// Auth Pages
import Login from './components/auth/Login';
import Signup from './components/auth/Signup';
import ForgotPassword from './components/auth/ForgotPassword';
import ResetPassword from './components/auth/ResetPassword';

// Protected Pages
import DashboardPage from './components/dashboard/DashboardPage';
import TransactionsPage from './components/transactions/TransactionsPage';
import BudgetsPage from './components/budgets/BudgetsPage';
import GroupsPage from './components/groups/GroupsPage';
import GroupDetailsPage from './components/groups/GroupDetailsPage';
import Settings from './components/settings/Settings';
import AnalyticsPage from './components/analytics/AnalyticsPage';

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

  // Global Toast Alert banner state
  const [activeToast, setActiveToast] = useState<{ message: string; type: 'warning' | 'info' } | null>(null);

  // Auto-hide toast alerts after 6 seconds
  useEffect(() => {
    if (activeToast) {
      const timer = setTimeout(() => setActiveToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [activeToast]);

  // Data hooks (shared with modal)
  const {
    accounts,
    applyOptimisticTransfer,
    reconcileBalances,
    refetch: refetchAccounts,
  } = useAccounts();

  const {
    addPendingTransaction,
    updateTransactionStatus,
    refetch: refetchTransactions,
  } = useTransactions();

  const handleCloseModal = () => {
    setIsModalOpen(false);
    // Refresh backend data Authoritatively when modal closes (done button splits)
    refetchAccounts();
    refetchTransactions();
  };

  return (
    <BrowserRouter>
      {/* Toast Alert banner */}
      <AnimatePresence>
        {activeToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            transition={{ duration: 0.3 }}
            style={{
              position: 'fixed',
              top: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 100,
              width: '90%',
              maxWidth: '400px',
              background: '#FAF7F2',
              border: '1px solid rgba(181,83,60,0.3)',
              boxShadow: '0 10px 30px rgba(181,83,60,0.1)',
              padding: '16px 20px',
              borderRadius: '16px',
            }}
          >
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[--color-terra]">
                  Budget Alert
                </span>
                <button
                  onClick={() => setActiveToast(null)}
                  className="text-xs font-bold border-none bg-transparent cursor-pointer"
                  style={{ color: 'var(--color-text-muted)', border: 'none', background: 'none' }}
                >
                  ✕
                </button>
              </div>
              <p className="text-xs m-0 leading-relaxed font-medium" style={{ color: 'var(--color-text)' }}>
                {activeToast.message}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Routes>
        {/* Unauthenticated routes */}
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
        </Route>

        {/* Authenticated routes */}
        <Route element={<ProtectedRoute />}>
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
            path="/budgets"
            element={
              <AppShell onOpenTransfer={() => setIsModalOpen(true)}>
                <BudgetsPage />
              </AppShell>
            }
          />
          <Route
            path="/groups"
            element={
              <AppShell onOpenTransfer={() => setIsModalOpen(true)}>
                <GroupsPage />
              </AppShell>
            }
          />
          <Route
            path="/groups/:id"
            element={
              <AppShell onOpenTransfer={() => setIsModalOpen(true)}>
                <GroupDetailsPage />
              </AppShell>
            }
          />
          <Route
            path="/analytics"
            element={
              <AppShell onOpenTransfer={() => setIsModalOpen(true)}>
                <AnalyticsPage />
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
        onClose={handleCloseModal}
        onOptimisticTransfer={applyOptimisticTransfer}
        onReconcile={reconcileBalances}
        onTransactionAdded={addPendingTransaction}
        onTransactionStatusUpdate={updateTransactionStatus}
        onShowToast={(msg) => setActiveToast({ message: msg, type: 'warning' })}
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
