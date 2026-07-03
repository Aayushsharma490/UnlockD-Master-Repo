/**
 * Login.tsx — Sign in page with click-to-fill demo profiles
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AuthLayout } from '../layout/AuthLayout';
import { Loader2, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seeded demo accounts list
  const DEMO_ACCOUNTS = [
    { name: 'Arjun Mehta', email: 'arjun@verdant.com', role: 'Default Sender' },
    { name: 'Priya Sharma', email: 'priya@verdant.com', role: 'Premium Recipient' },
    { name: 'Rohit Kapoor', email: 'rohit@verdant.com', role: 'Seed User' },
    { name: 'Kabir Sen', email: 'kabir@verdant.com', role: 'Yield earner' },
  ];

  const handleDemoClick = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('password123');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await login(email, password);
    setIsSubmitting(false);

    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.error || 'Failed to log in.');
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to manage your cultivated assets.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 w-full">
        {/* Email */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="eyebrow">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            className="verdant-input"
            placeholder="you@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting}
            required
            autoComplete="email"
          />
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center">
            <label htmlFor="password" className="eyebrow">
              Password
            </label>
            <Link
              to="/forgot-password"
              className="text-xs"
              style={{ color: 'var(--color-text-muted)', textDecoration: 'none' }}
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            className="verdant-input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isSubmitting}
            required
            autoComplete="current-password"
          />
        </div>

        {/* Error banner */}
        {error && (
          <p className="text-sm" style={{ color: 'var(--color-terra)' }}>
            {error}
          </p>
        )}

        {/* Submit */}
        <motion.button
          type="submit"
          className="btn-primary w-full mt-2"
          disabled={isSubmitting}
          whileTap={{ scale: 0.98 }}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Verifying credentials…
            </>
          ) : (
            <>
              Sign In
              <ArrowRight size={16} />
            </>
          )}
        </motion.button>

        {/* Quick Demo Login Box */}
        <div
          className="p-4 rounded-xl border mt-3 text-left bg-white/20"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2.5" style={{ color: 'var(--color-text-muted)' }}>
            Quick Demo Portals (Password: password123)
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => handleDemoClick(acc.email)}
                className="flex flex-col text-left p-2 rounded-lg border bg-white/40 hover:bg-white/70 transition-colors"
                style={{ borderColor: 'var(--color-border)', cursor: 'pointer' }}
              >
                <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                  {acc.name}
                </span>
                <span className="text-[9px]" style={{ color: 'var(--color-text-faint)' }}>
                  {acc.role}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Signup redirection */}
        <p className="text-xs text-center mt-2 m-0" style={{ color: 'var(--color-text-muted)' }}>
          Don't have an account?{' '}
          <Link
            to="/signup"
            className="font-medium hover:underline"
            style={{ color: 'var(--color-green)' }}
          >
            Create one now
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
};

export default Login;
