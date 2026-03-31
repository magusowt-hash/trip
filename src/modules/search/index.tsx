'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useDebounce } from '@/hooks/useDebounce';

type SearchInputProps = {
  onSearch?: (keyword: string) => void;
  compact?: boolean;
};

export function SearchInput({ onSearch, compact = false }: SearchInputProps) {
  const [keyword, setKeyword] = useState('');
  const debounced = useDebounce(keyword, 400);
  const [showError, setShowError] = useState(false);

  const [muted, setMuted] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    // 主题持久化，仅做前端 UI 切换（不会影响其它业务逻辑）
    try {
      const saved = window.localStorage.getItem('trip-theme');
      const next = saved === 'dark' ? 'dark' : 'light';
      setTheme(next);
      document.documentElement.dataset.theme = next;
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      document.documentElement.dataset.theme = theme;
      window.localStorage.setItem('trip-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  function handleSearch() {
    if (!keyword.trim()) {
      setShowError(true);
      return;
    }

    setShowError(false);
    onSearch?.(keyword.trim());
  }

  return (
    <div className={compact ? 'search-compact-root' : 'grid'}>
      {compact ? (
        <div className="search-compact-inline">
          <div className="search-compact-input-wrap">
            <input
              type="text"
              placeholder="输入目的地 / 关键词"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
              }}
              aria-label="搜索目的地"
              className="search-compact-input"
            />
            <button
              type="button"
              className="search-compact-icon-btn search-compact-mag-btn"
              aria-label="搜索"
              onClick={handleSearch}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </button>
          </div>

          <div className="search-compact-right-actions" aria-hidden={false}>
            <button
              type="button"
              className="search-compact-icon-btn search-compact-action search-compact-icon-btn--sound"
              aria-label={muted ? '取消静音' : '静音'}
              onClick={() => setMuted((v) => !v)}
            >
              {muted ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path d="M23 9l-6 6" />
                  <path d="M17 9l6 6" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                  <path d="M18 6a8 8 0 0 1 0 12" />
                </svg>
              )}
            </button>

            <button
              type="button"
              className="search-compact-icon-btn search-compact-action search-compact-icon-btn--theme"
              aria-label={theme === 'dark' ? '切换为亮色模式' : '切换为暗色模式'}
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? (
                // Sun（切到亮色）
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2" />
                  <path d="M12 20v2" />
                  <path d="M4.93 4.93l1.41 1.41" />
                  <path d="M17.66 17.66l1.41 1.41" />
                  <path d="M2 12h2" />
                  <path d="M20 12h2" />
                  <path d="M6.34 17.66l-1.41 1.41" />
                  <path d="M19.07 4.93l-1.41 1.41" />
                </svg>
              ) : (
                // Moon（切到暗色）
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Input
            label="目的地关键词"
            placeholder="输入目的地 / 关键词"
            value={keyword}
            error={showError ? '请输入关键词后再搜索' : undefined}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Button type="button" onClick={handleSearch}>搜索</Button>
        </div>
      )}
      {!compact ? <small style={{ color: 'var(--color-text-muted)' }}>防抖结果：{debounced || '（暂无）'}</small> : null}
      {compact && showError ? <small style={{ color: 'var(--color-danger)' }}>请输入关键词后再搜索</small> : null}
    </div>
  );
}
