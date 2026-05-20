'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { AdminAuthCtx } from './admin-auth';
import styles from './layout.module.css';
import {
  type ManagementNavGroup,
  getDashboardNavItem,
  getGroupedManagementNav,
  getManagementNavItem,
} from './nav-config';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    checkSession();
  }, []);

  const clearStoredAdminToken = () => {
    localStorage.removeItem('admin_token');
    setToken(null);
  };

  async function checkSession() {
    try {
      const res = await fetch('/api/admin/auth/session');
      const data = await res.json();
      if (data.authenticated) {
        setIsAuthenticated(true);
        setToken(localStorage.getItem('admin_token'));
      } else {
        clearStoredAdminToken();
        setIsAuthenticated(false);
      }
    } catch {
      clearStoredAdminToken();
      setIsAuthenticated(false);
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
    clearStoredAdminToken();
    router.push('/management/login');
  };

  const isLoginPage = pathname === '/management/login';
  const currentItem = getManagementNavItem(pathname);
  const dashboardItem = getDashboardNavItem();
  const groupedNav = getGroupedManagementNav();
  const currentTitle = currentItem?.label ?? '管理后台';
  const [collapsedGroups, setCollapsedGroups] = useState<Record<ManagementNavGroup['key'], boolean>>({
    system: false,
    user: false,
  });

  useEffect(() => {
    const nextCollapsed: Record<ManagementNavGroup['key'], boolean> = {
      system: currentItem?.group === 'user',
      user: currentItem?.group === 'system',
    };
    setCollapsedGroups((prev) => {
      if (prev.system === nextCollapsed.system && prev.user === nextCollapsed.user) {
        return prev;
      }
      return nextCollapsed;
    });
  }, [currentItem?.group]);

  const toggleGroup = (groupKey: ManagementNavGroup['key']) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  if (isLoginPage) {
    return (
      <AdminAuthCtx.Provider value={{ isAuthenticated, token, setAuthenticated: (t) => { localStorage.setItem('admin_token', t); setToken(t); setIsAuthenticated(true); }, logout: handleLogout }}>
        <main className={styles.loginContent}>{children}</main>
      </AdminAuthCtx.Provider>
    );
  }

  return (
    <AdminAuthCtx.Provider value={{ isAuthenticated, token, setAuthenticated: (t) => { localStorage.setItem('admin_token', t); setToken(t); setIsAuthenticated(true); }, logout: handleLogout }}>
      <div className={styles.root}>
        <div className={styles.shell}>
          {isAuthenticated && (
            <aside className={styles.sidebar}>
              <div className={styles.sidebarInner}>
                <div className={styles.brandBlock}>
                  <Link href="/management" className={styles.brandLink}>
                    <span className={styles.brandTitle}>管理后台</span>
                  </Link>
                </div>

                <div className={styles.sidebarScrollArea}>
                  <div className={styles.sidebarSection}>
                    <div className={styles.navList}>
                      <Link
                        href={dashboardItem.path}
                        className={`${styles.dashboardLink} ${pathname === dashboardItem.path ? styles.dashboardLinkActive : ''}`}
                      >
                        <span className={styles.navLabel}>{dashboardItem.label}</span>
                      </Link>
                    </div>
                  </div>

                  {groupedNav.map((group) => {
                    const isCollapsed = collapsedGroups[group.key];
                    return (
                      <section key={group.key} className={styles.sidebarSection}>
                        <button
                          type="button"
                          className={styles.sectionToggle}
                          onClick={() => toggleGroup(group.key)}
                          aria-expanded={!isCollapsed}
                        >
                          <span className={styles.sectionHeading}>
                            <span className={styles.sectionTitle}>{group.label}</span>
                          </span>
                          <span className={`${styles.sectionChevron} ${isCollapsed ? styles.sectionChevronCollapsed : ''}`}>
                            ▾
                          </span>
                        </button>
                        {!isCollapsed ? (
                          <nav className={styles.navList}>
                            {group.items.map((item) => {
                              const isActive = currentItem?.path === item.path;
                              return (
                                <Link
                                  key={item.path}
                                  href={item.path}
                                  className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                                >
                                  <span className={styles.navLabel}>{item.label}</span>
                                </Link>
                              );
                            })}
                          </nav>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              </div>
            </aside>
          )}

          <div className={styles.contentArea}>
            {isAuthenticated && (
              <header className={styles.topbar}>
                <div className={styles.topbarMeta}>
                  <h1 className={styles.topbarTitle}>{currentTitle}</h1>
                  <div className={styles.breadcrumb}>
                    <Link href="/management" className={styles.breadcrumbHome}>管理后台</Link>
                    {pathname !== '/management' ? <span>/</span> : null}
                    {pathname !== '/management' ? <span>{currentTitle}</span> : null}
                  </div>
                </div>
                <button className={styles.logoutButton} onClick={handleLogout}>退出登录</button>
              </header>
            )}

            <main className={styles.content}>
              <div className={styles.contentInner}>{children}</div>
            </main>
          </div>
        </div>
      </div>
    </AdminAuthCtx.Provider>
  );
}
