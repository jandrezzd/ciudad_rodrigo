import axios from 'axios';
import { 
  API_BASE_URL, 
  API_TIMEOUT, 
  TOKEN_KEY, 
  TOKEN_HEADER, 
  TOKEN_PREFIX,
  USER_KEY,
  ROUTES 
} from './constants';

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false,
});

// Interceptor de request para agregar token
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers[TOKEN_HEADER] = `${TOKEN_PREFIX}${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor de response para manejar errores de autenticación
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token inválido o expirado
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      // Redirigir al login
      if (window.location.pathname !== ROUTES.LOGIN) {
        window.location.href = ROUTES.LOGIN;
      }
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
