export interface User {
  id: number;
  name: string;
  document: string;
  email: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'USER' | 'JEFE_DE_OBRA';
  isActive: boolean;
  phone?: string;
  company?: string;
  roletype?: 'OBRA' | 'CANTERA';
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateUserData extends Omit<User, 'id'> {
  password?: string;
}

export type UpdateUserData = Partial<CreateUserData>;
