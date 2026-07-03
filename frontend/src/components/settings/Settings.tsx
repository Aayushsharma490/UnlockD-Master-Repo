/**
 * Settings.tsx — User Settings and Profile Controls
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'framer-motion';
import { User, Shield, Sliders, LogOut, Check, Loader2 } from 'lucide-react';

export const Settings: React.FC = () => {
  const { user, logout, updateProfile, updatePreferences } = useAuth();

  // Name state
  const [name, setName] = useState(user?.name || '');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passLoading, setPassLoading] = useState(false);
  const [passSuccess, setPassSuccess] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);

  // Compact preference state
  const [compact, setCompact] = useState(user?.preferences?.compact || false);
  const [prefLoading, setPrefLoading] = useState(false);

  // Profile Save
  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setProfileLoading(true);
    setProfileSuccess(false);
    setProfileError(null);

    const result = await updateProfile(name);
    setProfileLoading(false);

    if (result.success) {
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } else {
      setProfileError(result.error || 'Failed to update profile.');
    }
  };

  // Password Save
  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setPassError('Please fill in all password fields.');
      return;
    }

    if (newPassword.length < 8) {
      setPassError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPassError('New passwords do not match.');
      return;
    }

    setPassLoading(true);
    setPassSuccess(false);
    setPassError(null);

    try {
      const res = await fetch('/api/users/me/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      setPassLoading(false);

      if (res.ok) {
        setPassSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setTimeout(() => setPassSuccess(false), 3000);
      } else {
        setPassError(data.error || 'Failed to update password.');
      }
    } catch (_) {
      setPassLoading(false);
      setPassError('Network error. Please try again.');
    }
  };

  // Preference Toggle
  const handlePreferenceToggle = async (checked: boolean) => {
    setCompact(checked);
    setPrefLoading(true);
    await updatePreferences(checked);
    setPrefLoading(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="flex flex-col gap-8 w-full max-w-[800px] mx-auto py-6"
    >
      <div>
        <p className="eyebrow mb-1">Preferences & Security</p>
        <h1
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: '36px',
            fontWeight: 400,
            color: 'var(--color-text)',
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          Settings
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Manage your personal profile, credentials, and visual density.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Profile Card */}
        <section className="glass-card p-6" aria-label="Profile Section">
          <div className="flex items-center gap-3 mb-6">
            <User size={18} color="var(--color-green)" />
            <h2 className="text-base font-medium m-0" style={{ color: 'var(--color-text)' }}>
              Profile details
            </h2>
          </div>

          <form onSubmit={handleProfileSave} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="settings-email" className="eyebrow">
                Email Address (Read-only)
              </label>
              <input
                id="settings-email"
                type="email"
                className="verdant-input"
                value={user?.email || ''}
                readOnly
                style={{ opacity: 0.7, cursor: 'not-allowed' }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="settings-name" className="eyebrow">
                Display Name
              </label>
              <input
                id="settings-name"
                type="text"
                className="verdant-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={profileLoading}
                required
              />
            </div>

            {profileError && (
              <p className="text-xs" style={{ color: 'var(--color-terra)' }}>
                {profileError}
              </p>
            )}

            <div className="flex items-center justify-between mt-2">
              <span className="text-xs" style={{ color: 'var(--color-text-faint)' }}>
                This name is shown at greeting in dashboard.
              </span>
              <button
                type="submit"
                className="btn-primary"
                disabled={profileLoading || name === user?.name || !name.trim()}
                style={{ padding: '8px 16px', fontSize: '13px' }}
                id="profile-save-btn"
              >
                {profileLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : profileSuccess ? (
                  <Check size={14} />
                ) : (
                  'Save Profile'
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Credentials Card */}
        <section className="glass-card p-6" aria-label="Credentials Section">
          <div className="flex items-center gap-3 mb-6">
            <Shield size={18} color="var(--color-green)" />
            <h2 className="text-base font-medium m-0" style={{ color: 'var(--color-text)' }}>
              Change password
            </h2>
          </div>

          <form onSubmit={handlePasswordSave} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="current-pass" className="eyebrow">
                Current Password
              </label>
              <input
                id="current-pass"
                type="password"
                className="verdant-input"
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={passLoading}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-pass" className="eyebrow">
                New Password
              </label>
              <input
                id="new-pass"
                type="password"
                className="verdant-input"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={passLoading}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm-new-pass" className="eyebrow">
                Confirm New Password
              </label>
              <input
                id="confirm-new-pass"
                type="password"
                className="verdant-input"
                placeholder="Repeat new password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                disabled={passLoading}
                required
              />
            </div>

            {passError && (
              <p className="text-xs" style={{ color: 'var(--color-terra)' }}>
                {passError}
              </p>
            )}

            {passSuccess && (
              <p className="text-xs" style={{ color: 'var(--color-green)' }}>
                Password changed successfully.
              </p>
            )}

            <div className="flex justify-end mt-2">
              <button
                type="submit"
                className="btn-primary"
                disabled={passLoading || !currentPassword || !newPassword || !confirmNewPassword}
                style={{ padding: '8px 16px', fontSize: '13px' }}
                id="password-save-btn"
              >
                {passLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : passSuccess ? (
                  <Check size={14} />
                ) : (
                  'Update Password'
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Preferences Card */}
        <section className="glass-card p-6" aria-label="Preferences Section">
          <div className="flex items-center gap-3 mb-6">
            <Sliders size={18} color="var(--color-green)" />
            <h2 className="text-base font-medium m-0" style={{ color: 'var(--color-text)' }}>
              UI Preferences
            </h2>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                Compact Density
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Reduces row spacing on the transactions list for high information density.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {prefLoading && <Loader2 size={14} className="animate-spin text-[--color-text-faint]" />}
              <button
                type="button"
                role="switch"
                aria-checked={compact}
                disabled={prefLoading}
                onClick={() => handlePreferenceToggle(!compact)}
                id="compact-density-toggle"
                style={{
                  width: 48,
                  height: 24,
                  borderRadius: 12,
                  background: compact ? 'var(--color-green)' : 'rgba(28,27,25,0.15)',
                  position: 'relative',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background 200ms ease',
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: 'white',
                    position: 'absolute',
                    top: 3,
                    left: compact ? 27 : 3,
                    transition: 'left 200ms cubic-bezier(0.2, 0.85, 0.32, 1.2)',
                  }}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Sign Out Card */}
        <section className="glass-card p-6" aria-label="Sign Out Section">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                Terminate session
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Clears security tokens and logs out from this browser.
              </p>
            </div>
            <button
              onClick={logout}
              className="btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                borderColor: 'rgba(181, 83, 60, 0.3)',
                color: 'var(--color-terra)',
              }}
              id="logout-btn"
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        </section>
      </div>
    </motion.div>
  );
};

export default Settings;
