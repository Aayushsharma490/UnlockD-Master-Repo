/**
 * AuthContext.tsx — Authentication Context
 * Handles login, signup, checkAuth, and updates.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface User {
  id: string;
  name: string;
  email: string;
  preferences: {
    compact: boolean;
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (name: string) => Promise<{ success: boolean; error?: string }>;
  updatePreferences: (compact: boolean) => Promise<{ success: boolean; error?: string }>;
  checkAuthStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuthStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (_) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        return { success: true };
      }
      return { success: false, error: data.error || 'Login failed.' };
    } catch (err) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const signup = async (name: string, email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        // Success — signup auto-logs in via the set httpOnly cookie.
        // We trigger checkAuthStatus to populate user profile details.
        await checkAuthStatus();
        return { success: true };
      }
      return { success: false, error: data.error || 'Signup failed.' };
    } catch (err) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (_) {}
    setUser(null);
  };

  const updateProfile = async (name: string) => {
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok) {
        setUser((prev) => (prev ? { ...prev, name: data.name } : null));
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to update profile.' };
    } catch (_) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const updatePreferences = async (compact: boolean) => {
    try {
      const res = await fetch('/api/users/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compact }),
      });
      const data = await res.json();
      if (res.ok) {
        setUser((prev) => (prev ? { ...prev, preferences: data.preferences } : null));
        // Also sync with localStorage for fast client-side checks
        localStorage.setItem('compact_density', JSON.stringify(compact));
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to save preferences.' };
    } catch (_) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        signup,
        logout,
        updateProfile,
        updatePreferences,
        checkAuthStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
