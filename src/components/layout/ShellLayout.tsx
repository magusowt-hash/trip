'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { ExploreFeedProvider } from '@/components/layout/ExploreFeedContext';

/** 页眉由根 layout 统一渲染，此处只负责侧栏 + 主区 */
export function ShellLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const wideMainLayout =
    pathname === '/explore' ||
    pathname.startsWith('/explore/') ||
    pathname === '/user' ||
    pathname.startsWith('/user/') ||
    pathname === '/plan' ||
    pathname.startsWith('/plan/');

  return (
    <ExploreFeedProvider>
      <main className="shell-root shell-root--scroll-lock">
        <section
          className={`page page-no-bottom-nav shell-page-full${wideMainLayout ? ' shell-page--explore-feed' : ''}`}
        >
          <div className="explore-layout explore-layout--flush">
            <AppSidebar />
            <div className="shell-main shell-main--gutter">{children}</div>
          </div>
        </section>
      </main>
    </ExploreFeedProvider>
  );
}
