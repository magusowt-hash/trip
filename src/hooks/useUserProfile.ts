import { useUserProfileContext } from '@/store/UserProfileContext';

export function useUserProfile() {
  const { profile, loading, refresh } = useUserProfileContext();
  return { profile, loading, refresh };
}
