export interface ModulePermission {
  moduloKey: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canToggle: boolean;
}

export interface User {
  id: string;
  document: string;
  name: string;
  role: string;
  /** Vacío hasta que /auth/verify responde la primera vez tras el login (ver
   *  AuthContext). No viaja en el JWT: cambiar un permiso no tendría efecto
   *  hasta que expirara el token si viviera ahí. */
  permissions: ModulePermission[];
}

export interface LoginCredentials {
  document: string;
  password: string;
  origin?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  /** ADMIN siempre true, atajo que espeja al backend (PermissionGuard). */
  hasPermission: (moduloKey: string, accion: keyof Omit<ModulePermission, 'moduloKey'>) => boolean;
}
