import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { LoginPage, ProtectedRoute } from '@/modules/auth';
import { DashboardPage } from '@/modules/dashboard';
import { VehiclesPage } from '@/modules/vehicles';
import { ProveedoresPage } from '@/modules/proveedores';
import { ObrasPage } from '@/modules/obras';
import { ProveedorMaterialesPage } from '@/modules/proveedores-materiales';
import { PlanificacionPage } from '@/modules/planificacion';
import { ClientesPage } from '@/modules/clientes';
import { DriversPage } from '@/modules/drivers';
import { TransportLogPage } from '@/modules/registro-transporte';
import { TransportLogJefePage } from '@/modules/registro-transporte-jefe';
import { ReportesPage } from '@/modules/reportes';
import { UsersPage } from '@/modules/users';
import { DiagnosticsPage } from '@/modules/dashboard/components/DiagnosticsPage';
import { Layout } from '@/shared/components/Layout';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { ROUTES } from '@/config/constants';

// --- Interfaces ---
interface AppRouterProps {
  basename?: string;
}

// --- Componentes de Apoyo ---
const ProtectedLayout = ({ children }: { children: ReactNode }) => {
  const { logout } = useAuth();

  return (
    <Layout onLogout={logout}>
      {children}
    </Layout>
  );
};

const RoleProtectedRoute = ({
  children,
  allowedRoles,
  redirectTo = ROUTES.VEHICLES,
}: {
  children: ReactNode;
  allowedRoles: string[];
  redirectTo?: string;
}) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user?.role || !allowedRoles.includes(user.role)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};

// --- Validación especial para Jefe de Obra (JEFE_DE_OBRA o ADMIN con cédula 1307857902) ---
const RoleBasedTransportLogJefe = ({
  children,
  redirectTo = ROUTES.VEHICLES,
}: {
  children: ReactNode;
  redirectTo?: string;
}) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const hasAccess =
    user?.role === 'JEFE_DE_OBRA' ||
    (user?.role === 'ADMIN' && user?.document === '1307857902');

  if (!hasAccess) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};

// --- Configuración de Roles ---
const ADMIN_ONLY = ['ADMIN'];
const ALL_WEB_ROLES = ['ADMIN', 'JEFE_DE_OBRA'];

// --- Componente Principal ---
export const AppRouter = ({ basename }: AppRouterProps) => {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path={ROUTES.LOGIN} element={<LoginPage />} />

        {/* Dashboard — solo ADMIN */}
        <Route
          path={ROUTES.DASHBOARD}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={ADMIN_ONLY}>
                <ProtectedLayout>
                  <DashboardPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        {/* Vehículos — ADMIN y JEFE_DE_OBRA */}
        <Route
          path={ROUTES.VEHICLES}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={ALL_WEB_ROLES} redirectTo={ROUTES.LOGIN}>
                <ProtectedLayout>
                  <VehiclesPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        {/* Proveedores — ADMIN y JEFE_DE_OBRA */}
        <Route
          path={ROUTES.PROVEEDORES}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={ALL_WEB_ROLES} redirectTo={ROUTES.VEHICLES}>
                <ProtectedLayout>
                  <ProveedoresPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        {/* Proveedores Materiales — ADMIN y JEFE_DE_OBRA */}
        <Route
          path={ROUTES.PROVEEDORES_MATERIALES}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={ALL_WEB_ROLES} redirectTo={ROUTES.VEHICLES}>
                <ProtectedLayout>
                  <ProveedorMaterialesPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        {/* Obras — solo ADMIN */}
        <Route
          path={ROUTES.OBRAS}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={ADMIN_ONLY}>
                <ProtectedLayout>
                  <ObrasPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        {/* Planificación — solo ADMIN */}
        <Route
          path={ROUTES.PLANIFICACION}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={ADMIN_ONLY}>
                <ProtectedLayout>
                  <PlanificacionPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        {/* Clientes — solo ADMIN */}
        <Route
          path={ROUTES.CLIENTES}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={ADMIN_ONLY}>
                <ProtectedLayout>
                  <ClientesPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        {/* Choferes — solo ADMIN (backend: CRUD de /drivers restringido a ADMIN) */}
        <Route
          path={ROUTES.DRIVERS}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={ADMIN_ONLY}>
                <ProtectedLayout>
                  <DriversPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        {/* Registro Transporte — solo ADMIN */}
        <Route
          path={ROUTES.TRANSPORT_LOG}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={ADMIN_ONLY}>
                <ProtectedLayout>
                  <TransportLogPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        {/* Registro Transporte Jefe — JEFE_DE_OBRA o ADMIN con cédula 1307857902 */}
        <Route
          path={ROUTES.TRANSPORT_LOG_JEFE}
          element={
            <ProtectedRoute>
              <RoleBasedTransportLogJefe>
                <ProtectedLayout>
                  <TransportLogJefePage />
                </ProtectedLayout>
              </RoleBasedTransportLogJefe>
            </ProtectedRoute>
          }
        />
        
        <Route
          path={ROUTES.REPORTES}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={ALL_WEB_ROLES} redirectTo={ROUTES.VEHICLES}>
                <ProtectedLayout>
                  <ReportesPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        {/* Usuarios — solo ADMIN */}
        <Route
          path={ROUTES.USERS}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={ADMIN_ONLY}>
                <ProtectedLayout>
                  <UsersPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        <Route path="/diagnostics" element={<DiagnosticsPage />} />
        
        {/* Ruta raíz — redirige según rol */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </BrowserRouter>
  );
};

/** Redirige al landing correcto según el rol del usuario autenticado. */
const RootRedirect = () => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  if (user?.role === 'JEFE_DE_OBRA') {
    return <Navigate to={ROUTES.VEHICLES} replace />;
  }

  return <Navigate to={ROUTES.DASHBOARD} replace />;
};