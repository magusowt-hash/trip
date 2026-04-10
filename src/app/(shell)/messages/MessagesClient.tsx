'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { searchUsers, addFriend, getFriends, getConversation, getUserProfile, getRecentChats, getNotices, SearchUserResult, FriendItem } from '@/services/api';
import type { ChatMessage } from '@/services/api';
import { useWebSocket } from '@/context/WebSocketContext';
import { useChat } from '@/context/ChatContext';
import styles from './messages.module.css';

type InboxItem = {
  id: string;
  name: string;
  preview: string;
  time: string;
  unread: number;
  avatar: string;
  tag?: string;
  isSystem?: boolean;
};

type MessageData = {
  id: string;
  content: string;
  sender: 'me' | 'other';
  time: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
};

type Conversation = {
  id: string;
  name: string;
  avatar: string;
  messages: MessageData[];
  bio?: string;
  location?: string;
};

function ChatHeader({ conversation, onBack }: { conversation: Conversation; onBack: () => void }) {
  return (
    <header className={styles.chatHeader}>
      <button type="button" className={styles.backBtn} onClick={onBack} aria-label="返回">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>
      <div className={styles.chatHeaderCenter}>
        <img className={styles.chatHeaderAvatar} src={conversation.avatar} alt="" />
        <div className={styles.chatHeaderText}>
          <span className={styles.chatHeaderName}>{conversation.name}</span>
          {(conversation.bio || conversation.location) && (
            <span className={styles.chatHeaderBio}>
              {conversation.location && <span>{conversation.location}</span>}
              {conversation.location && conversation.bio && <span>  </span>}
              {conversation.bio && <span>{conversation.bio}</span>}
            </span>
          )}
        </div>
      </div>
      <div className={styles.chatHeaderSpacer} />
    </header>
  );
}

