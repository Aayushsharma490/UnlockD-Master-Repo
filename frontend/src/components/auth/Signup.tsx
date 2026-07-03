/**
 * Signup.tsx — Create Account Page
 */

import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AuthLayout } from '../layout/AuthLayout';
import { Loader2, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const Signup: React.FC = () => {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline Validation
  const inlineError = useMemo((): string | null => {
    if (email && !/\S+@\S+\.\S+/.test(email)) {
      return 'Enter a valid email address.';
    }
    if (password && password.length < 8) {
      return 'Password must be at least 8 characters long.';
    }
    if (confirmPassword && password !== confirmPassword) {
      return 'Passwords do not match.';
    }
    return null;
  }, [email, password, confirmPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (inlineError) {
      setError(inlineError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await signup(name, email, password);
    setIsSubmitting(false);

    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.error || 'Failed to complete signup.');
    }
  };

  return (
    <AuthLayout title="Money, cultivated" subtitle="Set up your account to generate your savings foundation.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">
        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="eyebrow">
            Full Name
          </label>
          <input
            id="name"
            type="text"
            className="verdant-input"
            placeholder="Arjun Mehta"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
            required
            autoComplete="name"
          />
        </div>

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
          <label htmlFor="password" className="eyebrow">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="verdant-input"
            placeholder="Minimum 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isSubmitting}
            required
            autoComplete="new-password"
          />
        </div>

        {/* Confirm Password */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirmPassword" className="eyebrow">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            className="verdant-input"
            placeholder="Repeat your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isSubmitting}
            required
            autoComplete="new-password"
          />
        </div>

        {/* Inline & Server validation error banner */}
        <AnimatePresence>
          {(inlineError || error) && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-sm"
              style={{ color: 'var(--color-terra)' }}
            >
              {inlineError || error}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Submit */}
        <motion.button
          type="submit"
          className="btn-primary w-full mt-2"
          disabled={isSubmitting || !!inlineError}
          whileTap={{ scale: 0.98 }}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Generating accounts…
            </>
          ) : (
            <>
              Create Account
              <ArrowRight size={16} />
            </>
          )}
        </motion.button>

        {/* Login redirection */}
        <p className="text-xs text-center mt-2" style={{ color: 'var(--color-text-muted)' }}>
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium hover:underline"
            style={{ color: 'var(--color-green)' }}
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
};

export default Signup;
