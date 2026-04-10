import { request } from './request';

export type HealthResponse = {
  status: 'ok' | 'error';
  timestamp: string;
};

export function getHealth() {
  return request<HealthResponse>('/health');
}

export type Gender = 0 | 1 | 2 | 3;

export interface UserProfile {
  id: number;
  phone: string;
  nickname: string | null;
  avatar: string | null;
  gender: Gender;
  birthday: string | null;
  region: string | null;
}

export interface UpdateProfilePayload {
  nickname?: string;
  avatar?: string;
  gender?: Gender;
  birthday?: string;
  region?: string;
}

export async function getUserProfile(): Promise<{ user: UserProfile }> {
  return request<{ user: UserProfile }>('/api/user/profile');
}

export async function updateUserProfile(payload: UpdateProfilePayload): Promise<{ user: UserProfile }> {
  return request<{ user: UserProfile }>('/api/user/profile', {
    method: 'PATCH',
    body: payload,
  });
}

export interface SearchUserResult {
  id: number;
  nickname: string;
  avatar: string | null;
  isFriend?: boolean;
}

export async function searchUsers(keyword: string): Promise<{ users: SearchUserResult[] }> {
  try {
    return await request<{ users: SearchUserResult[] }>(`/api/user/search?keyword=${encodeURIComponent(keyword)}`);
  } catch {
    return { users: [] };
  }
}

export async function addFriend(userId: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/api/friend/add', {
    method: 'POST',
    body: { userId },
  });
}

export interface FriendItem {
  id: number;
  nickname: string;
  avatar: string | null;
  bio?: string;
  location?: string;
}

export async function getFriends(): Promise<{ friends: FriendItem[] }> {
  return request<{ friends: FriendItem[] }>('/api/friend/list');
}

export interface ChatMessage {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  isRead: number;
  createdAt: string;
}

export interface RecentChat {
  userId: number;
  nickname: string | null;
  avatar: string | null;
  lastMessage: ChatMessage;
  unreadCount?: number;
}

export async function getRecentChats(): Promise<{ chats: RecentChat[] }> {
  return request<{ chats: RecentChat[] }>('/api/message/chats');
}

export async function getConversation(userId: number): Promise<{ messages: ChatMessage[] }> {
  return request<{ messages: ChatMessage[] }>(`/api/message/conversation/${userId}`);
}

export async function sendMessage(receiverId: number, content: string): Promise<{ message: ChatMessage }> {
  return request<{ message: ChatMessage }>('/api/message/send', {
    method: 'POST',
    body: { receiverId, content },
  });
}

export async function logout(): Promise<void> {
  return request<void>('/api/auth/logout', {
    method: 'POST',
  });
}

export interface Notice {
  id: number;
  content: string;
  senderId: number;
  receiverId: number;
  isRead: number;
  createdAt: string;
  type?: string;
}

export async function getNotices(): Promise<{ notices: Notice[] }> {
  return request<{ notices: Notice[] }>('/api/message/notices');
}
