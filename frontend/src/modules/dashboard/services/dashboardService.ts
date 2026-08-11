import axiosInstance from '@/config/axios';
import { DashboardStats, DashboardTotalSummary } from '../types';

export const dashboardService = {
  getStats: async (): Promise<DashboardStats> => {
    const response = await axiosInstance.get<DashboardStats>('/dashboard/stats');
    return response.data;
  },
  getTotalSummary: async (): Promise<DashboardTotalSummary> => {
    const response = await axiosInstance.get<DashboardTotalSummary>('/dashboard/total-summary');
    return response.data;
  },
};
