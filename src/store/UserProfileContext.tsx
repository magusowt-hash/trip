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

function mapCachedUserToProfile(cachedUser: ReturnType<typeof getUser>): UserProfile | null {
  if (!cachedUser) {
    return null;
  }

  return {
    id: Number(cachedUser.id),
    phone: cachedUser.phone,
    nickname: cachedUser.nickname,
    avatar: cachedUser.avatar,
    gender: cachedUser.gender as UserProfile['gender'],
    birthday: cachedUser.birthday,
    region: cachedUser.region,
  };
}

function syncProfileToStore(profile: UserProfile | null): void {
  if (!profile) {
    setUser(null);
    return;
  }

  setUser({
    id: String(profile.id),
    phone: profile.phone,
    nickname: profile.nickname,
    avatar: profile.avatar,
    gender: profile.gender,
    birthday: profile.birthday,
    region: profile.region,
  });
}

export function useUserProfileContext() {
  const context = useContext(UserProfileContext);
  if (!context) {
    throw new Error('useUserProfileContext must be used within UserProfileProvider');
  }
  return context;
}

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const cachedUser = getUser();
  const initialProfile = mapCachedUserToProfile(cachedUser);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(initialProfile === null);
  const initialized = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const data = await getUserProfile();
      setProfile(data.user);
      syncProfileToStore(data.user);
    } catch {
      setProfile(null);
      syncProfileToStore(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (initialProfile && isLoggedIn()) {
      setProfile(initialProfile);
      setLoading(false);
      void refresh();
    } else {
      void refresh();
    }

    const unsubscribe = subscribeToProfileUpdates(() => {
      void refresh();
    });

    return unsubscribe;
  }, [initialProfile, refresh]);

  return (
    <UserProfileContext.Provider value={{ profile, loading, refresh }}>
      {children}
    </UserProfileContext.Provider>
  );
}
