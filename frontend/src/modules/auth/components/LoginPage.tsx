import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Input } from '@/shared/components/Input';
import { Button } from '@/shared/components/Button';
import { ROUTES } from '@/config/constants';
import { sanitizeNumeric } from '@/shared/utils/validation';
import logo from '@/img/Ciudad Rodrigo logo.png';
import buildingImage from '@/img/unnamed.png';

export const LoginPage = () => {
  const [document, setDocument] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await login({ document, password });
      navigate(ROUTES.DASHBOARD);
    } catch (error) {
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex w-full relative">
      {/* Left Side: Image */}
      <div className="hidden lg:flex w-1/2 bg-gray-100">
        <img
          src={buildingImage}
          alt="Constructora"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Right Side: Login Form Background */}
      <div className="relative flex w-full lg:w-1/2 items-center justify-center bg-white p-8">

        {/* Formulario Posicionado Absolutamente ("por encima de todo") */}
        <div className="w-full max-w-md lg:absolute lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:-ml-12 xl:-ml-20 z-50">
          <div className="text-center mb-10 flex flex-col items-center">
            <img src={logo} alt="Constructora Ciudad Rodrigo Logo" className="w-72 object-contain mb-6" />
            <h1 className="text-3xl font-bold text-gray-800 tracking-tight">Bienvenido</h1>
            <p className="text-gray-500 mt-2">Ingresa tus credenciales para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <Input
              type="text"
              label="Cédula"
              value={document}
              onChange={(e) => setDocument(sanitizeNumeric(e.target.value, 10))}
              inputMode="numeric"
              maxLength={10}
              required
              autoComplete="username"
            />

            <Input
              type="password"
              label="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full py-3 text-lg font-semibold"
              isLoading={isLoading}
            >
              Iniciar Sesión
            </Button>
          </form>

          <p className="text-center text-sm text-gray-400 mt-12">
            Sistema de gestión de constructora v1.0
          </p>
        </div>
      </div>
    </div>
  );
};
