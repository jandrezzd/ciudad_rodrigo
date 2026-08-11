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
  province: string;
  canton: string;
  address: string;
  value: number;
  abscisa: number;
  quarryDist: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  clients?: ObraClientRelation[];
  clientId?: string;
  client?: Cliente;
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
