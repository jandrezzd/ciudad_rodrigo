import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { roleService } from '../services/roleService';
import { Modulo, Role } from '../types';

/** Mismo contrato que el resto de los hooks del proyecto:
 *  { datos, isLoading, error, refetch }. */
export const useRoles = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoles = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [rolesData, modulosData] = await Promise.all([
        roleService.getAll(),
        roleService.getModulos(),
      ]);
      setRoles(Array.isArray(rolesData) ? rolesData : []);
      setModulos(Array.isArray(modulosData) ? modulosData : []);
    } catch (err) {
      console.error(err);
      const errorMessage = 'Error al cargar los cargos';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  return { roles, modulos, isLoading, error, refetch: fetchRoles };
};
