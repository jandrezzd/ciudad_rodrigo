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
  BrickWall
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { ROUTES } from '@/config/constants';
import logo from '@/img/lgooo.png';
import { useAuth } from '@/modules/auth/hooks/useAuth';

// Todos los items del nav principal (Administrador)
const allMainNavItems = [
  { path: ROUTES.DASHBOARD, icon: LayoutDashboard, label: 'Dashboard' },
  { path: ROUTES.PLANIFICACION, icon: CalendarClock, label: 'Planificación' },
  { path: ROUTES.TRANSPORT_LOG, icon: ClipboardList, label: 'Registro Transporte' },
  { path: ROUTES.REPORTES, icon: BarChart3, label: 'Reportes' },
];

// Items adicionales solo para ADMIN con cédula específica
const adminSpecialNavItems = [
  { path: ROUTES.TRANSPORT_LOG_JEFE, icon: ClipboardList, label: 'Jefe de Obra' },
];

// Items visibles para JEFE_DE_OBRA en el nav principal
const jefeDeObraNavItems = [
  { path: ROUTES.VEHICLES, icon: Truck, label: 'Vehículos' },
  { path: ROUTES.PROVEEDORES, icon: Truck, label: 'Proveedores' },
  { path: ROUTES.TRANSPORT_LOG_JEFE, icon: ClipboardList, label: 'Registro Transporte' },
  { path: ROUTES.REPORTES, icon: BarChart3, label: 'Reportes' },
];

const adminItems = [
  { path: ROUTES.PROVEEDORES, icon: Truck, label: 'Proveedores' },
  { path: ROUTES.PROVEEDORES_MATERIALES, icon: BrickWall, label: 'Prov. Material' },
  { path: ROUTES.VEHICLES, icon: Truck, label: 'Vehículos' },
  { path: ROUTES.CLIENTES, icon: Users, label: 'Clientes' },
  { path: ROUTES.OBRAS, icon: Building2, label: 'Obras' },
  { path: ROUTES.USERS, icon: UserCog, label: 'Usuarios' },
];

interface SidebarProps {
  onLogout: () => void;
  isCollapsed: boolean;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

export const Sidebar = ({ onLogout, isCollapsed, isMobileOpen, onMobileClose }: SidebarProps) => {
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  const isJefeDeObra = user?.role === 'JEFE_DE_OBRA';
  const isAdmin = user?.role === 'ADMIN';
  const isAdminSpecial = isAdmin && user?.document === '1307857902';

  // Items de navegación según el rol
  let mainNavItems = isJefeDeObra ? jefeDeObraNavItems : allMainNavItems;
  
  // Insertar Jefe de Obra en posición correcta si es ADMIN con cédula específica
  if (isAdminSpecial) {
    mainNavItems = [
      mainNavItems[0], // Dashboard
      mainNavItems[1], // Planificación
      mainNavItems[2], // Registro Transporte
      adminSpecialNavItems[0], // Jefe de Obra
      mainNavItems[3], // Reportes
    ];
  }

  // Highlight administration menu if any of its children are active
  const isAdminActive = adminItems.some((item) => location.pathname.startsWith(item.path));

  // Automatically open the submenu if an admin item is active initially
  useEffect(() => {
    if (isAdminActive) {
      setIsAdminOpen(true);
    }
  }, [isAdminActive]);

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

          <nav className="flex-1 px-3 py-6 space-y-2 overflow-y-auto overflow-x-hidden">
            {/* Main Nav Links */}
            {mainNavItems.map((item) => (
              <NavLink
                key={item.path}
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

            {/* Administration Collapsible Menu — solo para ADMIN */}
            {isAdmin && (
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
