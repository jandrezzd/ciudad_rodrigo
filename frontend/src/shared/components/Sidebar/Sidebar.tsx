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

// Grupo "Ventas" — filtrado por el permiso "Ver" de cada módulo, no por rol.
const ventasItemsAll: NavItem[] = [
  { path: ROUTES.VENTAS_MATERIAL, icon: PackageCheck, label: 'Venta de material', moduloKey: 'ventas' },
  { path: ROUTES.VENTAS_ORDENES, icon: FileText, label: 'Órdenes de venta', moduloKey: 'ventas-ordenes' },
];

// Grupo "Administración" — ídem. "Roles y permisos" vive acá también.
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

  /**
   * "Ver" en cada módulo decide qué aparece acá — reemplaza las listas fijas
   * por rol que había antes. Solo dos casos quedan por NOMBRE de rol (no por
   * permiso), a propósito: Jefe de Obra usa una ruta de Registro Transporte
   * distinta a la de ADMIN (RoleBasedTransportLogJefe en el router, que
   * tampoco se tocó), y el ADMIN de cédula especial ve además ese mismo
   * acceso como un ítem aparte — igual que ya funcionaba.
   */
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

  // Highlight administration menu if any of its children are active
  const isAdminActive = adminItems.some((item) => location.pathname.startsWith(item.path));

  // Automatically open the submenu if an admin item is active initially
  useEffect(() => {
    if (isAdminActive) {
      setIsAdminOpen(true);
    }
  }, [isAdminActive]);

  // Mismo comportamiento para el grupo de Ventas
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
          fixed top-0 left-0 h-full bg-gradient-to-b from-blue-900 to-blue-950 text-white
          ${isCollapsed ? 'w-20' : 'w-64'} transform transition-all duration-300 ease-in-out z-40
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        <div className="flex flex-col h-full">
          <div className={`p-6 border-b border-blue-800 flex items-center justify-center transition-all min-h-[113px]`}>
            {isCollapsed ? (
              <div className="h-16 flex items-center justify-center text-orange-500 font-bold text-2xl">CR</div>
            ) : (
              <img src={logo} alt="Constructora Ciudad Rodrigo Logo" className="w-auto h-16 object-contain" />
            )}
          </div>

          <nav className="flex-1 px-3 py-6 space-y-2 overflow-y-auto overflow-x-hidden no-scrollbar">
            {/* Main Nav Links */}
            {mainNavItems.map((item, index) => (
              <NavLink
                key={`${item.path}-${index}`}
                to={item.path}
                onClick={onMobileClose}
                className={({ isActive }) => `
                  flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-lg transition-all duration-200
                  ${isActive
                    ? 'bg-orange-500 text-white shadow-lg'
                    : 'text-blue-100 hover:bg-blue-800 hover:text-white'
                  }
                `}
                title={isCollapsed ? item.label : undefined}
              >
                <item.icon size={20} className="shrink-0" />
                {!isCollapsed && <span className="font-medium whitespace-nowrap">{item.label}</span>}
              </NavLink>
            ))}

            {/* Ventas Collapsible Menu — visible si hay algún módulo de ventas con permiso de Ver */}
            {ventasItems.length > 0 && (
              <div>
                <button
                  onClick={() => setIsVentasOpen(!isVentasOpen)}
                  className={`
                    w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-between px-4'} py-3 rounded-lg transition-all duration-200
                    ${isVentasActive && !isVentasOpen ? 'text-orange-400' : 'text-blue-100 hover:bg-blue-800 hover:text-white'}
                  `}
                  title={isCollapsed ? 'Ventas' : undefined}
                >
                  <div className={`flex items-center ${isCollapsed ? '' : 'gap-3'}`}>
                    <HandCoins size={20} className={`shrink-0 ${isVentasActive ? 'text-orange-400' : ''}`} />
                    {!isCollapsed && <span className={`font-medium whitespace-nowrap ${isVentasActive ? 'text-orange-400' : ''}`}>Ventas</span>}
                  </div>
                  {!isCollapsed && (isVentasOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                </button>

                <div
                  className={`overflow-hidden transition-all duration-500 ease-in-out bg-blue-900/40 rounded-lg ${isVentasOpen ? 'max-h-[500px] opacity-100 mt-1' : 'max-h-0 opacity-0 mt-0 pointer-events-none'
                    }`}
                >
                  <div className={`${isCollapsed ? 'flex flex-col items-center gap-2 py-2' : 'ml-4 pl-4 border-l border-blue-800 space-y-1 py-1'}`}>
                    {ventasItems.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={onMobileClose}
                        className={({ isActive }) => `
                          flex items-center ${isCollapsed ? 'justify-center w-10 h-10' : 'gap-3 px-4 py-2.5'} rounded-lg transition-all duration-200 text-sm
                          ${isActive
                            ? 'bg-orange-500 text-white shadow-md'
                            : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                          }
                        `}
                        title={isCollapsed ? item.label : undefined}
                      >
                        <item.icon size={18} className="shrink-0" />
                        {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Administration Collapsible Menu — visible si hay algún módulo administrativo con permiso de Ver */}
            {adminItems.length > 0 && (
              <div>
                <button
                  onClick={() => setIsAdminOpen(!isAdminOpen)}
                  className={`
                    w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-between px-4'} py-3 rounded-lg transition-all duration-200
                    ${isAdminActive && !isAdminOpen ? 'text-orange-400' : 'text-blue-100 hover:bg-blue-800 hover:text-white'}
                  `}
                  title={isCollapsed ? 'Administración' : undefined}
                >
                  <div className={`flex items-center ${isCollapsed ? '' : 'gap-3'}`}>
                    <Settings size={20} className={`shrink-0 ${isAdminActive ? 'text-orange-400' : ''}`} />
                    {!isCollapsed && <span className={`font-medium whitespace-nowrap ${isAdminActive ? 'text-orange-400' : ''}`}>Administración</span>}
                  </div>
                  {!isCollapsed && (isAdminOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                </button>

                <div
                  className={`overflow-hidden transition-all duration-500 ease-in-out bg-blue-900/40 rounded-lg ${isAdminOpen ? 'max-h-[500px] opacity-100 mt-1' : 'max-h-0 opacity-0 mt-0 pointer-events-none'
                    }`}
                >
                  <div className={`${isCollapsed ? 'flex flex-col items-center gap-2 py-2' : 'ml-4 pl-4 border-l border-blue-800 space-y-1 py-1'}`}>
                    {adminItems.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={onMobileClose}
                        className={({ isActive }) => `
                          flex items-center ${isCollapsed ? 'justify-center w-10 h-10' : 'gap-3 px-4 py-2.5'} rounded-lg transition-all duration-200 text-sm
                          ${isActive
                            ? 'bg-orange-500 text-white shadow-md'
                            : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                          }
                        `}
                        title={isCollapsed ? item.label : undefined}
                      >
                        <item.icon size={18} className="shrink-0" />
                        {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </nav>

          <div className="p-4 border-t border-blue-800 flex flex-col gap-2">
            <button
              onClick={() => {
                onMobileClose();
                onLogout();
              }}
              className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 w-full rounded-lg text-blue-100 hover:bg-red-600 hover:text-white transition-all duration-200`}
              title={isCollapsed ? "Cerrar Sesión" : undefined}
            >
              <LogOut size={20} className="shrink-0" />
              {!isCollapsed && <span className="font-medium whitespace-nowrap">Cerrar Sesión</span>}
            </button>
          </div>
        </div>
      </aside>

      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={onMobileClose}
        />
      )}
    </>
  );
};
