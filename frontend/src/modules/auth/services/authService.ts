import axiosInstance from '@/config/axios';
import { TOKEN_KEY, USER_KEY, AUTH_ROUTES } from '@/config/constants';
import { LoginCredentials, AuthResponse } from '../types';
import { decodeJWT } from '@/shared/utils/jwt';
import { userService } from '@/modules/users/services/userService';

interface BackendLoginResponse {
  access_token: string;
}

export const authService = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    try {

      const datosParaEnviar = {
        document: credentials.document,
        password: credentials.password,
        origin: 'WEB' 
      };

      console.log('Enviando al backend:', datosParaEnviar); 
      
      const response = await axiosInstance.post<BackendLoginResponse>(
        AUTH_ROUTES.LOGIN, 
        datosParaEnviar,
      );
      const { access_token } = response.data;

      // Decodificar el JWT para obtener los datos del usuario
      const decoded = decodeJWT(access_token);
      
      if (!decoded) {
        throw new Error('Token inválido');
      }

      const user = {
        id: decoded.sub,
        document: decoded.document,
        name: decoded.name ?? decoded.document,
        role: decoded.role,
      };

      // Almacenar token y usuario en localStorage
      localStorage.setItem(TOKEN_KEY, access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));

      let enrichedUser = user;

      try {
        const users = await userService.getAll();
        const match = users?.find?.((item: any) =>
          item?.document === decoded.document || String(item?.id) === String(decoded.sub)
        );
        if (match?.name) {
          enrichedUser = { ...user, name: match.name };
          localStorage.setItem(USER_KEY, JSON.stringify(enrichedUser));
        }
      } catch (error) {
        console.warn('No se pudo cargar el nombre del usuario:', error);
      }

      return {
        token: access_token,
        user: enrichedUser,
      };
    } catch (error) {
      console.error('Error en login:', error);
      throw error;
    }
  },

  logout: async (): Promise<void> => {
    try {
      // Limpiar datos del cliente
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (error) {
      console.error('Error en logout:', error);
    }
  },

  verifyToken: async (token: string): Promise<AuthResponse> => {
    const decoded = decodeJWT(token);
    
    if (!decoded) {
      throw new Error('Token inválido');
    }

    const user = {
      id: decoded.sub,
      document: decoded.document,
      name: decoded.name ?? decoded.document,
      role: decoded.role,
    };

    let enrichedUser = user;

    try {
      const users = await userService.getAll();
      const match = users?.find?.((item: any) =>
        item?.document === decoded.document || String(item?.id) === String(decoded.sub)
      );
      if (match?.name) {
        enrichedUser = { ...user, name: match.name };
      }
    } catch (error) {
      console.warn('No se pudo refrescar el nombre del usuario:', error);
    }

    return {
      token,
      user: enrichedUser,
    };
  },
};
