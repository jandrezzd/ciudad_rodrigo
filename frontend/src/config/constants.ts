export const APP_NAME = 'Ciudad Rodrigo Constructora';

export const COLORS = {
  primary: '#2563EB',
  primaryDark: '#1E40AF',
  secondary: '#F97316',
  secondaryDark: '#EA580C',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
} as const;

// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
export const API_TIMEOUT = 10000; // 10 seconds

// Token Configuration
export const TOKEN_KEY = import.meta.env.VITE_TOKEN_KEY || 'token';
export const USER_KEY = import.meta.env.VITE_USER_KEY || 'user';
export const TOKEN_HEADER = 'Authorization';
export const TOKEN_PREFIX = 'Bearer ';

// Auth Routes
export const AUTH_ROUTES = {
  LOGIN: '/auth/login',
  LOGOUT: '/auth/logout',
  REFRESH: '/auth/refresh',
  REGISTER: '/auth/register',
} as const;

export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  VEHICLES: '/vehicles',
  PROVEEDORES: '/proveedores',
  PROVEEDORES_MATERIALES: '/proveedores-materiales',
  OBRAS: '/obras',
  PLANIFICACION: '/planificacion',
  CLIENTES: '/clientes',
  DRIVERS: '/choferes',
  TRANSPORT_LOG: '/registro-transporte',
  TRANSPORT_LOG_JEFE: '/registro-transporte-jefe',
  REPORTES: '/reportes',
  USERS: '/users',
} as const;

export const STATUS_OPTIONS = [
  { value: 'activo', label: 'Activo' },
  { value: 'inactivo', label: 'Inactivo' },
  { value: 'suspendido', label: 'Suspendido' },
  { value: 'completado', label: 'Completado' },
] as const;

export const VEHICLE_TYPES = [
  { value: 'propio', label: 'Propio' },
  { value: 'alquilado', label: 'Alquilado' },
] as const;

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
} as const;

export const PROVIDER_OPTIONS = [
  { value: 'prov-001', label: 'Toyota del Ecuador S.A.' },
  { value: 'prov-002', label: 'Chevrolet Motors' },
  { value: 'prov-003', label: 'Autolasa S.A.' },
  { value: 'prov-004', label: 'Mavesa' },
  { value: 'prov-005', label: 'Casabaca S.A.' },
  { value: 'prov-006', label: 'Nissan Ecuador' },
  { value: 'prov-007', label: 'Kia Motors Ecuador' },
  { value: 'prov-008', label: 'Hyunmotor' },
  { value: 'prov-009', label: 'Mazda Automotores' },
] as const;
