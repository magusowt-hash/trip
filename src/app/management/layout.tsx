'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { AdminAuthCtx } from './admin-auth';

const navItems = [
  { path: '/management', icon: '📊', label: '看板' },
  { path: '/management/users', icon: '👥', label: '用户管理' },
  { path: '/management/posts', icon: '📝', label: '帖子管理' },
  { path: '/management/comments', icon: '💬', label: '评论管理' },
  { path: '/management/plans', icon: '✈️', label: '旅行计划' },
  { path: '/management/keys', icon: '🔑', label: '密钥管理' },
  { path: '/management/markers', icon: '📍', label: '标记点' },
  { path: '/management/lists', icon: '🏆', label: '榜单管理' },
  { path: '/management/list_items', icon: '📋', label: '榜单项' },
  { path: '/management/packing', icon: '🎒', label: '行李清单' },
  { path: '/management/embed-logs', icon: '📈', label: '嵌入访问' },
  { path: '/management/alist', icon: '☁️', label: '网盘配置' },
  { path: '/management/maps', icon: '🗺️', label: '地图管理' },
  { path: '/management/footprints', icon: '👣', label: '足迹分组' },
];

function getBreadcrumb(pathname: string) {
  const item = navItems.find((n) => n.path !== '/management' && pathname.startsWith(n.path));
  if (!item) return null;
  return item.label;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const res = await fetch('/api/admin/auth/session');
      const data = await res.json();
      if (data.authenticated) {
        setIsAuthenticated(true);
        setToken(localStorage.getItem('admin_token'));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!loading && !isAuthenticated && pathname !== '/management/login') {
      router.push('/management/login');
    }
  }, [pathname, isAuthenticated, loading, router]);

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setIsAuthenticated(false);
    setToken(null);
    router.push('/management/login');
  };

  const isLoginPage = pathname === '/management/login';
  const isHomePage = pathname === '/management';
  const breadcrumb = getBreadcrumb(pathname);

  return (
    <AdminAuthCtx.Provider value={{ isAuthenticated, token, setAuthenticated: (t) => { localStorage.setItem('admin_token', t); setToken(t); setIsAuthenticated(true); }, logout: handleLogout }}>
      <div className="admin-root">
        {isAuthenticated && !isLoginPage && !isHomePage && (
          <header className="admin-topbar">
            <div className="topbar-left">
              <Link href="/management" className="topbar-home">管理后台</Link>
              {breadcrumb && (
                <>
                  <span className="topbar-sep">/</span>
                  <span className="topbar-current">{breadcrumb}</span>
                </>
              )}
            </div>
            <button className="topbar-logout" onClick={handleLogout}>退出登录</button>
          </header>
        )}
        <main className={`admin-content ${isLoginPage ? 'login-page' : ''}`}>{children}</main>
      </div>
      <style>{`
        * { box-sizing: border-box; }
        .admin-root { min-height: 100vh; background: var(--color-bg, #f7f8fa); }
        .admin-topbar {
          position: sticky; top: 0; z-index: 50;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 32px; height: 56px;
          background: var(--color-surface, #fff);
          border-bottom: 1px solid var(--color-border, #e5e7eb);
        }
        .topbar-left { display: flex; align-items: center; gap: 8px; }
        .topbar-home {
          font-size: 15px; font-weight: 600; color: var(--color-primary, #2563eb);
          text-decoration: none; transition: opacity 0.15s;
        }
        .topbar-home:hover { opacity: 0.7; }
        .topbar-sep { color: var(--color-text-muted, #6b7280); font-size: 14px; }
        .topbar-current { font-size: 15px; font-weight: 500; color: var(--color-text, #1f2937); }
        .topbar-logout {
          background: none; border: 1px solid var(--color-border, #e5e7eb);
          color: var(--color-text-muted, #6b7280); padding: 6px 14px;
          border-radius: 6px; font-size: 13px; cursor: pointer; transition: all 0.15s;
        }
        .topbar-logout:hover { border-color: var(--color-danger, #dc2626); color: var(--color-danger, #dc2626); }
        .admin-content { max-width: 1280px; margin: 0 auto; padding: 24px 32px; }
        .admin-content.login-page { max-width: none; padding: 0; }
      `}</style>
    </AdminAuthCtx.Provider>
  );
}
