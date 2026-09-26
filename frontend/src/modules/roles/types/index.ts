export interface Modulo {
  id: number;
  key: string;
  label: string;
}

export interface RolePermissionRow {
  id: number;
  roleId: number;
  moduloId: number;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canToggle: boolean;
  modulo: Modulo;
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  permissions: RolePermissionRow[];
  _count: { users: number };
}

export interface RoleFormData {
  name: string;
  description: string;
  isActive: boolean;
}

export interface PermissionMatrixRow {
  moduloId: number;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canToggle: boolean;
}
