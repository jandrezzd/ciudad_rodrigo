import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Truck,
  Building2,
  CalendarClock,
  Users,
  UserCog,
  ClipboardList,
  BarChart3,
  LogOut,
  Settings,
  ChevronDown,
  ChevronRight,
  BrickWall,
  Contact,
  HandCoins,
  PackageCheck,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { ROUTES } from '@/config/constants';
import logo from '@/img/lgooo.png';
import { useAuth } from '@/modules/auth/hooks/useAuth';

interface NavItem {
  path: string;
  icon: typeof LayoutDashboard;
  label: string;
  moduloKey: string;
}

// Grupo "Ventas" — filtrado por el permiso "Ver" de cada módulo
const ventasItemsAll: NavItem[] = [
  { path: ROUTES.VENTAS_MATERIAL, icon: PackageCheck, label: 'Venta de material', moduloKey: 'ventas' },
  { path: ROUTES.VENTAS_ORDENES, icon: FileText, label: 'Órdenes de venta', moduloKey: 'ventas-ordenes' },
];

// Grupo "Administración" — ídem
const adminItemsAll: NavItem[] = [
  { path: ROUTES.PROVEEDORES, icon: Truck, label: 'Proveedores', moduloKey: 'owners' },
  { path: ROUTES.PROVEEDORES_MATERIALES, icon: BrickWall, label: 'Prov. Material', moduloKey: 'material-providers' },
  { path: ROUTES.VEHICLES, icon: Truck, label: 'Vehículos', moduloKey: 'vehicles' },
  { path: ROUTES.DRIVERS, icon: Contact, label: 'Choferes', moduloKey: 'drivers' },
  { path: ROUTES.CLIENTES, icon: Users, label: 'Clientes', moduloKey: 'clients' },
  { path: ROUTES.OBRAS, icon: Building2, label: 'Obras', moduloKey: 'const-sites' },
  { path: ROUTES.USERS, icon: UserCog, label: 'Usuarios', moduloKey: 'users' },
  { path: ROUTES.ROLES, icon: ShieldCheck, label: 'Roles y permisos', moduloKey: 'roles' },
];

interface SidebarProps {
  onLogout: () => void;
  isCollapsed: boolean;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

export const Sidebar = ({ onLogout, isCollapsed, isMobileOpen, onMobileClose }: SidebarProps) => {
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isVentasOpen, setIsVentasOpen] = useState(false);
  const location = useLocation();
  const { user, hasPermission } = useAuth();

  const isAdmin = user?.role === 'ADMIN';
  const isJefeDeObra = user?.role === 'JEFE_DE_OBRA';
  const isAdminSpecial = isAdmin && user?.document === '1307857902';

  const mainNavItems = useMemo(() => {
    const items: NavItem[] = [];

    if (hasPermission('dashboard', 'canView')) {
      items.push({ path: ROUTES.DASHBOARD, icon: LayoutDashboard, label: 'Dashboard', moduloKey: 'dashboard' });
    }
    if (hasPermission('plannings', 'canView')) {
      items.push({ path: ROUTES.PLANIFICACION, icon: CalendarClock, label: 'Planificación', moduloKey: 'plannings' });
    }

    if (isJefeDeObra) {
      items.push({
        path: ROUTES.TRANSPORT_LOG_JEFE,
        icon: ClipboardList,
        label: 'Registro Transporte',
        moduloKey: 'transport-log',
      });
    } else if (hasPermission('transport-log', 'canView')) {
      items.push({
        path: ROUTES.TRANSPORT_LOG,
        icon: ClipboardList,
        label: 'Registro Transporte',
        moduloKey: 'transport-log',
      });
    }
    if (isAdminSpecial) {
      items.push({
        path: ROUTES.TRANSPORT_LOG_JEFE,
        icon: ClipboardList,
        label: 'Jefe de Obra',
        moduloKey: 'transport-log',
      });
    }

    if (hasPermission('reports', 'canView')) {
      items.push({ path: ROUTES.REPORTES, icon: BarChart3, label: 'Reportes', moduloKey: 'reports' });
    }

    return items;
  }, [hasPermission, isJefeDeObra, isAdminSpecial]);

  const ventasItems = useMemo(
    () => ventasItemsAll.filter((item) => hasPermission(item.moduloKey, 'canView')),
    [hasPermission],
  );

