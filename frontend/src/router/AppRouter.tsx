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
import { VentasPage } from '@/modules/ventas';
import { VentaOrdenesPage } from '@/modules/ventas-ordenes';
import { UsersPage } from '@/modules/users';
import { RolesPage } from '@/modules/roles';
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

/**
 * El permiso "Ver" de un módulo decide el acceso a su pantalla completa —
 * reemplaza las listas de roles hardcodeadas (ADMIN_ONLY, ALL_WEB_ROLES) que
 * había antes. ADMIN siempre pasa (lo resuelve `hasPermission`).
 */
const RoleProtectedRoute = ({
  children,
  moduloKey,
  redirectTo = ROUTES.VEHICLES,
}: {
  children: ReactNode;
  moduloKey: string;
  redirectTo?: string;
}) => {
  const { isLoading, hasPermission } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!hasPermission(moduloKey, 'canView')) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};

// --- Validación especial para Jefe de Obra (JEFE_DE_OBRA o ADMIN con cédula 1307857902) ---
// No se toca: es un caso especial por NOMBRE de rol (no por módulo/permiso),
// igual que validatePlatformAccess en el backend — el sistema de permisos no
// lo reemplaza a propósito.
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

// --- Componente Principal ---
export const AppRouter = ({ basename }: AppRouterProps) => {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path={ROUTES.LOGIN} element={<LoginPage />} />

        <Route
          path={ROUTES.DASHBOARD}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute moduloKey="dashboard">
                <ProtectedLayout>
                  <DashboardPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.VEHICLES}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute moduloKey="vehicles" redirectTo={ROUTES.LOGIN}>
                <ProtectedLayout>
                  <VehiclesPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.PROVEEDORES}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute moduloKey="owners" redirectTo={ROUTES.VEHICLES}>
                <ProtectedLayout>
                  <ProveedoresPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.PROVEEDORES_MATERIALES}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute moduloKey="material-providers" redirectTo={ROUTES.VEHICLES}>
                <ProtectedLayout>
                  <ProveedorMaterialesPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.OBRAS}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute moduloKey="const-sites">
                <ProtectedLayout>
                  <ObrasPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.PLANIFICACION}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute moduloKey="plannings">
                <ProtectedLayout>
                  <PlanificacionPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.CLIENTES}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute moduloKey="clients">
                <ProtectedLayout>
                  <ClientesPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.DRIVERS}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute moduloKey="drivers">
                <ProtectedLayout>
                  <DriversPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.TRANSPORT_LOG}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute moduloKey="transport-log">
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
          path={ROUTES.VENTAS_MATERIAL}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute moduloKey="ventas">
                <ProtectedLayout>
                  <VentasPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.VENTAS_ORDENES}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute moduloKey="ventas-ordenes">
                <ProtectedLayout>
                  <VentaOrdenesPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.REPORTES}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute moduloKey="reports" redirectTo={ROUTES.VEHICLES}>
                <ProtectedLayout>
                  <ReportesPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.USERS}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute moduloKey="users">
                <ProtectedLayout>
                  <UsersPage />
                </ProtectedLayout>
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path={ROUTES.ROLES}
          element={
            <ProtectedRoute>
              <RoleProtectedRoute moduloKey="roles">
                <ProtectedLayout>
                  <RolesPage />
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

/** Redirige al landing correcto: dashboard si el rol lo puede ver, si no a
 *  vehículos (que a su vez redirige más si tampoco lo puede ver). Antes
 *  comparaba `user.role === 'JEFE_DE_OBRA'` a mano; ahora es el mismo
 *  permiso "Ver" que decide todo el resto de la navegación. */
const RootRedirect = () => {
  const { isAuthenticated, isLoading, hasPermission } = useAuth();

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

  if (hasPermission('dashboard', 'canView')) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return <Navigate to={ROUTES.VEHICLES} replace />;
};
