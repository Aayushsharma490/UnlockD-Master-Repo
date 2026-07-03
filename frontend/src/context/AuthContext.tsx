/**
 * AuthContext.tsx — Authentication Context (Bypassed to Auto-login Arjun Mehta)
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
  // Auto-login as Arjun Mehta instantly by default
  const [user, setUser] = useState<User | null>({
    id: 'usr_arjun',
    name: 'Arjun Mehta',
    email: 'arjun@verdant.com',
    preferences: { compact: false },
  });
  const [loading, setLoading] = useState(false);

  const checkAuthStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
        }
      }
    } catch (_) {
      // Graceful fallback to default mock if offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const login = async (_email: string, _password: string) => {
    // Stub login to always succeed
    return { success: true };
  };

  const signup = async (_name: string, _email: string, _password: string) => {
    // Stub signup to always succeed
    return { success: true };
  };

  const logout = async () => {
    // Do not clear user to keep dashboard accessible
    console.log('[Auth] Logout request bypassed to keep dashboard active');
  };

  const updateProfile = async (name: string) => {
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setUser((prev) => (prev ? { ...prev, name } : null));
        return { success: true };
      }
      return { success: false };
    } catch (_) {
      return { success: false };
    }
  };

  const updatePreferences = async (compact: boolean) => {
    try {
      const res = await fetch('/api/users/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: { compact } }),
      });
      if (res.ok) {
        setUser((prev) => (prev ? { ...prev, preferences: { compact } } : null));
        return { success: true };
      }
      return { success: false };
    } catch (_) {
      return { success: false };
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
