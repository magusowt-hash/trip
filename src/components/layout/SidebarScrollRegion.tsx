import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** 可选，用于无障碍（如「帖子分类」「功能与服务」） */
  'aria-label'?: string;
};

/**
 * 侧栏中间「小列表」统一滚动容器：与主导航、底栏分离，仅内部纵向滚动。
 * 发现页分类、我的页功能列表均使用此组件。
 */
export function SidebarScrollRegion({ children, ...rest }: Props) {
  return (
    <div className="explore-sidebar__scroll" role="region" {...rest}>
      {children}
    </div>
  );
}
