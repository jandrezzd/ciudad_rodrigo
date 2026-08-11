

export type ClienteType = 'PUBLICO' | 'PRIVADO' | 'PUBLIC' | 'PRIVATE';

export interface Cliente {
  id: string;
  name: string;
  ruc: string;
  companyname: string;
  province: string;
  canton: string;
  address: string;
  type: ClienteType;
  email?: string;
  phone?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClienteFormData {
  name: string;
  ruc: string;
  companyname: string;
  province: string;
  canton: string;
  address: string;
  type: ClienteType;
  email?: string;
  phone?: string;
  isActive: boolean;
}
