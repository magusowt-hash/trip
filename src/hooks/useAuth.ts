import { getUser } from '@/store/userStore';

export function useAuth() {
  const user = getUser();

  return {
    user,
    isLogin: Boolean(user),
  };
}
