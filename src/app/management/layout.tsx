'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

interface AdminAuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  setAuthenticated: (token: string) => void;
  logout: () => void;
}

export const AdminAuthCtx = createContext<AdminAuthCtxType>({
  isAuthenticated: false,
  token: null,
  setAuthenticated: () => {},
  logout: () => {},
});

export function useAdminAuth() {
  return useContext(AdminAuthCtx);
}

const navItems = [
  { path: '/management', icon: '📊', label: '看板' },
  { path: '/management/users', icon: '👥', label: '用户' },
  { path: '/management/posts', icon: '📝', label: '帖子' },
  { path: '/management/comments', icon: '💬', label: '评论' },
  { path: '/management/plans', icon: '✈️', label: '计划' },
  { path: '/management/keys', icon: '🔑', label: '密钥' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const storedToken = localStorage.getItem('admin_token');
    if (storedToken) {
      setToken(storedToken);
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated && pathname !== '/management/login') {
      router.push('/management/login');
    }
  }, [pathname, isAuthenticated, router]);

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setIsAuthenticated(false);
    setToken(null);
    router.push('/management/login');
  };

  return (
    <AdminAuthCtx.Provider value={{ isAuthenticated, token, setAuthenticated: (t) => { setToken(t); setIsAuthenticated(true); }, logout: handleLogout }}>
      <div className="admin-layout">
        {isAuthenticated && pathname !== '/management/login' && (
          <aside className="admin-sidebar">
            <div className="sidebar-header">
              <h2>管理后台</h2>
              <button className="logout-btn" onClick={handleLogout}>退出</button>
            </div>
            <nav className="sidebar-nav">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`nav-item ${pathname === item.path ? 'active' : ''}`}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </Link>
              ))}
            </nav>
          </aside>
        )}
        <main className="admin-main">{children}</main>
      </div>
      <style>{`
        .admin-layout { display: flex; min-height: 100vh; }
        .admin-sidebar {
          width: 200px; background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
          color: #fff; padding: 20px 0; position: fixed; height: 100vh;
        }
        .sidebar-header { padding: 0 20px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .sidebar-header h2 { margin: 0 0 15px; font-size: 18px; }
        .logout-btn {
          background: rgba(255,255,255,0.1); border: none; color: #fff;
          padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;
        }
        .logout-btn:hover { background: rgba(255,255,255,0.2); }
        .sidebar-nav { padding: 20px 0; }
        .nav-item {
          display: flex; align-items: center; padding: 12px 20px;
          color: rgba(255,255,255,0.7); text-decoration: none; transition: all 0.2s;
        }
        .nav-item:hover, .nav-item.active { background: rgba(255,255,255,0.1); color: #fff; }
        .nav-item.active { border-left: 3px solid #3b82f6; }
        .nav-icon { margin-right: 10px; font-size: 16px; }
        .nav-label { font-size: 14px; }
        .admin-main { flex: 1; margin-left: 200px; padding: 20px; background: #f5f5f5; }
      `}</style>
    </AdminAuthCtx.Provider>
  );
}