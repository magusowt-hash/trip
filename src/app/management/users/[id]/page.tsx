'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAdminAuth } from '../../admin-auth';

interface UserData {
  id: number;
  phone: string;
  nickname: string | null;
  avatar: string | null;
  gender: number;
  region: string | null;
  favoriteLists: any[];

  ratings: any[];
  createdAt: string;
}

interface PostData {
  id: string;
  title: string;
  coverImageUrl: string;
  topic: string;
  commentsCnt: number;
  favoritesCnt: number;
  createdAt: string;
}

export default function UserDetailPage() {
  const params = useParams();
  const userId = params.id as string;
  const { token } = useAdminAuth();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<PostData[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [bookmarkedPosts, setBookmarkedPosts] = useState<any[]>([]);
  const [bookmarksLoading, setBookmarksLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'posts' | 'favorites' | 'favoritesPosts' | 'visited' | 'ratings'>('profile');
  const [fpGroups, setFpGroups] = useState<any[]>([]);
  const [fpLoading, setFpLoading] = useState(false);
  const [expandedFpGroup, setExpandedFpGroup] = useState<number | null>(null);
  const [expandedFpItems, setExpandedFpItems] = useState<any[]>([]);
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const [expandedItemPhotos, setExpandedItemPhotos] = useState<any[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photoCounts, setPhotoCounts] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    fetch(`/api/admin/users?userId=${userId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then(res => res.json())
      .then(data => {
        if (data.list && data.list[0]) {
          setUser(data.list[0]);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId, token]);

  const fetchPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}/posts`, { credentials: 'include' });
      const data = await res.json();
      if (data.posts) setPosts(data.posts);
    } catch (e) {
      console.error(e);
    } finally {
      setPostsLoading(false);
    }
  }, [userId]);

  const fetchBookmarks = useCallback(async () => {
    setBookmarksLoading(true);
    try {
      const res = await fetch(`/api/admin/favorites?userId=${userId}`, { credentials: 'include' });
      const data = await res.json();
      if (data.favorites) setBookmarkedPosts(data.favorites);
    } catch (e) {
      console.error(e);
    } finally {
      setBookmarksLoading(false);
    }
  }, [userId]);

  const fetchFootprintGroups = useCallback(async () => {
    setFpLoading(true);
    try {
      const [groupsRes, filesRes] = await Promise.all([
        fetch(`/api/admin/footprints?user_id=${userId}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined }),
        fetch(`/api/admin/footprints?type=storage_detail&user_id=${userId}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined }),
      ]);
      const groupsData = await groupsRes.json();
      const filesData = await filesRes.json();

      setFpGroups(groupsData.groups || []);

      // Build photo count map: listItemId → count (matched by placeTitle)
      const files: any[] = filesData.files || [];
      const countsByTitle = new Map<string, number>();
      files.forEach((f: any) => countsByTitle.set(f.placeTitle, (countsByTitle.get(f.placeTitle) || 0) + 1));
      setPhotoCounts(countsByTitle as any);
    } catch (e) {
      console.error(e);
    } finally {
      setFpLoading(false);
    }
  }, [userId, token]);

  const fetchFootprintItems = async (groupId: number) => {
    try {
      const res = await fetch(`/api/admin/footprints?group_id=${groupId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await res.json();
      setExpandedFpItems(data.items || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchItemPhotos = async (it: any) => {
    setPhotosLoading(true);
    try {
      const res = await fetch(`/api/admin/footprints?type=storage_detail&user_id=${userId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await res.json();
      const placeTitle = it.title || it.listItemId;
      setExpandedItemPhotos((data.files || []).filter((f: any) => f.placeTitle === placeTitle));
    } catch (e) { console.error(e); }
    finally { setPhotosLoading(false); }
  };

  const handleToggleItemPhotos = (it: any) => {
    if (expandedItemId === it.listItemId) {
      setExpandedItemId(null);
      setExpandedItemPhotos([]);
    } else {
      setExpandedItemId(it.listItemId);
      fetchItemPhotos(it);
    }
  };

  const handleDeletePhoto = async (fileId: number) => {
    if (!confirm('确定删除该照片？')) return;
    await fetch(`/api/admin/footprints?type=storage_delete&file_id=${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const placeTitle = (expandedFpItems.find(i => i.listItemId === expandedItemId) as any)?.title || '';
    const res = await fetch(`/api/admin/footprints?type=storage_detail&user_id=${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setExpandedItemPhotos((data.files || []).filter((f: any) => f.placeTitle === placeTitle));
  };

  useEffect(() => {
    if (activeTab === 'visited' && fpGroups.length === 0) {
      fetchFootprintGroups();
    }
  }, [activeTab, fetchFootprintGroups, fpGroups.length]);

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <div>加载中...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: 20 }}>
        <div>用户不存在</div>
      </div>
    );
  }

  const genderText = user.gender === 1 ? '男' : user.gender === 2 ? '女' : '未设置';

  const renderProfile = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {user.avatar ? (
          <img src={user.avatar} alt="" width={80} height={80} style={{ borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>无图</div>
        )}
        <div>
          <h2 style={{ margin: '0 0 8px' }}>{user.nickname || '未设置昵称'}</h2>
          <p style={{ margin: 0, color: '#6b7280' }}>ID: {user.id}</p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px 16px', fontSize: 14 }}>
        <span style={{ color: '#6b7280' }}>手机号</span>
        <span>{user.phone}</span>
        <span style={{ color: '#6b7280' }}>性别</span>
        <span>{genderText}</span>
        <span style={{ color: '#6b7280' }}>地区</span>
        <span>{user.region || '-'}</span>
        <span style={{ color: '#6b7280' }}>注册时间</span>
        <span>{user.createdAt ? new Date(user.createdAt).toLocaleString('zh-CN') : '-'}</span>
      </div>
    </div>
  );

  const renderFavorites = () => {
    const favorites = user.favoriteLists || [];
    if (favorites.length === 0) {
      return <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>暂无收藏</div>;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {favorites.map((f: any, i: number) => (
          <div key={i} style={{ padding: 12, background: '#f9fafb', borderRadius: 8, fontSize: 14 }}>
            <div><strong>{f.title || '未知地点'}</strong> <span style={{ color: '#9ca3af', fontSize: 12 }}>(ID: {f.listItemId})</span></div>
            <div style={{ color: '#6b7280', fontSize: 12 }}>收藏时间: {f.addedAt ? new Date(f.addedAt).toLocaleString('zh-CN') : '-'}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderVisited = () => {
    if (fpLoading) {
      return <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>加载中...</div>;
    }
    if (fpGroups.length === 0) {
      return <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>暂无足迹分类组</div>;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {fpGroups.map((g: any) => (
          <div key={g.id}>
            <div
              onClick={() => {
                if (expandedFpGroup === g.id) {
                  setExpandedFpGroup(null);
                  setExpandedFpItems([]);
                } else {
                  setExpandedFpGroup(g.id);
                  fetchFootprintItems(g.id);
                }
              }}
              style={{
                padding: 12,
                background: '#f9fafb',
                borderRadius: 8,
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>
                {expandedFpGroup === g.id ? '▾ ' : '▸ '}
                <strong>{g.name}</strong>
                {g.isDefault === 1 && <span style={{ marginLeft: 8, padding: '1px 6px', fontSize: 11, background: '#dbeafe', color: '#3b82f6', borderRadius: 4 }}>默认</span>}
              </span>
              <span style={{ color: '#9ca3af', fontSize: 12 }}>{g.itemCount} 个地点</span>
            </div>
            {expandedFpGroup === g.id && (
              <div style={{ marginLeft: 24, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {expandedFpItems.length === 0 ? (
                  <div style={{ padding: 12, color: '#9ca3af', fontSize: 13 }}>暂无地点</div>
                ) : (
                  expandedFpItems.map((item: any) => (
                    <div key={item.id}>
                      <div
                        onClick={() => handleToggleItemPhotos(item)}
                        style={{
                          display: 'flex',
                          alignItems: 'center', gap: 8,
                          padding: '8px 12px', background: '#fff', borderRadius: 6,
                          fontSize: 13, cursor: 'pointer',
                          border: expandedItemId === item.listItemId ? '1px solid #3b82f6' : '1px solid #f3f4f6',
                        }}
                      >
                        {item.coverImage ? (
                          <img src={item.coverImage} alt="" width={36} height={36} style={{ borderRadius: 4, objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: 36, height: 36, borderRadius: 4, background: '#f3f4f6' }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500 }}>{item.title || `#${item.listItemId}`}</div>
                          {item.address && <div style={{ color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.address}</div>}
                        </div>
                        {photoCounts.get(item.title) > 0 && (
                          <span style={{ fontSize: 11, background: '#ecfdf5', color: '#059669', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                            {photoCounts.get(item.title)} 张
                          </span>
                        )}
                        <span style={{ color: '#9ca3af', fontSize: 11, whiteSpace: 'nowrap' }}>
                          {item.addedAt ? new Date(item.addedAt).toLocaleDateString('zh-CN') : ''}
                        </span>
                      </div>

                      {expandedItemId === item.listItemId && (
                        <div style={{ marginLeft: 44, marginTop: 4, marginBottom: 8 }}>
                          {photosLoading ? (
                            <div style={{ color: '#9ca3af', fontSize: 12, padding: 8 }}>加载中...</div>
                          ) : expandedItemPhotos.length === 0 ? (
                            <div style={{ color: '#9ca3af', fontSize: 12, padding: 8 }}>该地点暂无上传照片</div>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {expandedItemPhotos.map((p: any) => (
                                <div key={p.id} style={{
                                  position: 'relative', width: 72, height: 72,
                                  borderRadius: 6, overflow: 'hidden', background: '#f3f4f6',
                                }}>
                                  <img
                                    src={`/api/storage/file?uid=${userId}&place=${encodeURIComponent(p.placeTitle)}&file=${encodeURIComponent(p.filename)}`}
                                    alt={p.filename}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                  <div style={{
                                    position: 'absolute', bottom: 0, left: 0, right: 0,
                                    background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 9,
                                    padding: '1px 4px', textAlign: 'center',
                                  }}>
                                    {p.filename.length > 10 ? p.filename.slice(0, 8) + '..' : p.filename}
                                  </div>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeletePhoto(p.id); }}
                                    style={{
                                      position: 'absolute', top: 2, right: 2,
                                      width: 16, height: 16, borderRadius: '50%',
                                      border: 'none', background: 'rgba(255,0,0,0.7)',
                                      color: '#fff', fontSize: 10, cursor: 'pointer',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderRatings = () => {
    const ratings = (user as any).ratingDetails || [];
    if (ratings.length === 0) {
      return <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>暂无评分</div>;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ratings.map((r: any, i: number) => (
          <div key={i} style={{ padding: 12, background: '#f9fafb', borderRadius: 8, fontSize: 14 }}>
            <div>类型: {r.targetType}
              {r.targetTitle ? <span> / <strong>{r.targetTitle}</strong></span> : ''}
              {' '}<span style={{ color: '#9ca3af', fontSize: 12 }}>(ID: {r.targetId})</span>
            </div>
            <div>评分: {'★'.repeat(r.rating / 2)}{'☆'.repeat(5 - r.rating / 2)} ({r.rating})</div>
            {r.comment && <div style={{ color: '#374151', marginTop: 4 }}>评论: {r.comment}</div>}
            <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>评分时间: {r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '-'}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderBookmarkedPosts = () => {
    if (bookmarksLoading) {
      return <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>加载中...</div>;
    }
    if (bookmarkedPosts.length === 0) {
      return <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>暂无收藏的帖子</div>;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {bookmarkedPosts.map((b: any) => (
          <div key={b.id} style={{ padding: 12, background: '#f9fafb', borderRadius: 8, fontSize: 14 }}>
            <div style={{ fontWeight: 500 }}>{b.postTitle || `帖子 #${b.postId}`}</div>
            <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
              收藏时间: {b.createdAt ? new Date(b.createdAt).toLocaleString('zh-CN') : '-'}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderPosts = () => {
    if (postsLoading) {
      return <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>加载中...</div>;
    }
    if (posts.length === 0) {
      return <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>暂无帖子</div>;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {posts.map(p => (
          <div key={p.id} style={{ padding: 12, background: '#f9fafb', borderRadius: 8, fontSize: 14 }}>
            <div style={{ fontWeight: 500 }}>{p.title}</div>
            {p.coverImageUrl && (
              <img src={p.coverImageUrl} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 4, marginTop: 8 }} />
            )}
            <div style={{ display: 'flex', gap: 16, marginTop: 8, color: '#6b7280', fontSize: 12 }}>
              <span>主题: {p.topic || '推荐'}</span>
              <span>评论: {p.commentsCnt}</span>
              <span>收藏: {p.favoritesCnt}</span>
            </div>
            <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
              发布时间: {p.createdAt ? new Date(p.createdAt).toLocaleString('zh-CN') : '-'}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ padding: 20, maxWidth: 800 }}>
      <h1 style={{ margin: '0 0 20px', fontSize: 24 }}>用户详情</h1>
      
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #e5e7eb' }}>
        {(['profile', 'posts', 'favorites', 'favoritesPosts', 'visited', 'ratings'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: activeTab === tab ? '#3b82f6' : 'transparent',
              color: activeTab === tab ? '#fff' : '#4b5563',
              borderRadius: '4px 4px 0 0',
              cursor: 'pointer',
            }}
          >
            {tab === 'profile' && '基本信息'}
            {tab === 'posts' && '帖子'}
            {tab === 'favorites' && '地点收藏'}
            {tab === 'favoritesPosts' && '帖子收藏'}
            {tab === 'visited' && '足迹'}
            {tab === 'ratings' && '评分'}
          </button>
        ))}
      </div>

      <div style={{ padding: 16, background: '#fff', borderRadius: 8 }}>
        {activeTab === 'profile' && renderProfile()}
        {activeTab === 'posts' && renderPosts()}
        {activeTab === 'favorites' && renderFavorites()}
        {activeTab === 'favoritesPosts' && renderBookmarkedPosts()}
        {activeTab === 'visited' && renderVisited()}
        {activeTab === 'ratings' && renderRatings()}
      </div>
    </div>
  );
}