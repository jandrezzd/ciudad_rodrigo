import { useEffect, useState } from 'react';

/**
 * Componente de diagnóstico para verificar conectividad con el backend
 * Solo para desarrollo
 */
export const DiagnosticsPage = () => {
  const [status, setStatus] = useState<{
    backend: string;
    apiUrl: string;
    cors: string;
    loading: boolean;
  }>({
    backend: 'Verificando...',
    apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
    cors: 'Verificando...',
    loading: true,
  });

  useEffect(() => {
    const testBackend = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
        
        // Test 1: Verifica si el backend responde
        const response = await fetch(`${apiUrl.split('/api')[0]}/`, {
          method: 'OPTIONS',
        });

        setStatus((prev) => ({
          ...prev,
          backend: response.ok ? '✅ Backend accesible' : '❌ Backend no responde',
          cors: response.headers.get('access-control-allow-origin') 
            ? '✅ CORS habilitado' 
            : '⚠️ CORS no configurado',
          loading: false,
        }));
      } catch (error) {
        setStatus((prev) => ({
          ...prev,
          backend: `❌ Por: ${error instanceof Error ? error.message : 'Error desconocido'}`,
          loading: false,
        }));
      }
    };

    testBackend();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Diagnóstico de Conectividad</h1>

        <div className="space-y-4">
          <div className="bg-gray-800 p-4 rounded">
            <p className="text-sm text-gray-400">API URL:</p>
            <p className="text-lg font-mono">{status.apiUrl}</p>
          </div>

          <div className="bg-gray-800 p-4 rounded">
            <p className="text-sm text-gray-400">Estado del Backend:</p>
            <p className="text-lg">{status.loading ? '⏳ Verificando...' : status.backend}</p>
          </div>

          <div className="bg-gray-800 p-4 rounded">
            <p className="text-sm text-gray-400">CORS:</p>
            <p className="text-lg">{status.cors}</p>
          </div>

          <div className="bg-yellow-900 border border-yellow-700 p-4 rounded mt-6">
            <p className="text-yellow-100">
              Si ves errores, asegúrate de:
              <ul className="list-disc ml-5 mt-2 space-y-1">
                <li>Backend está corriendo en puerto 3000</li>
                <li>PostgreSQL está activa</li>
                <li>CORS está habilitado en el backend</li>
                <li>Frontend está en http://localhost:5173</li>
              </ul>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
