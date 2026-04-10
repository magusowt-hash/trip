'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePublishFlow } from './PublishFlowProvider';
import { PRIMARY_NAV_TABS } from './navTabs';

const tabs = PRIMARY_NAV_TABS;

export function BottomBar() {
  const pathname = usePathname();
  const { openPublish } = usePublishFlow();

  return (
    <nav className="app-bottom-nav">
      <div className="container app-bottom-shell">
        <div className="row app-bottom-inner">
          {tabs.slice(0, 2).map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link key={tab.href} href={tab.href} className="app-bottom-link" style={{ color: active ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: active ? 700 : 500 }}>
                {tab.label}
              </Link>
            );
          })}

          <div className="app-bottom-gap" />

          {tabs.slice(2).map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link key={tab.href} href={tab.href} className="app-bottom-link" style={{ color: active ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: active ? 700 : 500 }}>
                {tab.label}
              </Link>
            );
          })}
        </div>

        <button type="button" aria-label="打开发布浮窗" className="app-bottom-create" onClick={() => openPublish()}>
          +
        </button>
      </div>
    </nav>
  );
}
