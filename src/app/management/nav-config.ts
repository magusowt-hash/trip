export type ManagementGroupKey = 'dashboard' | 'system' | 'user';

export interface ManagementNavItem {
  path: string;
  label: string;
  description?: string;
  group: ManagementGroupKey;
  order: number;
  shortLabel?: string;
}

export interface ManagementNavGroup {
  key: Exclude<ManagementGroupKey, 'dashboard'>;
  label: string;
  description: string;
}

export const managementNavGroups: ManagementNavGroup[] = [
  {
    key: 'system',
    label: '系统管理',
    description: '配置、基础设施与系统级能力',
  },
  {
    key: 'user',
    label: '用户管理',
    description: '用户、内容与运营数据管理',
  },
];

export const managementNavItems: ManagementNavItem[] = [
  {
    path: '/management',
    label: '看板',
    description: '查看后台概览与重点入口',
    group: 'dashboard',
    order: 0,
    shortLabel: 'KB',
  },
  {
    path: '/management/keys',
    label: '密钥管理',
    description: '管理系统密钥',
    group: 'system',
    order: 10,
    shortLabel: 'MY',
  },
  {
    path: '/management/maps',
    label: '地图管理',
    description: '地图显示与数据管理',
    group: 'system',
    order: 20,
    shortLabel: 'DT',
  },
  {
    path: '/management/embed-logs',
    label: '嵌入访问',
    description: '查看嵌入页访问情况',
    group: 'system',
    order: 30,
    shortLabel: 'QR',
  },
  {
    path: '/management/alist',
    label: '网盘配置',
    description: '管理 AList 云存储配置',
    group: 'system',
    order: 40,
    shortLabel: 'WP',
  },
  {
    path: '/management/users',
    label: '用户管理',
    description: '管理注册用户',
    group: 'user',
    order: 10,
    shortLabel: 'YH',
  },
  {
    path: '/management/posts',
    label: '帖子管理',
    description: '审核与管理帖子',
    group: 'user',
    order: 20,
    shortLabel: 'TZ',
  },
  {
    path: '/management/comments',
    label: '评论管理',
    description: '管理用户评论',
    group: 'user',
    order: 30,
    shortLabel: 'PL',
  },
  {
    path: '/management/plans',
    label: '旅行计划',
    description: '查看和管理旅行计划',
    group: 'user',
    order: 40,
    shortLabel: 'JH',
  },
  {
    path: '/management/markers',
    label: '标记点',
    description: '管理地图标记点',
    group: 'user',
    order: 50,
    shortLabel: 'BJ',
  },
  {
    path: '/management/lists',
    label: '榜单管理',
    description: '管理推荐榜单',
    group: 'user',
    order: 60,
    shortLabel: 'BD',
  },
  {
    path: '/management/list_items',
    label: '榜单项',
    description: '管理榜单内容',
    group: 'user',
    order: 70,
    shortLabel: 'BX',
  },
  {
    path: '/management/packing',
    label: '行李清单',
    description: '管理行李模板',
    group: 'user',
    order: 80,
    shortLabel: 'XL',
  },
  {
    path: '/management/footprints',
    label: '足迹分组',
    description: '管理足迹数据',
    group: 'user',
    order: 90,
    shortLabel: 'ZJ',
  },
];

function sortNavItems(items: ManagementNavItem[]) {
  return [...items].sort((a, b) => a.order - b.order);
}

export function getDashboardNavItem() {
  return managementNavItems.find((item) => item.group === 'dashboard') ?? managementNavItems[0];
}

export function getGroupedManagementNav() {
  return managementNavGroups.map((group) => ({
    ...group,
    items: sortNavItems(managementNavItems.filter((item) => item.group === group.key)),
  }));
}

export function getManagementNavItem(pathname: string) {
  const sortedItems = [...managementNavItems].sort((a, b) => b.path.length - a.path.length);
  return sortedItems.find((item) => {
    if (item.path === '/management') {
      return pathname === item.path;
    }
    return pathname === item.path || pathname.startsWith(`${item.path}/`);
  }) ?? null;
}
