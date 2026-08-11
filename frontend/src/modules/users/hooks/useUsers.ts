import { useState, useEffect, useCallback } from 'react';
import { userService } from '../services/userService';
import { User } from '../types';
import toast from 'react-hot-toast';
import { sortByNewest } from '@/shared/utils/sort';

export const useUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await userService.getAll();
      const list = Array.isArray(response) ? response : response.data || [];
      setUsers(sortByNewest(list));
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Error al cargar usuarios';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return {
    users,
    isLoading,
    error,
    refetch: fetchUsers,
  };
};
