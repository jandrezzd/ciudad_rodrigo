import { ReactNode, useMemo, useState } from 'react';
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

    return user.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'U';
  }, [user?.name]);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar
        onLogout={onLogout}
        isCollapsed={isSidebarCollapsed}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />
      <div className={`flex-1 w-full transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        <main className="p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 sticky top-0 z-30 bg-gray-50/90 backdrop-blur supports-[backdrop-filter]:bg-gray-50/70">
            <div className="pt-0.5 shrink-0 flex items-center gap-2">
              <button
                onClick={() => setIsMobileSidebarOpen(true)}
                className="flex lg:hidden items-center justify-center p-2 text-gray-600 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-100 transition-colors"
                title="Abrir menú"
              >
                <Menu size={20} />
              </button>
              <button
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="hidden lg:flex items-center justify-center p-2 text-gray-600 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-100 transition-colors"
                title={isSidebarCollapsed ? "Expandir Menú" : "Colapsar Menú"}
              >
                <Menu size={20} />
              </button>
            </div>

            {user && (
              <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-2 shadow-sm">
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900 leading-tight">{user.name}</p>
                  <p className="text-xs text-gray-500">{roleLabel}</p>
                </div>
                <div className="h-9 w-9 rounded-full bg-blue-900 text-white flex items-center justify-center text-sm font-semibold">
                  {initials}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
