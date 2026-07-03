/**
 * ResetPassword.tsx — Reset password page
 */

import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AuthLayout } from '../layout/AuthLayout';
import { Loader2, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export const ResetPassword: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();
      setIsSubmitting(false);

      if (res.ok) {
        setSuccess(true);
      } else {
        setError(data.error || 'Failed to reset password.');
      }
    } catch (_) {
      setIsSubmitting(false);
      setError('Network error. Please try again.');
    }
  };

  if (success) {
    return (
      <AuthLayout title="Password updated" subtitle="Your security credentials have been successfully updated.">
        <div className="flex flex-col gap-4 text-center w-full">
          <p className="text-sm" style={{ color: 'var(--color-text-muted)', lineHeight: '1.6' }}>
            You can now log in using your new credentials.
          </p>
          <Link to="/login" className="btn-primary w-full mt-2" style={{ textDecoration: 'none' }}>
            Sign In
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="New Password" subtitle="Choose a strong, unique password of at least 8 characters.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 w-full">
        {/* Password */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="eyebrow">
            New Password
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
            placeholder="Repeat password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isSubmitting}
            required
            autoComplete="new-password"
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
          disabled={isSubmitting || password !== confirmPassword || password.length < 8}
          whileTap={{ scale: 0.98 }}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Resetting credentials…
            </>
          ) : (
            <>
              Reset Password
              <ArrowRight size={16} />
            </>
          )}
        </motion.button>

        {/* Cancel */}
        <Link to="/login" className="btn-secondary w-full text-center" style={{ textDecoration: 'none' }}>
          Back to login
        </Link>
      </form>
    </AuthLayout>
  );
};

export default ResetPassword;
