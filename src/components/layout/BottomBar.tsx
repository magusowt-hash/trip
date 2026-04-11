'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePublishFlow } from './PublishFlowProvider';
import { PRIMARY_NAV_TABS } from './navTabs';

const tabs = PRIMARY_NAV_TABS;

function getTabStyle(isActive: boolean) {
  return {
    color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
    fontWeight: isActive ? 700 : 500,
  };
}

function BottomBarLink({ href, label, isActive }: { href: string; label: string; isActive: boolean }) {
  return (
    <Link href={href} className="app-bottom-link" style={getTabStyle(isActive)}>
      {label}
    </Link>
  );
}

export function BottomBar() {
  const pathname = usePathname();
  const { openPublish } = usePublishFlow();

  return (
    <nav className="app-bottom-nav">
      <div className="container app-bottom-shell">
        <div className="row app-bottom-inner">
          {tabs.slice(0, 2).map((tab) => {
            const active = pathname === tab.href;
            return <BottomBarLink key={tab.href} href={tab.href} label={tab.label} isActive={active} />;
          })}

          <div className="app-bottom-gap" />

          {tabs.slice(2).map((tab) => {
            const active = pathname === tab.href;
            return <BottomBarLink key={tab.href} href={tab.href} label={tab.label} isActive={active} />;
          })}
        </div>

        <button type="button" aria-label="打开发布浮窗" className="app-bottom-create" onClick={() => openPublish()}>
          +
        </button>
      </div>
    </nav>
  );
}
