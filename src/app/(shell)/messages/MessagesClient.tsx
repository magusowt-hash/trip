'use client';

import { useMemo, useState } from 'react';
import styles from './messages.module.css';

type TabKey = 'chat' | 'notice';

type InboxItem = {
  id: string;
  name: string;
  preview: string;
  time: string;
  unread: number;
  avatar: string;
  tag?: string;
};

const CHAT_CONVERSATIONS: InboxItem[] = [
  {
    id: '1',
    name: '旅行小助手',
    preview: '你收藏的「青岛海岸线」有新动态',
    time: '14:32',
    unread: 2,
    avatar: 'https://i.pravatar.cc/104?u=dy-a1',
    tag: '官方',
  },
  {
    id: '2',
    name: '江南慢行',
    preview: '[分享视频] 平江路的黄昏',
    time: '昨天',
    unread: 0,
    avatar: 'https://i.pravatar.cc/104?u=dy-a2',
  },
  {
    id: '3',
    name: '城市味道',
    preview: '好的，周末见～',
    time: '周一',
    unread: 1,
    avatar: 'https://i.pravatar.cc/104?u=dy-a3',
  },
  {
    id: '4',
    name: '订单通知',
    preview: '你有一笔退款待确认',
    time: '03-25',
    unread: 0,
    avatar: 'https://i.pravatar.cc/104?u=dy-a4',
    tag: '服务',
  },
];

const NOTICE_ITEMS: InboxItem[] = [
  {
    id: 'n1',
    name: '系统通知',
    preview: 'Trip 服务条款已更新',
    time: '03-22',
    unread: 0,
    avatar: 'https://i.pravatar.cc/104?u=dy-n1',
  },
  {
    id: 'n2',
    name: '互动消息',
    preview: '旅行用户 赞了你的动态',
    time: '03-20',
    unread: 3,
    avatar: 'https://i.pravatar.cc/104?u=dy-n2',
  },
];

export function MessagesClient() {
  const [tab, setTab] = useState<TabKey>('chat');

  const list: InboxItem[] = useMemo(() => (tab === 'chat' ? CHAT_CONVERSATIONS : NOTICE_ITEMS), [tab]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>消息</h1>
          <button type="button" className={styles.iconBtn} aria-label="添加好友">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" />
              <circle cx="8.5" cy="7" r="4" />
              <path d="M20 8v6M23 11h-6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'chat'}
            className={`${styles.tab} ${tab === 'chat' ? styles.tabActive : ''}`}
            onClick={() => setTab('chat')}
          >
            私信
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'notice'}
            className={`${styles.tab} ${tab === 'notice' ? styles.tabActive : ''}`}
            onClick={() => setTab('notice')}
          >
            通知
          </button>
        </div>
      </header>

      <div className={styles.list} role="tabpanel">
        {list.length === 0 ? (
          <p className={styles.emptyHint}>暂无消息</p>
        ) : (
          list.map((item) => (
            <button key={item.id} type="button" className={styles.convRow}>
              <img className={styles.avatar} src={item.avatar} alt="" />
              <div className={styles.body}>
                <div className={styles.rowTop}>
                  <span className={styles.name}>{item.name}</span>
                  <span className={styles.time}>{item.time}</span>
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.preview}>{item.preview}</span>
                  {item.tag ? <span className={styles.tag}>{item.tag}</span> : null}
                  {item.unread > 0 ? <span className={styles.badge}>{item.unread > 99 ? '99+' : item.unread}</span> : null}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
