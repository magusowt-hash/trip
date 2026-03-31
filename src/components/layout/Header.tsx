'use client';

import Link from 'next/link';
import { usePublishFlow } from '@/components/layout/PublishFlowProvider';
import { SearchInput } from '@/modules/search';

export function Header() {
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
          <div className="app-header-search-inline">
            <SearchInput compact />
          </div>
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
        </div>
      </div>
    </header>
  );
}
