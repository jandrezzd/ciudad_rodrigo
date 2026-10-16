import { ReactNode, useMemo, useState, useEffect, useRef } from 'react';
import { Sidebar } from '../Sidebar';
import { Menu } from 'lucide-react';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { ThemeToggle } from '../ThemeToggle';

interface LayoutProps {
  children: ReactNode;
  onLogout: () => void;
}

export const Layout = ({ children, onLogout }: LayoutProps) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const { user } = useAuth();

  // Referencias para aislar clics fuera del menú y del botón hamburguesa
  const sidebarContainerRef = useRef<HTMLDivElement>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);

  const roleLabel = useMemo(() => {
    if (!user?.role) return 'Usuario';
    const labels: Record<string, string> = {
      ADMIN: 'Administrador',
      SUPERVISOR: 'Supervisor',
      USER: 'Usuario',
    };
    return labels[user.role] ?? user.role;
  }, [user?.role]);

  const initials = useMemo(() => {
    if (!user?.name) return 'U';
    return (
      user.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || 'U'
    );
  }, [user?.name]);

  // Click outside listener: colapsa el sidebar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Si el clic fue en el botón de toggle, su propio onClick lo gestiona
      if (toggleBtnRef.current && toggleBtnRef.current.contains(target)) return;

      // Si el clic ocurrió fuera del contenedor del menú lateral
      if (sidebarContainerRef.current && !sidebarContainerRef.current.contains(target)) {
        if (!isSidebarCollapsed) setIsSidebarCollapsed(true);
        if (isMobileSidebarOpen) setIsMobileSidebarOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSidebarCollapsed, isMobileSidebarOpen]);

  return (
    <div className="h-screen w-full bg-[#faf8f5] dark:bg-night-bg flex overflow-hidden transition-colors duration-200">
      {/* Sidebar fijo referenciado para click-outside */}
      <div ref={sidebarContainerRef} className="h-full shrink-0 z-30">
        <Sidebar
          onLogout={onLogout}
          isCollapsed={isSidebarCollapsed}
          isMobileOpen={isMobileSidebarOpen}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
        />
      </div>

      {/* Contenedor fluido con aislamiento estricto de flexbox */}
      <div
        className={`flex-1 flex flex-col h-full min-h-0 min-w-0 transition-all duration-300 ease-in-out bg-[#faf8f5] dark:bg-night-bg overflow-hidden ${
          isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'
        }`}
      >
        {/* Header integrado al canvas con bordes semánticos */}
        <header className="px-6 py-3.5 flex items-center justify-between gap-4 shrink-0 bg-[#faf8f5]/90 dark:bg-night-bg/90 backdrop-blur-sm z-20 border-b border-stone-200/60 dark:border-night-border transition-colors duration-200">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="flex lg:hidden items-center justify-center p-2 text-stone-700 dark:text-night-muted bg-stone-200/50 dark:bg-night-surface hover:bg-stone-200/80 dark:hover:bg-night-hover rounded-xl transition-colors border border-stone-300/40 dark:border-night-border shadow-xs"
              title="Abrir menú"
              aria-label="Abrir menú móvil"
              type="button"
            >
              <Menu size={18} />
            </button>
            <button
              ref={toggleBtnRef}
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              className="hidden lg:flex items-center justify-center p-2 text-stone-700 dark:text-night-muted bg-stone-200/50 dark:bg-night-surface hover:bg-stone-200/80 dark:hover:bg-night-hover rounded-xl transition-colors border border-stone-300/40 dark:border-night-border shadow-xs"
              title={isSidebarCollapsed ? 'Expandir Menú' : 'Colapsar Menú'}
              aria-label={isSidebarCollapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'}
              type="button"
            >
              <Menu size={18} />
            </button>
          </div>

          {/* Acciones a la derecha: Toggle de tema + Perfil de usuario */}
          <div className="flex items-center gap-3">
            <ThemeToggle />

            {user && (
              <div className="flex items-center gap-3 bg-stone-200/40 dark:bg-night-surface border border-stone-300/40 dark:border-night-border rounded-2xl px-3.5 py-1.5 transition-colors">
                <div className="text-right">
                  <p className="text-xs font-semibold text-gray-900 dark:text-night-text leading-tight">{user.name}</p>
                  <p className="text-[10px] text-stone-500 dark:text-night-muted font-medium">{roleLabel}</p>
                </div>
                <div className="h-7 w-7 rounded-full bg-[#0B1A42] dark:bg-blue-600 text-white flex items-center justify-center text-xs font-semibold shadow-xs">
                  {initials}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Área de trabajo con contención responsiva real sin desbordamiento */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 pt-3 pb-6 min-h-0 min-w-0 bg-[#faf8f5] dark:bg-night-bg transition-colors duration-200">
          <div className="w-full max-w-full min-w-0 pb-16">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};