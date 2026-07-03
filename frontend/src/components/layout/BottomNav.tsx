/**
 * BottomNav.tsx — Mobile bottom navigation (React Router version)
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ArrowLeftRight, Settings } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const BOTTOM_NAV_ITEMS = [
    {
      to: '/dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard size={20} strokeWidth={1.75} />,
    },
    {
      to: '/transactions',
      label: 'History',
      icon: <ArrowLeftRight size={20} strokeWidth={1.75} />,
    },
    {
      to: '/settings',
      label: 'Settings',
      icon: <Settings size={20} strokeWidth={1.75} />,
    },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around px-2 pb-safe"
      style={{
        background: 'rgba(250,247,242,0.92)',
        backdropFilter: 'blur(16px)',
        borderTop: '1px solid var(--color-border)',
        height: 64,
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}
      aria-label="Mobile navigation"
    >
      {BOTTOM_NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className="flex flex-col items-center gap-1 px-4 py-2 text-decoration-none"
          style={({ isActive }) => ({
            color: isActive ? 'var(--color-green)' : 'var(--color-text-muted)',
            background: 'none',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          {item.icon}
          <span style={{ fontSize: '10px', fontWeight: 400 }}>
            {item.label}
          </span>
        </NavLink>
      ))}
    </nav>
  );
};

export default BottomNav;
