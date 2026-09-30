import { ReactNode, useMemo, useState, useEffect, useRef } from 'react';
import { Sidebar } from '../Sidebar';
import { Menu } from 'lucide-react';
import { useAuth } from '@/modules/auth/hooks/useAuth';

interface LayoutProps {
  children: ReactNode;
  onLogout: () => void;
}

export const Layout = ({ children, onLogout }: LayoutProps) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const { user } = useAuth();

  // Referencias para aislar clics dentro del menú y del botón de hamburguesa
  const sidebarContainerRef = useRef<HTMLDivElement>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);

  const roleLabel = useMemo(() => {
    if (!user?.role) {
      return 'Usuario';
    }

    const labels: Record<string, string> = {
      ADMIN: 'Administrador',
      SUPERVISOR: 'Supervisor',
      USER: 'Usuario',
    };

    return labels[user.role] ?? user.role;
  }, [user?.role]);

  const initials = useMemo(() => {
    if (!user?.name) {
      return 'U';
    }

    return (
      user.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || 'U'
    );
  }, [user?.name]);

  // Click outside: al hacer clic en cualquier parte fuera del sidebar, se recoge
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Si el clic fue en el botón de hamburguesa, lo gestiona su propio onClick
      if (toggleBtnRef.current && toggleBtnRef.current.contains(target)) {
        return;
      }

      // Si el clic ocurrió fuera del menú lateral
      if (sidebarContainerRef.current && !sidebarContainerRef.current.contains(target)) {
        if (!isSidebarCollapsed) {
          setIsSidebarCollapsed(true);
        }
        if (isMobileSidebarOpen) {
          setIsMobileSidebarOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSidebarCollapsed, isMobileSidebarOpen]);

  return (
    <div className="h-screen w-full bg-[#faf8f5] flex overflow-hidden">
      {/* Contenedor referenciado para detectar clics fuera del sidebar */}
      <div ref={sidebarContainerRef} className="h-full">
        <Sidebar
          onLogout={onLogout}
          isCollapsed={isSidebarCollapsed}
          isMobileOpen={isMobileSidebarOpen}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
        />
      </div>

      {/* Contenedor central acotado al viewport */}
      <div
        className={`flex-1 min-w-0 h-full flex flex-col transition-all duration-300 ease-in-out bg-[#faf8f5] overflow-hidden ${
          isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'
        }`}
      >
        {/* Header integrado con el tono de fondo cálido */}
        <header className="px-6 py-4 flex items-center justify-between gap-4 shrink-0 bg-[#faf8f5]/90 backdrop-blur-sm z-20">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="flex lg:hidden items-center justify-center p-2 text-stone-700 bg-stone-200/50 hover:bg-stone-200/80 rounded-xl transition-colors border border-stone-300/40 shadow-xs"
              title="Abrir menú"
              type="button"
            >
              <Menu size={20} />
            </button>
            <button
              ref={toggleBtnRef}
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              className="hidden lg:flex items-center justify-center p-2 text-stone-700 bg-stone-200/50 hover:bg-stone-200/80 rounded-xl transition-colors border border-stone-300/40 shadow-xs"
              title={isSidebarCollapsed ? 'Expandir Menú' : 'Colapsar Menú'}
              type="button"
            >
              <Menu size={20} />
            </button>
          </div>

          {user && (
            <div className="flex items-center gap-3 bg-stone-200/40 hover:bg-stone-200/60 border border-stone-300/40 rounded-2xl px-3.5 py-1.5 transition-colors">
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900 leading-tight">{user.name}</p>
                <p className="text-[11px] text-stone-500 font-medium">{roleLabel}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-[#0B1A42] text-white flex items-center justify-center text-xs font-semibold shadow-xs">
                {initials}
              </div>
            </div>
          )}
        </header>

        {/* Área de trabajo con scroll interno y respiro inferior calibrado */}
        <main className="flex-1 overflow-y-auto px-6 pt-4 min-w-0 max-w-full bg-[#faf8f5]">
          <div className="w-full pb-16">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};