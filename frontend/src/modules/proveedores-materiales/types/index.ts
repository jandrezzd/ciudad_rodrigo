export interface Cantera {
  id?: number;
  nombre: string;
  provincia?: string;
  canton?: string;
  direccion?: string;
  materialProviderId?: number;
}

export interface ProveedorMaterial {
  id: number;
  ruc: string;
  /** El backend retorna este campo como 'razonsocial' (en minúscula) */
  razonsocial: string;
  email: string;
  provincia?: string;
  canton?: string;
  direccion?: string;
  isActive?: boolean;
  canteras: Cantera[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ProveedorMaterialFormData {
  ruc: string;
  razonsocial: string;
  email: string;
  provincia?: string;
  canton?: string;
  direccion?: string;
  canteras: Omit<Cantera, 'id' | 'materialProviderId'>[];
}
