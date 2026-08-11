import axiosInstance from '@/config/axios';
import { Obra, ObraFormData } from '../types';

interface ConstSiteClientRelationResponse {
  id: number;
  clientId: number;
  constSiteId: number;
}

const parseClientId = (clientId?: string) => {
  if (!clientId) return undefined;
  const parsed = Number(clientId);
  return Number.isNaN(parsed) ? undefined : parsed;
};

export const obraService = {
  getAll: async (): Promise<Obra[]> => {
    const response = await axiosInstance.get<Obra[]>('/const-sites');
    return response.data;
  },

  getById: async (id: number): Promise<Obra> => {
    const response = await axiosInstance.get<Obra>(`/const-sites/${id}`);
    return response.data;
  },

  create: async (data: ObraFormData): Promise<Obra> => {
    const payload = {
      name: data.name,
      province: data.province,
      canton: data.canton,
      address: data.address,
      value: data.value,
      quarryDist: data.quarryDist,
      abscisa: data.abscisa,
    };
    const response = await axiosInstance.post<Obra>('/const-sites', payload);
    let created = response.data;

    if (data.isActive === false && created?.id) {
      const updateResponse = await axiosInstance.patch<Obra>(`/const-sites/${created.id}`, {
        isActive: false,
      });
      created = updateResponse.data;
    }

    const clientId = parseClientId(data.clientId);
    if (clientId && created?.id) {
      await axiosInstance.post(`/const-sites/${created.id}/clients/${clientId}`);
      return await obraService.getById(created.id);
    }

    return created;
  },

  update: async (id: number, data: Partial<ObraFormData>): Promise<Obra> => {
    const payload = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.province !== undefined ? { province: data.province } : {}),
      ...(data.canton !== undefined ? { canton: data.canton } : {}),
      ...(data.address !== undefined ? { address: data.address } : {}),
      ...(data.value !== undefined ? { value: data.value } : {}),
      ...(data.quarryDist !== undefined ? { quarryDist: data.quarryDist } : {}),
      ...(data.abscisa !== undefined ? { abscisa: data.abscisa } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    };

    const response = await axiosInstance.patch<Obra>(`/const-sites/${id}`, payload);

    if (data.clientId !== undefined) {
      const selectedClientId = parseClientId(data.clientId);
      const relationsResponse = await axiosInstance.get<ConstSiteClientRelationResponse[]>(`/const-sites/${id}/clients`);
      const relations = Array.isArray(relationsResponse.data) ? relationsResponse.data : [];

      const currentClientIds = relations.map((relation) => relation.clientId);

      for (const relationClientId of currentClientIds) {
        if (!selectedClientId || relationClientId !== selectedClientId) {
          await axiosInstance.delete(`/const-sites/${id}/clients/${relationClientId}`);
        }
      }

      if (selectedClientId && !currentClientIds.includes(selectedClientId)) {
        await axiosInstance.post(`/const-sites/${id}/clients/${selectedClientId}`);
      }

      return await obraService.getById(id);
    }

    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    // Usamos soft delete (isActive: false) ya que no podemos modificar el backend
    // y el DELETE físico falla por restricciones de foráneas (Foreign Key constraints)
    await axiosInstance.patch(`/const-sites/${id}`, { isActive: false });
  },
};
