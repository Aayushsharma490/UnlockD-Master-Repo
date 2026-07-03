/**
 * AppShell.tsx — Protected layout shell containing Sidebar, BottomNav, and Ambient Glow
 */

import React from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { Plus } from 'lucide-react';
import { VerdantLogo } from '../brand/VerdantLogo';

interface AppShellProps {
  children: React.ReactNode;
  onOpenTransfer: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({ children, onOpenTransfer }) => {
  return (
    <>
      {/* Ambient background glow */}
      <div className="ambient-glow" aria-hidden="true" />

      <div className="flex relative z-10" style={{ minHeight: '100dvh' }}>
        {/* Desktop Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
          
          {/* Top header (Mobile only) */}
          <header
            className="md:hidden flex items-center justify-between px-5 py-4 sticky top-0 z-20"
            style={{
              background: 'rgba(250,247,242,0.88)',
              backdropFilter: 'blur(16px)',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <VerdantLogo />
            <button
              id="mobile-transfer-btn"
              className="btn-primary"
              style={{ padding: '8px 14px', fontSize: '13px' }}
              onClick={onOpenTransfer}
            >
              <Plus size={14} />
              Transfer
            </button>
          </header>

          {/* Main scrollable body */}
          <main
            className="flex-1 px-5 md:px-8 py-6 md:py-8 pb-24 md:pb-8"
            style={{ maxWidth: 900, width: '100%', margin: '0 auto' }}
          >
            {children}
          </main>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav />
    </>
  );
};

export default AppShell;
