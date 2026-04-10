'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePublishFlow } from '@/components/layout/PublishFlowProvider';
import { SearchInput } from '@/modules/search';

interface HeaderProps {
  hideActionsValue?: boolean;
}

export function Header({ hideActionsValue = false }: HeaderProps) {
  const pathname = usePathname();
  const hideActionsValueValue = hideActionsValue || pathname === '/login' || pathname === '/register';
  const { openPublish } = usePublishFlow();

  return (
    <header className="app-header">
      <div className="container app-header-inner">
        <div className="app-header-main">
          <div className="app-header-brand">
            <Link href="/explore" className="app-header-logo">
              Trip
            </Link>
          </div>
          {!hideActionsValueValue && (
            <div className="app-header-search-inline">
              <SearchInput compact />
            </div>
          )}
          {!hideActionsValueValue && (
            <div className="app-header-actions">
              <button
                type="button"
                className="app-header-publish-btn"
                aria-label="发布新内容"
                onClick={() => openPublish()}
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
