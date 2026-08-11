import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { AuthContextType } from '../types';

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    const fallback: AuthContextType = {
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      login: async () => {
        throw new Error('AuthProvider no está disponible');
      },
      logout: () => undefined,
    };
    return fallback;
  }
  return context;
};
