'use client';

import styles from './user-profile-menu.module.css';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0';

export const USER_MENU_GROUPS: {
  title: string;
  items: { label: string }[];
}[] = [
  {
    title: '旅行相关',
    items: [{ label: '我的行程' }, { label: '我的攻略' }, { label: '我的收藏' }],
  },
  {
    title: '账号相关',
    items: [{ label: '个人资料' }, { label: '钱包' }, { label: '会员' }],
  },
  {
    title: '系统',
    items: [{ label: '设置' }, { label: '帮助' }],
  },
];

const SLIDE_STEP_S = 0.05;
const SLIDE_BASE_S = 0.04;

/** 「我的」页侧栏：仅文字，由外层 SidebarScrollRegion（.explore-sidebar__scroll）包裹；滑入动画与发现页分类一致 */
export function UserProfileSidebarNav() {
  let itemSeq = 0;
  return (
    <nav className={styles.nav} aria-label="功能与服务">
      {USER_MENU_GROUPS.map((group) => (
        <div key={group.title} className={styles.group}>
          <div className={styles.groupTitle}>{group.title}</div>
          {group.items.map((item) => {
            const delay = SLIDE_BASE_S + itemSeq * SLIDE_STEP_S;
            itemSeq += 1;
            return (
              <button
                key={item.label}
                type="button"
                className={`${styles.item} explore-sidebar-slide-item`}
                style={{ animationDelay: `${delay}s` }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ))}
      <div className={styles.footer}>
        <button
          type="button"
          className={`${styles.logout} explore-sidebar-slide-item`}
          style={{ animationDelay: `${SLIDE_BASE_S + itemSeq * SLIDE_STEP_S}s` }}
        >
          退出登录
        </button>
        <span
          className={`${styles.version} explore-sidebar-slide-item`}
          style={{ animationDelay: `${SLIDE_BASE_S + (itemSeq + 1) * SLIDE_STEP_S}s` }}
        >
          版本 {APP_VERSION}
        </span>
      </div>
    </nav>
  );
}
