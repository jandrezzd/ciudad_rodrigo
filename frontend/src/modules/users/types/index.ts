export interface UserRoleRef {
  id: number;
  name: string;
  description?: string | null;
  isSystem: boolean;
  isActive: boolean;
}

export interface User {
  id: number;
  name: string;
  document: string;
  email: string;
  roleId: number;
  roleRef?: UserRoleRef;
  isActive: boolean;
  phone?: string;
  company?: string;
  roletype?: 'OBRA' | 'CANTERA';
  /** Lo llena el bot cuando el usuario comparte su contacto; solo lectura. */
  telegramChatId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateUserData extends Omit<User, 'id' | 'roleRef' | 'telegramChatId'> {
  password?: string;
}

export type UpdateUserData = Partial<CreateUserData>;
