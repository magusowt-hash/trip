'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { EXPLORE_CATEGORIES, useExploreFeed } from '@/components/layout/ExploreFeedContext';
import { PRIMARY_NAV_TABS, SIDEBAR_PROFILE } from '@/components/layout/navTabs';
import { SidebarScrollRegion } from '@/components/layout/SidebarScrollRegion';
import { UserProfileSidebarNav } from '@/components/layout/user-profile-menu';

function isPrimaryNavActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar() {
  const pathname = usePathname();
  const { activeCategory, setActiveCategory } = useExploreFeed();
  const showCategories = pathname === '/explore';
  const isUserPage = pathname === '/user' || pathname.startsWith('/user/');
  const profileActive = pathname === SIDEBAR_PROFILE.href || pathname.startsWith(`${SIDEBAR_PROFILE.href}/`);
  /** 有中间小列表时：整栏不滚，仅 SidebarScrollRegion 内滚动，底栏常驻 */
  const sidebarSplit = showCategories || isUserPage;

  return (
    <aside
      className={`explore-sidebar explore-sidebar--edge explore-sidebar--glass explore-sidebar--stack${
        sidebarSplit ? ' explore-sidebar--split' : ''
      }`}
    >
      <div className="explore-sidebar__main">
        <nav className="explore-sidebar-nav" aria-label="主导航">
          <div className="explore-nav-list">
            {PRIMARY_NAV_TABS.map((tab) => {
              const active = isPrimaryNavActive(pathname, tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`explore-nav-link${active ? ' explore-nav-link--active' : ''}`}
                  prefetch
                >
                  <span className="explore-nav-link__text">{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {showCategories ? (
          <>
            <div className="explore-sidebar-divider" aria-hidden />
            <SidebarScrollRegion aria-label="帖子分类">
              <div className="explore-categories" role="group">
                {EXPLORE_CATEGORIES.map((category) => {
                  const active = category === activeCategory;
                  return (
                    <button
                      key={category}
                      type="button"
                      className={`explore-category-btn${active ? ' explore-category-btn--active' : ''}`}
                      onClick={() => setActiveCategory(category)}
                    >
                      <span className="explore-category-btn__text">{category}</span>
                    </button>
                  );
                })}
              </div>
            </SidebarScrollRegion>
          </>
        ) : null}

        {isUserPage ? (
          <>
            <div className="explore-sidebar-divider" aria-hidden />
            <SidebarScrollRegion aria-label="功能与服务">
              <UserProfileSidebarNav />
            </SidebarScrollRegion>
          </>
        ) : null}
      </div>

        <div className="explore-sidebar__footer explore-sidebar__footer--row">
        <Link
          href={SIDEBAR_PROFILE.href}
          className={`explore-nav-link explore-sidebar-profile${profileActive ? ' explore-nav-link--active' : ''}`}
          prefetch
          aria-label={`${SIDEBAR_PROFILE.nickname}的个人主页`}
        >
          <img className="explore-sidebar-profile__avatar" src={SIDEBAR_PROFILE.avatar} alt="" width={36} height={36} />
          <span className="explore-nav-link__text">{SIDEBAR_PROFILE.nickname}</span>
        </Link>
      </div>
    </aside>
  );
}
