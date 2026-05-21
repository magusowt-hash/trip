'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { buildAdminHeaders, useAdminAuth } from '../../admin-auth';
import styles from './page.module.css';

type DetailTab =
  | 'profile'
  | 'posts'
  | 'favorites'
  | 'favoritePosts'
  | 'plans'
  | 'comments'
  | 'friends'
  | 'visited'
  | 'ratings'
  | 'messages';

interface UserSummary {
  id: number;
  phone: string;
  nickname: string | null;
  avatar: string | null;
  gender: number;
  birthday: string | null;
  region: string | null;
  status: string | null;
  createdAt: string;
  updatedAt: string;
  favoriteLists: Array<{ listItemId: number; addedAt?: string; title: string | null }>;
  ratingDetails: Array<{
    id: number;
    targetType: string;
    targetId: number;
    rating: number;
    comment?: string | null;
    createdAt: string;
    targetTitle?: string | null;
  }>;
}

interface UserDetailResponse {
  user: UserSummary;
  stats: {
    postsCount: number;
    favoritePlacesCount: number;
    favoritePostsCount: number;
    plansCount: number;
    ratingsCount: number;
    commentsCount: number;
    friendsCount: number;
    footprintPhotoCount: number;
    footprintPlaceCount: number;
    conversationCount: number;
  };
  posts: Array<{
    id: number;
    title: string;
    coverImageUrl: string | null;
    topic: string | null;
    commentsCnt: number | null;
    favoritesCnt: number | null;
    status: string | null;
    createdAt: string;
  }>;
  favoritePosts: Array<{
    id: number;
    postId: number;
    createdAt: string;
    postTitle: string | null;
    postStatus: string | null;
  }>;
  plans: Array<{
    id: number;
    name: string;
    startDate: string | null;
    endDate: string | null;
    status: string | null;
    createdAt: string;
  }>;
  comments: Array<{
    id: number;
    postId: number;
    content: string;
    status: string | null;
    createdAt: string;
    postTitle: string | null;
  }>;
  friends: Array<{
    id: number;
    nickname: string | null;
    avatar: string | null;
    phone: string | null;
    createdAt: string;
  }>;
  recentConversations: Array<{
    userId: number;
    nickname: string | null;
    avatar: string | null;
    phone: string | null;
    lastMessage: {
      id: number;
      senderId: number;
      receiverId: number;
      content: string;
      isRead: number;
      createdAt: string;
    } | null;
  }>;
}

interface FootprintGroup {
  id: number;
  name: string;
  isDefault: number;
  itemCount: number;
}

interface FootprintItem {
  id: number;
  groupId: number;
  listItemId: number;
  title: string | null;
  coverImage: string | null;
  address: string | null;
  addedAt: string | null;
}

interface FootprintPhoto {
  id: number;
  placeTitle: string;
  displayTitle?: string;
  footprintItemId?: number | null;
  filename: string;
}

const tabLabels: Record<DetailTab, string> = {
  profile: '基本信息',
  posts: '帖子',
  favorites: '地点收藏',
  favoritePosts: '帖子收藏',
  plans: '计划',
  comments: '评论',
  friends: '好友',
  visited: '足迹',
  ratings: '评分',
  messages: '消息',
};

