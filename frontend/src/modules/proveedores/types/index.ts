// Tipos alineados con el backend (DTO: CreateOwnerDto)
// Backend fields: ruc, companyname, name, document, email, phone

export interface Proveedor {
  id: number;
  ruc: string;
  companyname: string;
  name: string;
  document: string;
  province: string;
  canton: string;
  address: string;
  email: string;
  phone: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProveedorFormData {
  ruc: string;
  companyname: string;
  name: string;
  document: string;
  province: string;
  canton: string;
  address: string;
  email: string;
  phone: string;
}
