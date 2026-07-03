/**
 * AuthLayout.tsx — Auth Page Layout wrapper
 * Shared wrapper for Login, Signup, Forgot, and Reset pages.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { VerdantLogo } from '../brand/VerdantLogo';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, title, subtitle }) => {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 bg-[--color-bg] relative"
      style={{ overflow: 'hidden' }}
    >
      {/* Background glow effects */}
      <div className="ambient-glow" aria-hidden="true" />

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="glass-card w-full max-w-[440px] px-8 py-10 relative z-10 flex flex-col items-center text-center"
      >
        {/* Brand badge */}
        <div className="mb-6 flex justify-center">
          <VerdantLogo showWordmark={false} />
        </div>

        {/* Heading */}
        <h1
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: '32px',
            fontWeight: 400,
            color: 'var(--color-text)',
            letterSpacing: '-0.01em',
            margin: '0 0 8px 0',
          }}
        >
          {title}
        </h1>
        <p
          className="text-sm mb-8"
          style={{ color: 'var(--color-text-muted)', lineHeight: '1.5' }}
        >
          {subtitle}
        </p>

        {/* Inner form/content wrapper */}
        <div className="w-full text-left">{children}</div>
      </motion.div>

      {/* Footer name reference */}
      <p
        className="mt-6 text-xs relative z-10"
        style={{ color: 'var(--color-text-faint)', letterSpacing: '0.05em' }}
      >
        VERDANT — MONEY, CULTIVATED.
      </p>
    </div>
  );
};

export default AuthLayout;