  const adminItems = useMemo(
    () => adminItemsAll.filter((item) => hasPermission(item.moduloKey, 'canView')),
    [hasPermission],
  );

  const isAdminActive = adminItems.some((item) => location.pathname.startsWith(item.path));

  useEffect(() => {
    if (isAdminActive) {
      setIsAdminOpen(true);
    }
  }, [isAdminActive]);

  const isVentasActive = ventasItems.some((item) => location.pathname.startsWith(item.path));

  useEffect(() => {
    if (isVentasActive) {
      setIsVentasOpen(true);
    }
  }, [isVentasActive]);

  return (
    <>
      <aside
        className={`
          fixed top-0 left-0 h-full z-46
          bg-gradient-to-b from-blue-900 to-blue-950 dark:from-night-sidebar dark:to-night-sidebar-deep
          border-r border-transparent dark:border-night-divider
          text-white
          ${isCollapsed ? 'w-20' : 'w-64'} transform transition-all duration-300 ease-in-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        <div className="flex flex-col h-full">
          {/* Cabecera con Logo */}
          <div className="p-6 border-b border-blue-800/80 dark:border-night-divider flex items-center justify-center transition-all min-h-[113px] shrink-0">
            {isCollapsed ? (
              <div className="h-16 flex items-center justify-center text-orange-500 dark:text-orange-400 font-bold text-2xl tracking-wider select-none">
                CR
              </div>
            ) : (
              <img
                src={logo}
                alt="Constructora Ciudad Rodrigo Logo"
                className="w-auto h-16 object-contain filter drop-shadow-sm transition-all"
              />
            )}
          </div>

          {/* Navegación Principal */}
          <nav className="flex-1 px-3 py-5 space-y-1.5 overflow-y-auto overflow-x-hidden no-scrollbar">
            {/* Enlaces Principales */}
            {mainNavItems.map((item, index) => (
              <NavLink
                key={`${item.path}-${index}`}
                to={item.path}
                onClick={onMobileClose}
                className={({ isActive }) => `
                  flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-3.5'} py-2.5 rounded-xl transition-all duration-150 text-xs sm:text-sm font-medium
                  ${
                    isActive
                      ? 'bg-orange-500 dark:bg-orange-600/90 text-white shadow-sm dark:shadow-none font-semibold'
                      : 'text-blue-100 dark:text-night-muted hover:bg-blue-800/70 dark:hover:bg-white/5 hover:text-white dark:hover:text-night-text'
                  }
                `}
                title={isCollapsed ? item.label : undefined}
              >
                <item.icon size={19} className="shrink-0" />
                {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </NavLink>
            ))}

            {/* Submenú Ventas */}
            {ventasItems.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setIsVentasOpen(!isVentasOpen)}
                  className={`
                    w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-between px-3.5'} py-2.5 rounded-xl transition-all duration-150 outline-none text-xs sm:text-sm font-medium
                    ${
                      isVentasActive && !isVentasOpen
                        ? 'text-orange-400 dark:text-orange-300 font-semibold'
                        : 'text-blue-100 dark:text-night-muted hover:bg-blue-800/70 dark:hover:bg-white/5 hover:text-white dark:hover:text-night-text'
                    }
                  `}
                  title={isCollapsed ? 'Ventas' : undefined}
                >
                  <div className={`flex items-center ${isCollapsed ? '' : 'gap-3'}`}>
                    <HandCoins size={19} className={`shrink-0 ${isVentasActive ? 'text-orange-400 dark:text-orange-300' : ''}`} />
                    {!isCollapsed && (
                      <span className={`whitespace-nowrap ${isVentasActive ? 'text-orange-400 dark:text-orange-300' : ''}`}>
                        Ventas
                      </span>
                    )}
                  </div>
                  {!isCollapsed && (isVentasOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />)}
                </button>

                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out bg-blue-900/30 dark:bg-black/20 rounded-xl ${
                    isVentasOpen ? 'max-h-[500px] opacity-100 mt-1' : 'max-h-0 opacity-0 mt-0 pointer-events-none'
                  }`}
                >
                  <div
                    className={`${
                      isCollapsed
                        ? 'flex flex-col items-center gap-1.5 py-2'
                        : 'ml-3 pl-3 border-l border-blue-800/60 dark:border-night-divider space-y-1 py-1.5 my-1'
                    }`}
                  >
                    {ventasItems.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={onMobileClose}
                        className={({ isActive }) => `
                          flex items-center ${isCollapsed ? 'justify-center w-9 h-9' : 'gap-2.5 px-3 py-2'} rounded-lg transition-all duration-150 text-xs
                          ${
                            isActive
                              ? 'bg-orange-500 dark:bg-orange-600/90 text-white shadow-xs font-semibold'
                              : 'text-blue-200 dark:text-night-muted hover:bg-blue-800/60 dark:hover:bg-white/5 hover:text-white dark:hover:text-night-text'
                          }
                        `}
                        title={isCollapsed ? item.label : undefined}
                      >
                        <item.icon size={16} className="shrink-0" />
                        {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Submenú Administración */}
            {adminItems.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setIsAdminOpen(!isAdminOpen)}
                  className={`
                    w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-between px-3.5'} py-2.5 rounded-xl transition-all duration-150 outline-none text-xs sm:text-sm font-medium
                    ${
                      isAdminActive && !isAdminOpen
                        ? 'text-orange-400 dark:text-orange-300 font-semibold'
                        : 'text-blue-100 dark:text-night-muted hover:bg-blue-800/70 dark:hover:bg-white/5 hover:text-white dark:hover:text-night-text'
                    }
                  `}
                  title={isCollapsed ? 'Administración' : undefined}
                >
                  <div className={`flex items-center ${isCollapsed ? '' : 'gap-3'}`}>
                    <Settings size={19} className={`shrink-0 ${isAdminActive ? 'text-orange-400 dark:text-orange-300' : ''}`} />
                    {!isCollapsed && (
                      <span className={`whitespace-nowrap ${isAdminActive ? 'text-orange-400 dark:text-orange-300' : ''}`}>
                        Administración
                      </span>
                    )}
                  </div>
                  {!isCollapsed && (isAdminOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />)}
                </button>

                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out bg-blue-900/30 dark:bg-black/20 rounded-xl ${
                    isAdminOpen ? 'max-h-[500px] opacity-100 mt-1' : 'max-h-0 opacity-0 mt-0 pointer-events-none'
                  }`}
                >
                  <div
                    className={`${
                      isCollapsed
                        ? 'flex flex-col items-center gap-1.5 py-2'
                        : 'ml-3 pl-3 border-l border-blue-800/60 dark:border-night-divider space-y-1 py-1.5 my-1'
                    }`}
                  >
                    {adminItems.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={onMobileClose}
                        className={({ isActive }) => `
                          flex items-center ${isCollapsed ? 'justify-center w-9 h-9' : 'gap-2.5 px-3 py-2'} rounded-lg transition-all duration-150 text-xs
                          ${
                            isActive
                              ? 'bg-orange-500 dark:bg-orange-600/90 text-white shadow-xs font-semibold'
                              : 'text-blue-200 dark:text-night-muted hover:bg-blue-800/60 dark:hover:bg-white/5 hover:text-white dark:hover:text-night-text'
                          }
                        `}
                        title={isCollapsed ? item.label : undefined}
                      >
                        <item.icon size={16} className="shrink-0" />
                        {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </nav>

          {/* Pie de Sidebar (Cerrar Sesión) */}
          <div className="p-3 border-t border-blue-800/70 dark:border-night-divider flex flex-col gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                onMobileClose();
                onLogout();
              }}
              className={`flex items-center ${
                isCollapsed ? 'justify-center' : 'gap-3 px-3.5'
              } py-2.5 w-full rounded-xl text-blue-100 dark:text-night-muted hover:!bg-red-600/90 hover:text-white transition-all duration-150 outline-none text-xs sm:text-sm font-medium`}
              title={isCollapsed ? 'Cerrar Sesión' : undefined}
            >
              <LogOut size={19} className="shrink-0" />
              {!isCollapsed && <span className="whitespace-nowrap">Cerrar Sesión</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Backdrop para Drawer en dispositivos móviles.
          Capas: tarjetas de filtros (z-30/40) < fondo (z-45) < menú (z-46) < modales (z-50). */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-xs z-45 transition-opacity"
          onClick={onMobileClose}
        />
      )}
    </>
  );
};