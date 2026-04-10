import { getDefaultAvatar } from '@/store/userStore';

/** 主导航（侧栏三项；个人入口在侧栏底栏） */
export const PRIMARY_NAV_TABS = [
  { href: '/explore', label: '发现' },
  { href: '/plan', label: '计划' },
  { href: '/messages', label: '消息' },
] as const;

/** 侧栏底栏个人区（头像 + 昵称，不展示「我的」文案） */
export const SIDEBAR_PROFILE = {
  href: '/user',
  nickname: '旅行用户',
  avatar: '/default-avatar.svg',
} as const;

export function getProfileDisplay(profile: { nickname: string | null; avatar: string | null } | null) {
  return {
    nickname: profile?.nickname || SIDEBAR_PROFILE.nickname,
    avatar: profile?.avatar || getDefaultAvatar(),
  };
}
