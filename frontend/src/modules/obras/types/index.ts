// Tipos alineados con el backend (DTO: CreateConstSiteDto)
// Backend fields: name, province, canton, address, value

import { Cliente } from '@/modules/clientes/types';

export interface ObraClientRelation {
  id: number;
  clientId: number;
  constSiteId: number;
  client?: Cliente;
}

export interface Obra {
  id: number;
  name: string;
  /** Pueden venir vacíos: la obra que se crea sola con el cliente solo trae nombre. */
  province: string | null;
  canton: string | null;
  address: string | null;
  value: number | null;
  abscisa: number | null;
  quarryDist: number | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  clients?: ObraClientRelation[];
  clientId?: string;
  client?: Cliente;
  /** Al crear: true si ya había una obra con ese nombre y se devolvió esa. */
  yaExistia?: boolean;
}

export interface ObraFormData {
  name: string;
  province: string;
  canton: string;
  address: string;
  value: number;
  abscisa: number;
  quarryDist: number;
  clientId: string;
  isActive: boolean;
}
