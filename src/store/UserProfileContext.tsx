'use client';

import { createContext, useContext, ReactNode, useEffect, useState, useCallback, useRef } from 'react';
import { getUserProfile, UserProfile } from '@/services/api';
import { getUser, setUser, isLoggedIn } from '@/store/userStore';
import { subscribeToProfileUpdates } from '@/store/profileEvents';

type UserProfileContextType = {
  profile: UserProfile | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const UserProfileContext = createContext<UserProfileContextType | null>(null);

export function useUserProfileContext() {
  const context = useContext(UserProfileContext);
  if (!context) {
    throw new Error('useUserProfileContext must be used within UserProfileProvider');
  }
  return context;
}

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const cachedUser = getUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(!cachedUser);
  const initialized = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const data = await getUserProfile();
      setProfile(data.user);
      setUser({
        id: String(data.user.id),
        phone: data.user.phone,
        nickname: data.user.nickname,
        avatar: data.user.avatar,
        gender: data.user.gender,
        birthday: data.user.birthday,
        region: data.user.region,
      });
    } catch {
      setProfile(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (cachedUser && isLoggedIn()) {
      setProfile({
        id: Number(cachedUser.id),
        phone: cachedUser.phone,
        nickname: cachedUser.nickname,
        avatar: cachedUser.avatar,
        gender: cachedUser.gender as UserProfile['gender'],
        birthday: cachedUser.birthday,
        region: cachedUser.region,
      });
      setLoading(false);
      refresh();
    } else {
      refresh();
    }

    const unsubscribe = subscribeToProfileUpdates(() => {
      refresh();
    });

    return unsubscribe;
  }, [refresh, cachedUser]);

  return (
    <UserProfileContext.Provider value={{ profile, loading, refresh }}>
      {children}
    </UserProfileContext.Provider>
  );
}
