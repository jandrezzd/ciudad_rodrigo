export type Status =
  | 'activo'
  | 'inactivo'
  | 'suspendido'
  | 'completado'
  | 'pendiente'
  | 'en_progreso'
  | 'cancelado'
  | 'alerta'
  | 'revisado'
  | 'retrasado'
  | 'validado';

export interface PaginationParams {
  page: number;
  pageSize: number;
  search?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: unknown;
}

export interface SelectOption {
  value: string;
  label: string;
}