function ChatView({ conversation, onSendMessage, onTyping, isFriendTyping, onBack, isOffline, onRetry }: { 
  conversation: Conversation; 
  onSendMessage?: (content: string) => void;
  onTyping?: () => void;
  isFriendTyping?: boolean;
  onBack: () => void;
  isOffline?: boolean;
  onRetry?: (messageId: string) => void;
}) {
  const messages = conversation.messages;
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.currentTarget.value);
    
    if (onTyping && e.currentTarget.value.trim()) {
      onTyping();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  function handleSend() {
    if (!inputValue.trim()) return;
    const content = inputValue;
    setInputValue('');
    
    if (onSendMessage) {
      onSendMessage(content);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className={styles.chatView}>
      <ChatHeader conversation={conversation} onBack={onBack} />
      {isOffline && (
        <div className={styles.offlineBanner}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9"/>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
          <span>网络已断开，消息将在恢复后发送</span>
        </div>
      )}
      <div className={styles.chatMessageDatas}>
        {messages.map((msg) => (
          <div key={msg.id} className={`${styles.message} ${msg.sender === 'me' ? styles.messageMe : styles.messageOther}`}>
            {msg.sender === 'other' && <img className={styles.messageAvatar} src={conversation.avatar} alt="" />}
            <div className={styles.messageBubble}>
              <p className={styles.messageContent}>{msg.content}</p>
              <div className={styles.messageTime}>
                <span>{msg.time}</span>
                {msg.sender === 'me' && (
                  <>
                    <span className={`${styles.messageStatus} ${
                      msg.status === 'sending' ? styles.messageStatusSending : 
                      msg.status === 'failed' ? styles.messageStatusFailed :
                      msg.status === 'read' ? styles.messageStatusRead : ''
                    }`}>
                      {msg.status === 'sending' ? '···' : 
                       msg.status === 'sent' ? '✓' : 
                       msg.status === 'delivered' ? '✓✓' : 
                       msg.status === 'read' ? '✓✓' :
                       msg.status === 'failed' ? '!' : ''}
                    </span>
                    {msg.status === 'failed' && onRetry && (
                      <button 
                        type="button" 
                        className={styles.retryBtn}
                        onClick={() => onRetry(msg.id)}
                        aria-label="重试"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M23 4v6h-6"/>
                          <path d="M1 20v-6h6"/>
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/>
                          <path d="M20.49 15a9 9 0 0 1-14.85-3.36L1 14"/>
                        </svg>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {isFriendTyping && (
        <div className={styles.typingIndicator}>
          <span className={styles.typingDots}>
            <span></span>
            <span></span>
            <span></span>
          </span>
          <span>对方正在输入...</span>
        </div>
      )}

      <div className={styles.chatInputArea}>
        <input
          ref={inputRef}
          type="text"
          className={styles.chatInput}
          placeholder="发送消息..."
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className={styles.sendBtn} onClick={handleSend} disabled={!inputValue.trim()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15-2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

const CACHE_TIMEOUT = 30 * 1000;

const cachedData = {
  profile: null as { user: { id: number } } | null,
  friends: null as FriendItem[] | null,
  chats: null as InboxItem[] | null,
  notices: null as InboxItem[] | null,
  timestamp: 0,
};

export function MessagesClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeChat, setActiveChat] = useState<Conversation | null>(null);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number>(0);
  const [isFriendTyping, setIsFriendTyping] = useState(false);
  const [recentChats, setRecentChats] = useState<InboxItem[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { setActiveChat: setGlobalChat } = useChat();

  const { onNewMessage, sendMessage: wsSendMessage, isConnected, emitTyping, onTyping } = useWebSocket();

  useEffect(() => {
    if (!isConnected || !activeChat) return;
    
    const unsubscribe = onTyping((data) => {
      if (data.userId === Number(activeChat.id)) {
        setIsFriendTyping(data.isTyping);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(() => setIsFriendTyping(false), 3000);
      }
    });
    
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      unsubscribe();
    };
  }, [isConnected, onTyping, activeChat]);

  const handleNewMessage = useCallback((msg: { id: number; senderId: number; receiverId: number; content: string; createdAt: string }) => {
    if (!activeChat) return;
    
    const isRelevant = msg.senderId === Number(activeChat.id) || msg.receiverId === currentUserId;
    if (!isRelevant) return;

    setActiveChat((prev) => {
      if (!prev) return prev;
      
      const existingTempIndex = prev.messages.findIndex(m => m.id.startsWith('temp_') && m.content === msg.content);
      if (existingTempIndex >= 0) {
        const updatedMessages = [...prev.messages];
        updatedMessages[existingTempIndex] = {
          id: String(msg.id),
          content: msg.content,
          sender: msg.senderId === currentUserId ? 'me' : 'other',
          time: new Date(msg.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        };
        return { ...prev, messages: updatedMessages };
      }
      
      const newMsg: MessageData = {
        id: String(msg.id),
        content: msg.content,
        sender: msg.senderId === currentUserId ? 'me' : 'other',
        time: new Date(msg.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      };
      return { ...prev, messages: [...prev.messages, newMsg] };
    });
  }, [activeChat, currentUserId]);

  useEffect(() => {
    if (!isConnected) return;
    
    const unsubscribe = onNewMessage(handleNewMessage);
    return unsubscribe;
  }, [isConnected, onNewMessage, handleNewMessage]);

  useEffect(() => {
    if (initialized) return;

    async function loadData() {
      const now = Date.now();
      const isCacheValid = now - cachedData.timestamp < CACHE_TIMEOUT;

      if (isCacheValid && cachedData.profile && cachedData.friends && cachedData.chats) {
        setCurrentUserId(cachedData.profile.user.id);
        setFriends(cachedData.friends);
        setRecentChats(cachedData.chats);
        setInitialized(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const [profile, friendsData, chatsData, noticesData] = await Promise.all([
          getUserProfile(),
          getFriends(),
          getRecentChats(),
          getNotices()
        ]);

        cachedData.profile = profile;
        cachedData.friends = friendsData.friends ?? [];
        cachedData.timestamp = now;

        setCurrentUserId(profile.user.id);
        setFriends(friendsData.friends ?? []);
        
        const mappedChats: InboxItem[] = (chatsData.chats ?? []).map((chat) => {
          const chatUserId = chat.userId;
          if (!chatUserId || isNaN(chatUserId)) return null;
          return {
            id: String(chatUserId),
            name: chat.nickname || `用户${chatUserId}`,
            preview: chat.lastMessage?.content || '',
            time: chat.lastMessage?.createdAt ? new Date(chat.lastMessage.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '',
            unread: chat.unreadCount ?? 0,
            avatar: chat.avatar || '/default-avatar.svg',
          };
        }).filter(Boolean) as InboxItem[];
        
        const mappedNotices: InboxItem[] = (noticesData.notices ?? []).map((notice) => ({
          id: `notice_${notice.id}`,
          name: '通知消息',
          preview: notice.content,
          time: notice.createdAt ? new Date(notice.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '',
          unread: notice.isRead === 0 ? 1 : 0,
          avatar: '/notification-icon.svg',
          isSystem: true,
        }));
        
        const allItems = [...mappedChats, ...mappedNotices].sort((a, b) => {
          if (!a.time || !b.time) return 0;
          return new Date(b.time).getTime() - new Date(a.time).getTime();
        });
        
        cachedData.chats = allItems;
        setRecentChats(allItems);
        setInitialized(true);
      } catch (e) {
        console.error('获取数据失败', e);
        setError('加载失败，请重试');
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
  }, [initialized]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    setIsOffline(!navigator.onLine);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  function handleSearch() {
    if (!searchKeyword.trim()) return;
    setSearching(true);
    searchUsers(searchKeyword)
      .then((results) => {
        setSearchResults(results.users ?? []);
      })
      .finally(() => {
        setSearching(false);
      });
  }

  async function handleAddFriend(userId: number) {
    try {
      const result = await addFriend(userId);
      if (result.success) {
        const friendsData = await getFriends();
        setFriends(friendsData.friends ?? []);
      }
      setSearchResults((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isFriend: true } : u))
      );
    } catch (err) {
      console.error('添加好友失败', err);
    }
  }

  function handleCloseSearch() {
    setShowAddFriend(false);
    setSearchKeyword('');
    setSearchResults([]);
  }

  async function handleFriendClick(friend: FriendItem) {
    try {
      const data = await getConversation(friend.id);
      const messages: MessageData[] = data.messages.map((m: ChatMessage) => ({
        id: String(m.id),
        content: m.content,
        sender: m.senderId === currentUserId ? 'me' : 'other',
        time: new Date(m.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        status: m.senderId === currentUserId ? 'delivered' : 'read',
      }));
      const chat: Conversation = {
        id: String(friend.id),
        name: friend.nickname,
        avatar: friend.avatar || '/default-avatar.svg',
        messages,
        bio: friend.bio,
        location: friend.location,
      };
      setActiveChat(chat);
      setGlobalChat({
        id: String(friend.id),
        name: friend.nickname,
        avatar: friend.avatar || '/default-avatar.svg',
      });
    } catch (err) {
      console.error('获取对话失败', err);
    }
  }

  async function handleMessageSent(receiverId: number, content: string) {
    const tempId = `temp_${Date.now()}`;
    const newMsg: MessageData = {
      id: tempId,
      content,
      sender: 'me',
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      status: 'sending',
    };
    setActiveChat((prev) => prev ? { ...prev, messages: [...prev.messages, newMsg] } : prev);
    
    wsSendMessage(receiverId, content, (success) => {
      setActiveChat((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === tempId ? { ...m, status: success ? 'sent' : 'failed' } : m
          ),
        };
      });
    });
  }

  function handleRetryMessage(messageId: string) {
    const message = activeChat?.messages.find(m => m.id === messageId);
    if (message && activeChat) {
      setActiveChat(prev => prev ? {
        ...prev,
        messages: prev.messages.filter(m => m.id !== messageId)
      } : prev);
      handleMessageSent(Number(activeChat.id), message.content);
    }
  }

  async function handleChatClick(item: InboxItem) {
    const targetUserId = Number(item.id);
    if (!targetUserId || isNaN(targetUserId)) {
      console.error('Invalid user ID:', item.id);
      return;
    }
    try {
      const data = await getConversation(targetUserId);
      const messages: MessageData[] = data.messages.map((m: ChatMessage) => ({
        id: String(m.id),
        content: m.content,
        sender: m.senderId === currentUserId ? 'me' : 'other',
        time: m.createdAt ? new Date(m.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '',
        status: m.senderId === currentUserId ? 'delivered' : 'read',
      }));
      const chat: Conversation = {
        id: item.id,
        name: item.name,
        avatar: item.avatar,
        messages,
      };
      setActiveChat(chat);
      setGlobalChat({
        id: item.id,
        name: item.name,
        avatar: item.avatar,
      });
    } catch (err) {
      console.error('获取对话失败', err);
    }
  }

  const list = recentChats;

  if (activeChat) {
    return (
      <div className={styles.root}>
        <div className={styles.split}>
          <div className={styles.leftCol}>
            <header className={styles.chatHeader}>
              <button type="button" className={styles.backBtn} onClick={() => setActiveChat(null)} aria-label="返回">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
              <div className={styles.chatHeaderInfo}>
                <img className={styles.chatHeaderAvatar} src={activeChat.avatar} alt="" />
                <div className={styles.chatHeaderText}>
                  <span className={styles.chatHeaderName}>{activeChat.name}</span>
                </div>
              </div>
              <div style={{ width: 36 }} />
            </header>
            <ChatView 
              conversation={activeChat} 
              onSendMessage={(content) => handleMessageSent(Number(activeChat.id), content)}
              onTyping={() => emitTyping(Number(activeChat.id))}
              isFriendTyping={isFriendTyping}
              onBack={() => setActiveChat(null)}
              isOffline={isOffline}
              onRetry={handleRetryMessage}
            />
          </div>
          <div className={styles.rightCol}>
            <div className={styles.friendsHeader}>
              <h2 className={styles.friendsTitle}>好友列表</h2>
              <button type="button" className={styles.iconBtn} aria-label="添加好友" onClick={() => setShowAddFriend(true)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <path d="M20 8v6M23 11h-6" />
                </svg>
              </button>
            </div>
            <div className={styles.friendsList}>
              {friends.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', padding: '20px' }}>暂无好友</p>
              ) : (
                friends.map((friend) => (
                  <button key={friend.id} type="button" className={styles.friendItem} onClick={() => handleFriendClick(friend)}>
                    <img className={styles.friendAvatar} src={friend.avatar || '/default-avatar.svg'} alt="" />
                    <div className={styles.friendInfo}>
                      <div className={styles.friendName}>{friend.nickname}</div>
                      {friend.bio && <div className={styles.friendStatus}>{friend.bio}</div>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.split}>
        <div className={styles.leftCol}>
          <div className={styles.list} role="tabpanel">
            {loading ? (
              <p className={styles.emptyHint}>加载中...</p>
            ) : error ? (
              <p className={styles.emptyHint}>{error}</p>
            ) : list.length === 0 ? (
              <p className={styles.emptyHint}>暂无消息</p>
            ) : (
              list.map((item) => (
                <button 
                  key={item.id} 
                  type="button" 
                  className={`${styles.convRow} ${(item as any).isSystem ? styles.systemNoticeRow : ''}`} 
                  onClick={() => (item as any).isSystem ? () => {} : handleChatClick(item)}
                >
                  <img className={styles.avatar} src={item.avatar} alt="" />
                  <div className={styles.body}>
                    <div className={styles.rowTop}>
                      <span className={styles.name}>{item.name}</span>
                      <span className={styles.time}>{item.time}</span>
                    </div>
                    <div className={styles.previewRow}>
                      <span className={styles.preview}>{item.preview}</span>
                      {item.unread > 0 ? <span className={styles.badge}>{item.unread > 99 ? '99+' : item.unread}</span> : null}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className={styles.rightCol}>
          <div className={styles.friendsHeader}>
            <h2 className={styles.friendsTitle}>好友列表</h2>
            <button type="button" className={styles.iconBtn} aria-label="添加好友" onClick={() => setShowAddFriend(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <path d="M20 8v6M23 11h-6" />
              </svg>
            </button>
          </div>
          <div className={styles.friendsList}>
            {friends.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', padding: '20px' }}>暂无好友</p>
            ) : (
              friends.map((friend) => (
                <button key={friend.id} type="button" className={styles.friendItem} onClick={() => handleFriendClick(friend)}>
                  <img className={styles.friendAvatar} src={friend.avatar || '/default-avatar.svg'} alt="" />
                  <div className={styles.friendInfo}>
                    <div className={styles.friendName}>{friend.nickname}</div>
                    {friend.bio && <div className={styles.friendStatus}>{friend.bio}</div>}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {showAddFriend && (
        <div className={styles.addFriendOverlay} onClick={handleCloseSearch}>
          <div className={styles.addFriendSheet} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.closeBtn} onClick={handleCloseSearch}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <div className={styles.searchWrap}>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="搜索用户名或手机号"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button type="button" className={styles.searchBtn} onClick={handleSearch} disabled={searching}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
              </button>
            </div>
            <div className={styles.searchResult}>
              {searching ? (
                <p className={styles.searchResultEmpty}>搜索中...</p>
              ) : !searchResults || searchResults.length === 0 ? (
                <p className={styles.searchResultEmpty}>
                  {searchKeyword.trim() ? '未找到相关用户' : '输入关键词搜索好友'}
                </p>
              ) : (
                <ul className={styles.userList}>
                  {searchResults.map((user) => (
                    <li key={user.id} className={styles.userItem}>
                      <img
                        className={styles.userAvatar}
                        src={user.avatar || '/default-avatar.svg'}
                        alt=""
                      />
                      <span className={styles.userName}>{user.nickname}</span>
                      <button
                        type="button"
                        className={styles.addBtn}
                        onClick={() => handleAddFriend(user.id)}
                        aria-label="添加好友"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="8.5" cy="7" r="4" />
                          <path d="M20 8v6M23 11h-6" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}