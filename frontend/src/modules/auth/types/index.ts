export interface User {
  id: string;
  document: string;
  name: string;
  role: string;
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
}
