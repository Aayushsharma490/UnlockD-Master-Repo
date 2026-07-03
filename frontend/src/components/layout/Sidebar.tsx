/**
 * Sidebar.tsx — Desktop navigation sidebar (React Router version with Split Bills link)
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ArrowLeftRight, Settings, PieChart, Users, TrendingUp } from 'lucide-react';
import { VerdantLogo } from '../brand/VerdantLogo';
import { useAuth } from '../../context/AuthContext';

export const Sidebar: React.FC = () => {
  const { user } = useAuth();
  
  const NAV_ITEMS = [
    {
      to: '/dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard size={18} strokeWidth={1.75} />,
    },
    {
      to: '/transactions',
      label: 'Transactions',
      icon: <ArrowLeftRight size={18} strokeWidth={1.75} />,
    },
    {
      to: '/budgets',
      label: 'Budgets',
      icon: <PieChart size={18} strokeWidth={1.75} />,
    },
    {
      to: '/groups',
      label: 'Split Bills',
      icon: <Users size={18} strokeWidth={1.75} />,
    },
    {
      to: '/analytics',
      label: 'Analytics',
      icon: <TrendingUp size={18} strokeWidth={1.75} />,
    },
    {
      to: '/settings',
      label: 'Settings',
      icon: <Settings size={18} strokeWidth={1.75} />,
    },
  ];

  return (
    <aside
      className="hidden md:flex flex-col"
      style={{
        width: 220,
        minHeight: '100dvh',
        borderRight: '1px solid var(--color-border)',
        background: 'rgba(255,255,255,0.5)',
        backdropFilter: 'blur(8px)',
        position: 'sticky',
        top: 0,
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        className="px-5 py-6"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <VerdantLogo />
        <p
          className="mt-1 text-xs"
          style={{ color: 'var(--color-text-faint)', letterSpacing: '0.02em' }}
        >
          Money, cultivated.
        </p>
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-4 px-3" aria-label="Main navigation">
        <ul className="flex flex-col gap-1 list-none m-0 p-0">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) => 
                  `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                    isActive ? 'font-medium' : 'text-[--color-text-muted]'
                  }`
                }
                style={({ isActive }) => ({
                  background: isActive ? 'var(--color-green-light)' : 'transparent',
                  color: isActive ? 'var(--color-green)' : 'var(--color-text-muted)',
                  display: 'flex',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontFamily: 'var(--font-ui)',
                })}
              >
                {item.icon}
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* User profile card */}
      <div
        className="px-4 py-4 flex items-center gap-3"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        <div
          className="flex items-center justify-center rounded-xl flex-shrink-0"
          style={{
            width: 32,
            height: 32,
            background: 'var(--color-green-light)',
            border: '1px solid rgba(47,79,62,0.15)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '14px',
              color: 'var(--color-green)',
            }}
          >
            {user?.name?.charAt(0).toUpperCase() || 'V'}
          </span>
        </div>
        <div className="overflow-hidden">
          <p
            className="text-sm font-medium truncate"
            style={{ color: 'var(--color-text)', margin: 0 }}
          >
            {user?.name || 'User Profile'}
          </p>
          <p
            className="text-xs truncate"
            style={{ color: 'var(--color-text-muted)', margin: 0 }}
          >
            {user?.email || 'authenticated'}
          </p>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
