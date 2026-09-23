import { createContext, ReactNode, useCallback, useEffect, useState } from 'react';
import { AuthContextType, LoginCredentials, ModulePermission, User } from '../types';
import { authService } from '../services/authService';
import toast from 'react-hot-toast';

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Verificar autenticación al cargar la aplicación
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (storedToken && storedUser) {
      try {
        const parsedUser: User = JSON.parse(storedUser);
        // Pintado instantáneo con lo que ya había en localStorage...
        setToken(storedToken);
        setUser(parsedUser);

        // ...y en segundo plano se refrescan los permisos de verdad contra el
        // backend. Antes esto solo decodificaba el JWT guardado — un cambio
        // de permisos (o que alguien te desactive) no se reflejaba hasta que
        // el token expirara (hasta 1 día). Si falla (sin red, token vencido),
        // se queda con lo que ya había: el interceptor 401 de axios se
        // encarga de mandar al login si el token en sí ya no sirve.
        authService
          .verifyToken(parsedUser)
          .then((response) => {
            setToken(response.token);
            setUser(response.user);
          })
          .catch(() => {
            // silencioso a propósito: sin red no hay por qué cerrar sesión.
          });
      } catch (error) {
        // Si hay error al parsear, limpiar localStorage
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    try {
      setIsLoading(true);
      const response = await authService.login(credentials);

      setToken(response.token);
      setUser(response.user);

      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));

      toast.success('Inicio de sesión exitoso');
    } catch (error) {
      console.error('Error de login:', error);
      toast.error('Credenciales inválidas');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    toast.success('Sesión cerrada');
  }, []);

  /** ADMIN nunca se consulta contra la matriz: siempre tiene todo — mismo
   *  criterio hardcodeado que usa PermissionGuard en el backend. */
  const hasPermission = useCallback(
    (moduloKey: string, accion: keyof Omit<ModulePermission, 'moduloKey'>) => {
      if (!user) return false;
      if (user.role === 'ADMIN') return true;
      const permiso = user.permissions?.find((p) => p.moduloKey === moduloKey);
      return permiso?.[accion] ?? false;
    },
    [user],
  );

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    isLoading,
    login,
    logout,
    hasPermission,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