export default function UserDetailPage() {
  const params = useParams();
  const userId = params.id as string;
  const { token } = useAdminAuth();

  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<UserDetailResponse | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('profile');
  const [actionLoading, setActionLoading] = useState(false);

  const [fpGroups, setFpGroups] = useState<FootprintGroup[]>([]);
  const [fpLoading, setFpLoading] = useState(false);
  const [expandedFpGroup, setExpandedFpGroup] = useState<number | null>(null);
  const [expandedFpItems, setExpandedFpItems] = useState<FootprintItem[]>([]);
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const [expandedItemPhotos, setExpandedItemPhotos] = useState<FootprintPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photoCounts, setPhotoCounts] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`/api/admin/users/${userId}`, {
      headers: buildAdminHeaders(token),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setDetail(data);
        } else {
          setDetail(null);
        }
      })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [token, userId]);

  const reloadDetail = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`/api/admin/users/${userId}`, {
      headers: buildAdminHeaders(token),
    });
    const data = await res.json();
    if (!data.error) {
      setDetail(data);
    }
  }, [token, userId]);

  const fetchFootprintGroups = useCallback(async () => {
    if (!token) return;
    setFpLoading(true);
    try {
      const [groupsRes, filesRes] = await Promise.all([
        fetch(`/api/admin/footprints?user_id=${userId}`, { headers: buildAdminHeaders(token) }),
        fetch(`/api/admin/footprints?type=storage_detail&user_id=${userId}`, { headers: buildAdminHeaders(token) }),
      ]);
      const groupsData = await groupsRes.json();
      const filesData = await filesRes.json();
      setFpGroups(groupsData.groups || []);

      const countsByTitle = new Map<string, number>();
      for (const file of filesData.files || []) {
        const key = file.footprintItemId ? `item:${file.footprintItemId}` : `legacy:${file.placeTitle}`;
        countsByTitle.set(key, (countsByTitle.get(key) || 0) + 1);
      }
      setPhotoCounts(countsByTitle);
    } finally {
      setFpLoading(false);
    }
  }, [token, userId]);

  useEffect(() => {
    if (activeTab === 'visited' && fpGroups.length === 0) {
      void fetchFootprintGroups();
    }
  }, [activeTab, fetchFootprintGroups, fpGroups.length]);

  const fetchFootprintItems = async (groupId: number) => {
    if (!token) return;
    const res = await fetch(`/api/admin/footprints?group_id=${groupId}`, {
      headers: buildAdminHeaders(token),
    });
    const data = await res.json();
    setExpandedFpItems(data.items || []);
  };

  const fetchItemPhotos = async (item: FootprintItem) => {
    if (!token) return;
    setPhotosLoading(true);
    try {
      const res = await fetch(`/api/admin/footprints?type=storage_detail&user_id=${userId}`, {
        headers: buildAdminHeaders(token),
      });
      const data = await res.json();
      setExpandedItemPhotos((data.files || []).filter((file: FootprintPhoto) => {
        if (file.footprintItemId) return file.footprintItemId === item.id;
        return file.placeTitle === (item.title || String(item.listItemId));
      }));
    } finally {
      setPhotosLoading(false);
    }
  };

  const handleToggleItemPhotos = (item: FootprintItem) => {
    if (expandedItemId === item.listItemId) {
      setExpandedItemId(null);
      setExpandedItemPhotos([]);
      return;
    }
    setExpandedItemId(item.listItemId);
    void fetchItemPhotos(item);
  };

  const handleDeletePhoto = async (fileId: number) => {
    if (!token || !window.confirm('确定删除该照片？')) return;
    await fetch(`/api/admin/footprints?type=storage_delete&file_id=${fileId}`, {
      method: 'DELETE',
      headers: buildAdminHeaders(token),
    });
    const currentItem = expandedFpItems.find((item) => item.listItemId === expandedItemId);
    if (currentItem) {
      await fetchItemPhotos(currentItem);
      void fetchFootprintGroups();
    }
  };

  const openFootprintMap = async () => {
    if (!token) {
      alert('请先登录管理后台');
      return;
    }
    const res = await fetch('/api/footprints/view', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAdminHeaders(token),
      },
      body: JSON.stringify({ user_id: userId }),
    });
    const data = await res.json();
    if (data.url) {
      window.open(data.url, '_blank');
      return;
    }
    alert(data.error || '生成链接失败');
  };

  const user = detail?.user ?? null;
  const stats = detail?.stats;
  const genderText = useMemo(() => {
    if (!user) return '-';
    return user.gender === 1 ? '男' : user.gender === 2 ? '女' : '未设置';
  }, [user]);

  if (loading) {
    return <div className={styles.loading}>加载中...</div>;
  }

  if (!detail || !user || !stats) {
    return <div className={styles.empty}>用户不存在或加载失败</div>;
  }

  const runUserAction = async (action: 'block' | 'restore') => {
    if (!token) return;
    const confirmText = action === 'block' ? '确定禁用该用户？' : '确定恢复该用户？';
    if (!window.confirm(confirmText)) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users?id=${user.id}&action=${action}`, {
        method: 'PATCH',
        headers: buildAdminHeaders(token),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '操作失败');
        return;
      }
      await reloadDetail();
    } finally {
      setActionLoading(false);
    }
  };

  const runPostAction = async (postId: number, action: 'block' | 'restore' | 'soft-delete' | 'permanent-delete') => {
    if (!token) return;
    const actionLabelMap: Record<string, string> = {
      block: '屏蔽',
      restore: '恢复',
      'soft-delete': '删除',
      'permanent-delete': '彻底删除',
    };
    if (!window.confirm(`确定${actionLabelMap[action]}该帖子？`)) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/posts?id=${postId}&action=${action}`, {
        method: 'PATCH',
        headers: buildAdminHeaders(token),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '操作失败');
        return;
      }
      await reloadDetail();
    } finally {
      setActionLoading(false);
    }
  };

  const runCommentAction = async (commentId: number, action: 'soft-delete' | 'permanent-delete') => {
    if (!token) return;
    const actionLabel = action === 'soft-delete' ? '删除' : '彻底删除';
    if (!window.confirm(`确定${actionLabel}该评论？`)) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/comments?id=${commentId}&action=${action}`, {
        method: 'PATCH',
        headers: buildAdminHeaders(token),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '操作失败');
        return;
      }
      await reloadDetail();
    } finally {
      setActionLoading(false);
    }
  };

  const runPlanAction = async (planId: number, action: 'soft-delete' | 'permanent-delete') => {
    if (!token) return;
    const actionLabel = action === 'soft-delete' ? '删除' : '彻底删除';
    if (!window.confirm(`确定${actionLabel}该计划？`)) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/plans?id=${planId}&action=${action}`, {
        method: 'PATCH',
        headers: buildAdminHeaders(token),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '操作失败');
        return;
      }
      await reloadDetail();
    } finally {
      setActionLoading(false);
    }
  };

  const renderEmpty = (text: string) => <div className={styles.emptyState}>{text}</div>;

  const renderProfileTab = () => (
    <div className={styles.stack}>
      <div className={styles.contentCard}>
        <h3 className={styles.contentTitle}>账号信息</h3>
        <div className={styles.detailGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>手机号</span>
            <span className={styles.detailValue}>{user.phone}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>状态</span>
            <span className={styles.detailValue}>{user.status || 'normal'}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>性别</span>
            <span className={styles.detailValue}>{genderText}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>地区</span>
            <span className={styles.detailValue}>{user.region || '-'}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>生日</span>
            <span className={styles.detailValue}>{user.birthday || '-'}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>最近更新</span>
            <span className={styles.detailValue}>{user.updatedAt ? new Date(user.updatedAt).toLocaleString('zh-CN') : '-'}</span>
          </div>
        </div>
        <div className={styles.inlineActions}>
          {user.status === 'blocked' ? (
            <button type="button" className={styles.smallPrimaryButton} disabled={actionLoading} onClick={() => void runUserAction('restore')}>恢复用户</button>
          ) : (
            <button type="button" className={styles.smallDangerButton} disabled={actionLoading} onClick={() => void runUserAction('block')}>禁用用户</button>
          )}
          <Link href="/management/users" className={styles.secondaryLink}>返回用户管理</Link>
        </div>
      </div>
    </div>
  );

  const renderPostsTab = () => {
    if (detail.posts.length === 0) return renderEmpty('暂无帖子');
    return (
      <div className={styles.stack}>
        {detail.posts.map((post) => (
          <div key={post.id} className={styles.contentCard}>
            <h3 className={styles.contentTitle}>{post.title || `帖子 #${post.id}`}</h3>
            {post.coverImageUrl ? <img src={post.coverImageUrl} alt="" className={styles.contentImage} /> : null}
            <div className={styles.contentMeta}>
              <span>状态: {post.status || 'normal'}</span>
              <span>主题: {post.topic || '推荐'}</span>
              <span>评论: {post.commentsCnt || 0}</span>
              <span>收藏: {post.favoritesCnt || 0}</span>
              <span>发布时间: {post.createdAt ? new Date(post.createdAt).toLocaleString('zh-CN') : '-'}</span>
            </div>
            <div className={styles.actionRow}>
              <Link href={`/management/posts`} className={styles.secondaryLink}>前往帖子管理</Link>
            </div>
            <div className={styles.inlineActions}>
              {post.status !== 'blocked' ? (
                <button type="button" className={styles.smallButton} disabled={actionLoading} onClick={() => void runPostAction(post.id, 'block')}>屏蔽</button>
              ) : (
                <button type="button" className={styles.smallPrimaryButton} disabled={actionLoading} onClick={() => void runPostAction(post.id, 'restore')}>恢复</button>
              )}
              {post.status !== 'deleted' ? (
                <button type="button" className={styles.smallDangerButton} disabled={actionLoading} onClick={() => void runPostAction(post.id, 'soft-delete')}>删除</button>
              ) : null}
              <button type="button" className={styles.smallDangerButton} disabled={actionLoading} onClick={() => void runPostAction(post.id, 'permanent-delete')}>彻底删除</button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderFavoritesTab = () => {
    if (user.favoriteLists.length === 0) return renderEmpty('暂无地点收藏');
    return (
      <div className={styles.stack}>
        {user.favoriteLists.map((item, index) => (
          <div key={`${item.listItemId}-${index}`} className={styles.contentCard}>
            <h3 className={styles.contentTitle}>{item.title || `地点 #${item.listItemId}`}</h3>
            <div className={styles.contentMeta}>
              <span>ID: {item.listItemId}</span>
              <span>收藏时间: {item.addedAt ? new Date(item.addedAt).toLocaleString('zh-CN') : '-'}</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderFavoritePostsTab = () => {
    if (detail.favoritePosts.length === 0) return renderEmpty('暂无帖子收藏');
    return (
      <div className={styles.stack}>
        {detail.favoritePosts.map((item) => (
          <div key={item.id} className={styles.contentCard}>
            <h3 className={styles.contentTitle}>{item.postTitle || `帖子 #${item.postId}`}</h3>
            <div className={styles.contentMeta}>
              <span>帖子状态: {item.postStatus || 'normal'}</span>
              <span>收藏时间: {item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN') : '-'}</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderPlansTab = () => {
    if (detail.plans.length === 0) return renderEmpty('暂无计划');
    return (
      <div className={styles.stack}>
        {detail.plans.map((plan) => (
          <div key={plan.id} className={styles.contentCard}>
            <h3 className={styles.contentTitle}>{plan.name}</h3>
            <div className={styles.contentMeta}>
              <span>状态: {plan.status || 'normal'}</span>
              <span>开始日期: {plan.startDate || '-'}</span>
              <span>结束日期: {plan.endDate || '-'}</span>
              <span>创建时间: {plan.createdAt ? new Date(plan.createdAt).toLocaleString('zh-CN') : '-'}</span>
            </div>
            <div className={styles.inlineActions}>
              {plan.status !== 'deleted' ? (
                <button type="button" className={styles.smallDangerButton} disabled={actionLoading} onClick={() => void runPlanAction(plan.id, 'soft-delete')}>删除</button>
              ) : null}
              <button type="button" className={styles.smallDangerButton} disabled={actionLoading} onClick={() => void runPlanAction(plan.id, 'permanent-delete')}>彻底删除</button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderCommentsTab = () => {
    if (detail.comments.length === 0) return renderEmpty('暂无评论');
    return (
      <div className={styles.stack}>
        {detail.comments.map((comment) => (
          <div key={comment.id} className={styles.contentCard}>
            <h3 className={styles.contentTitle}>{comment.postTitle || `帖子 #${comment.postId}`}</h3>
            <p className={styles.contentText}>{comment.content}</p>
            <div className={styles.contentMeta}>
              <span>状态: {comment.status || 'normal'}</span>
              <span>评论时间: {comment.createdAt ? new Date(comment.createdAt).toLocaleString('zh-CN') : '-'}</span>
            </div>
            <div className={styles.inlineActions}>
              {comment.status !== 'deleted' ? (
                <button type="button" className={styles.smallDangerButton} disabled={actionLoading} onClick={() => void runCommentAction(comment.id, 'soft-delete')}>删除</button>
              ) : null}
              <button type="button" className={styles.smallDangerButton} disabled={actionLoading} onClick={() => void runCommentAction(comment.id, 'permanent-delete')}>彻底删除</button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderFriendsTab = () => {
    if (detail.friends.length === 0) return renderEmpty('暂无好友');
    return (
      <div className={styles.friendGrid}>
        {detail.friends.map((friend) => (
          <div key={friend.id} className={styles.friendCard}>
            {friend.avatar ? (
              <img src={friend.avatar} alt="" className={styles.friendAvatar} />
            ) : (
              <div className={styles.friendAvatarPlaceholder}>好友</div>
            )}
            <div>
              <div className={styles.friendName}>{friend.nickname || `用户 ${friend.id}`}</div>
              <div className={styles.friendMeta}>用户ID: {friend.id}</div>
              <div className={styles.friendMeta}>手机号: {friend.phone || '-'}</div>
              <div className={styles.friendMeta}>添加时间: {friend.createdAt ? new Date(friend.createdAt).toLocaleString('zh-CN') : '-'}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderRatingsTab = () => {
    if (user.ratingDetails.length === 0) return renderEmpty('暂无评分');
    return (
      <div className={styles.stack}>
        {user.ratingDetails.map((rating) => (
          <div key={rating.id} className={styles.contentCard}>
            <h3 className={styles.contentTitle}>
              {rating.targetTitle || `${rating.targetType} #${rating.targetId}`}
            </h3>
            <div className={styles.contentMeta}>
              <span>类型: {rating.targetType}</span>
              <span>评分: {rating.rating}</span>
              <span>时间: {rating.createdAt ? new Date(rating.createdAt).toLocaleString('zh-CN') : '-'}</span>
            </div>
            {rating.comment ? <p className={styles.contentText}>{rating.comment}</p> : null}
          </div>
        ))}
      </div>
    );
  };

  const renderMessagesTab = () => {
    if (detail.recentConversations.length === 0) return renderEmpty('暂无最近会话');
    return (
      <div className={styles.stack}>
        {detail.recentConversations.map((chat) => (
          <div key={chat.userId} className={styles.contentCard}>
            <h3 className={styles.contentTitle}>{chat.nickname || `用户 ${chat.userId}`}</h3>
            <div className={styles.contentMeta}>
              <span>对方ID: {chat.userId}</span>
              <span>手机号: {chat.phone || '-'}</span>
              <span>
                最近消息时间:
                {' '}
                {chat.lastMessage?.createdAt ? new Date(chat.lastMessage.createdAt).toLocaleString('zh-CN') : '-'}
              </span>
            </div>
            {chat.lastMessage ? <p className={styles.contentText}>{chat.lastMessage.content}</p> : null}
          </div>
        ))}
      </div>
    );
  };

  const renderVisitedTab = () => {
    if (fpLoading) return renderEmpty('加载中...');
    return (
      <div className={styles.stack}>
        <div className={styles.actionRow}>
          <button className={styles.secondaryButton} type="button" onClick={openFootprintMap}>查看足迹地图</button>
        </div>
        {fpGroups.length === 0 ? renderEmpty('暂无足迹分类组') : null}
        {fpGroups.map((group) => (
          <div key={group.id} className={styles.footprintGroup}>
            <button
              type="button"
              className={styles.footprintGroupButton}
              onClick={() => {
                if (expandedFpGroup === group.id) {
                  setExpandedFpGroup(null);
                  setExpandedFpItems([]);
                  return;
                }
                setExpandedFpGroup(group.id);
                void fetchFootprintItems(group.id);
              }}
            >
              <span className={styles.rowTitle}>
                {expandedFpGroup === group.id ? '收起' : '展开'}
                {' '}
                {group.name}
              </span>
              <span className={styles.rowMeta}>{group.itemCount} 个地点</span>
            </button>
            {expandedFpGroup === group.id ? (
              <div className={styles.footprintGroupItems}>
                {expandedFpItems.length === 0 ? renderEmpty('暂无地点') : null}
                {expandedFpItems.map((item) => (
                  <div key={item.id}>
                    <button
                      type="button"
                      className={`${styles.footprintItemButton} ${expandedItemId === item.listItemId ? styles.footprintItemActive : ''}`}
                      onClick={() => handleToggleItemPhotos(item)}
                    >
                      {item.coverImage ? (
                        <img src={item.coverImage} alt="" className={styles.footprintThumb} />
                      ) : (
                        <div className={styles.footprintThumbPlaceholder} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className={styles.rowTitle}>{item.title || `地点 #${item.listItemId}`}</div>
                        <div className={styles.rowMeta}>{item.address || '-'}</div>
                      </div>
                      <span className={styles.rowMeta}>{photoCounts.get(`item:${item.id}`) || photoCounts.get(`legacy:${item.title || String(item.listItemId)}`) || 0} 张</span>
                    </button>
                    {expandedItemId === item.listItemId ? (
                      <div className={styles.footprintPhotos}>
                        {photosLoading ? renderEmpty('加载中...') : null}
                        {!photosLoading && expandedItemPhotos.length === 0 ? renderEmpty('该地点暂无上传照片') : null}
                        {!photosLoading && expandedItemPhotos.map((photo) => (
                          <div key={photo.id} className={styles.photoCard}>
                            <img
                              src={`/api/storage/file?uid=${userId}&place=${encodeURIComponent(photo.placeTitle)}&file=${encodeURIComponent(photo.filename)}`}
                              alt={photo.filename}
                            />
                            <div className={styles.photoName}>
                              {photo.filename.length > 10 ? `${photo.filename.slice(0, 8)}..` : photo.filename}
                            </div>
                            <button type="button" className={styles.photoDelete} onClick={() => void handleDeletePhoto(photo.id)}>
                              删除
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  const tabContent: Record<DetailTab, React.ReactNode> = {
    profile: renderProfileTab(),
    posts: renderPostsTab(),
    favorites: renderFavoritesTab(),
    favoritePosts: renderFavoritePostsTab(),
    plans: renderPlansTab(),
    comments: renderCommentsTab(),
    friends: renderFriendsTab(),
    visited: renderVisitedTab(),
    ratings: renderRatingsTab(),
    messages: renderMessagesTab(),
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCard}>
          <div className={styles.heroTop}>
            {user.avatar ? (
              <img src={user.avatar} alt="" className={styles.avatar} />
            ) : (
              <div className={styles.avatarPlaceholder}>无图</div>
            )}
            <div className={styles.heroMeta}>
              <h1 className={styles.title}>{user.nickname || '未设置昵称'}</h1>
              <div className={styles.badgeRow}>
                <span className={styles.badge}>账号状态: {user.status || 'normal'}</span>
                <span className={`${styles.badge} ${styles.badgeMuted}`}>注册时间: {user.createdAt ? new Date(user.createdAt).toLocaleDateString('zh-CN') : '-'}</span>
              </div>
            </div>
          </div>

          <div className={styles.detailGrid}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>手机号</span>
              <span className={styles.detailValue}>{user.phone}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>性别</span>
              <span className={styles.detailValue}>{genderText}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>地区</span>
              <span className={styles.detailValue}>{user.region || '-'}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>生日</span>
              <span className={styles.detailValue}>{user.birthday || '-'}</span>
            </div>
          </div>
        </div>

        <aside className={`${styles.heroCard} ${styles.statsCard}`}>
          <h2 className={styles.sectionTitle}>用户统计</h2>
          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>帖子</span>
              <span className={styles.statValue}>{stats.postsCount}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>计划</span>
              <span className={styles.statValue}>{stats.plansCount}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>好友</span>
              <span className={styles.statValue}>{stats.friendsCount}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>评论</span>
              <span className={styles.statValue}>{stats.commentsCount}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>地点收藏</span>
              <span className={styles.statValue}>{stats.favoritePlacesCount}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>帖子收藏</span>
              <span className={styles.statValue}>{stats.favoritePostsCount}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>足迹照片</span>
              <span className={styles.statValue}>{stats.footprintPhotoCount}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>消息会话</span>
              <span className={styles.statValue}>{stats.conversationCount}</span>
            </div>
          </div>
        </aside>
      </section>

      <section className={styles.quickPanels}>
        <div className={styles.panel}>
          <h2 className={styles.sectionTitle}>最近计划</h2>
          <div className={styles.panelList}>
            {detail.plans.slice(0, 3).map((plan) => (
              <div key={plan.id} className={styles.rowItem}>
                <span className={styles.rowTitle}>{plan.name}</span>
                <span className={styles.rowMeta}>
                  {plan.startDate || '-'} 至 {plan.endDate || '-'} / {plan.status || 'normal'}
                </span>
              </div>
            ))}
            {detail.plans.length === 0 ? renderEmpty('暂无计划') : null}
          </div>
          <div className={styles.actionRow}>
            <button type="button" className={styles.secondaryButton} onClick={() => setActiveTab('plans')}>查看全部计划</button>
          </div>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.sectionTitle}>最近好友</h2>
          <div className={styles.panelList}>
            {detail.friends.slice(0, 3).map((friend) => (
              <div key={friend.id} className={styles.rowItem}>
                <span className={styles.rowTitle}>{friend.nickname || `用户 ${friend.id}`}</span>
                <span className={styles.rowMeta}>{friend.phone || '-'} / {friend.createdAt ? new Date(friend.createdAt).toLocaleDateString('zh-CN') : '-'}</span>
              </div>
            ))}
            {detail.friends.length === 0 ? renderEmpty('暂无好友') : null}
          </div>
          <div className={styles.actionRow}>
            <button type="button" className={styles.secondaryButton} onClick={() => setActiveTab('friends')}>查看全部好友</button>
          </div>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.sectionTitle}>最近消息</h2>
          <div className={styles.panelList}>
            {detail.recentConversations.slice(0, 3).map((chat) => (
              <div key={chat.userId} className={styles.rowItem}>
                <span className={styles.rowTitle}>{chat.nickname || `用户 ${chat.userId}`}</span>
                <span className={styles.rowMeta}>
                  {chat.lastMessage?.content || '暂无消息'}
                </span>
              </div>
            ))}
            {detail.recentConversations.length === 0 ? renderEmpty('暂无消息会话') : null}
          </div>
          <div className={styles.actionRow}>
            <button type="button" className={styles.secondaryButton} onClick={() => setActiveTab('messages')}>查看全部会话</button>
          </div>
        </div>
      </section>

      <section>
        <div className={styles.tabs}>
          {(Object.keys(tabLabels) as DetailTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.tabPanel}>
        {tabContent[activeTab]}
      </section>
    </div>
  );
}
