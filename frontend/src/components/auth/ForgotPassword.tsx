/**
 * ForgotPassword.tsx — Password reset request page
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '../layout/AuthLayout';
import { Loader2, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Dev link returned by backend if email credentials are not set
  const [devResetLink, setDevResetLink] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      setIsSubmitting(false);

      if (res.ok) {
        setSuccess(true);
        if (data.devResetLink) {
          setDevResetLink(data.devResetLink);
        }
      } else {
        setError(data.error || 'Failed to request reset.');
      }
    } catch (_) {
      setIsSubmitting(false);
      setError('Network error. Please try again.');
    }
  };

  if (success) {
    return (
      <AuthLayout title="Check your inbox" subtitle={`We've dispatched a reset link if ${email} matches an account.`}>
        <div className="flex flex-col gap-6 text-center w-full">
          <p className="text-sm" style={{ color: 'var(--color-text-muted)', lineHeight: '1.6' }}>
            The link will expire in 30 minutes. If you do not receive an email shortly, please check your spam folder.
          </p>

          {/* Dev reset link fallback box for judges */}
          {devResetLink && (
            <div
              className="p-4 rounded-xl text-left border"
              style={{
                background: 'var(--color-green-light)',
                borderColor: 'rgba(47, 79, 62, 0.2)',
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-green)' }}>
                Dev Mode / Judge Helper
              </p>
              <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                Email service credentials aren't configured. You can test the password reset link directly here:
              </p>
              <Link
                to={devResetLink}
                className="text-xs font-mono font-medium hover:underline block truncate"
                style={{ color: 'var(--color-green)' }}
              >
                {window.location.origin}{devResetLink}
              </Link>
            </div>
          )}

          <Link to="/login" className="btn-primary w-full mt-2" style={{ textDecoration: 'none' }}>
            Back to Sign In
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Recover Account" subtitle="Enter your email below to receive a secure recovery link.">
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
              Checking records…
            </>
          ) : (
            <>
              Request Reset Link
              <ArrowRight size={16} />
            </>
          )}
        </motion.button>

        {/* Cancel */}
        <Link to="/login" className="btn-secondary w-full text-center" style={{ textDecoration: 'none' }}>
          Cancel
        </Link>
      </form>
    </AuthLayout>
  );
};

export default ForgotPassword;
