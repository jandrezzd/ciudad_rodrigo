import axiosInstance from '@/config/axios';
import { TOKEN_KEY, USER_KEY, AUTH_ROUTES } from '@/config/constants';
import { AuthResponse, LoginCredentials, ModulePermission } from '../types';
import { decodeJWT } from '@/shared/utils/jwt';

interface BackendLoginResponse {
  access_token: string;
  user: {
    name: string;
    roletype: string | null;
    role: string;
    permissions: ModulePermission[];
  };
}

interface BackendVerifyResponse {
  access_token: string;
  permissions: ModulePermission[];
}

export const authService = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await axiosInstance.post<BackendLoginResponse>(AUTH_ROUTES.LOGIN, {
      document: credentials.document,
      password: credentials.password,
      origin: 'WEB',
    });
    const { access_token, user: backendUser } = response.data;

    // El nombre y los permisos ya vienen resueltos en el cuerpo de la
    // respuesta — decodificar el JWT solo hace falta para el id (`sub`), que
    // no viaja en `user`.
    const decoded = decodeJWT(access_token);
    if (!decoded) throw new Error('Token inválido');

    const user = {
      id: decoded.sub,
      document: decoded.document,
      name: backendUser.name ?? decoded.document,
      role: backendUser.role,
      permissions: backendUser.permissions ?? [],
    };

    localStorage.setItem(TOKEN_KEY, access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));

    return { token: access_token, user };
  },

  logout: async (): Promise<void> => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  /**
   * Llama de verdad al backend (antes solo decodificaba el JWT guardado, sin
   * tocar la red). Es lo que permite que un cambio de permisos se refleje sin
   * tener que volver a iniciar sesión: se pide la matriz fresca cada vez que
   * la app se monta.
   */
  verifyToken: async (currentUser: { id: string; document: string; name: string }): Promise<AuthResponse> => {
    const response = await axiosInstance.get<BackendVerifyResponse>(AUTH_ROUTES.VERIFY);
    const { access_token, permissions } = response.data;

    const decoded = decodeJWT(access_token);
    const user = {
      id: currentUser.id,
      document: currentUser.document,
      name: currentUser.name,
      role: decoded?.role ?? '',
      permissions: permissions ?? [],
    };

    localStorage.setItem(TOKEN_KEY, access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));

    return { token: access_token, user };
  },
};
