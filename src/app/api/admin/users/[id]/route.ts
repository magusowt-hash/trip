import { NextRequest, NextResponse } from 'next/server';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  comments,
  favorites,
  listItems,
  plans,
  posts,
  ratings,
  storageFiles,
  userListFavorites,
  users,
} from '@/db/schema';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';

function verifyAdminToken(req: NextRequest): NextResponse | null {
  const token = getAdminTokenFromRequest(req);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const [, timestamp] = decoded.split(':');
    if (!timestamp) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    const age = Date.now() - parseInt(timestamp);
    if (age > 7 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
  return null;
}

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as T[];
  }
  if (Array.isArray(result)) {
    return result as T[];
  }
  return [];
}

async function loadFriendRows(userId: number) {
  try {
    return await db.execute(sql`
      SELECT
        f.id,
        f.user_id AS userId,
        f.friend_user_id AS friendUserId,
        f.created_at AS createdAt,
        u.nickname AS friendNickname,
        u.avatar AS friendAvatar,
        u.phone AS friendPhone
      FROM friendships f
      LEFT JOIN users u ON u.id = f.friend_user_id
      WHERE f.user_id = ${userId}
      ORDER BY f.created_at DESC
    `);
  } catch {
    return db.execute(sql`
      SELECT
        f.id,
        f.user_id AS userId,
        f.friend_id AS friendUserId,
        f.created_at AS createdAt,
        u.nickname AS friendNickname,
        u.avatar AS friendAvatar,
        u.phone AS friendPhone
      FROM friends f
      LEFT JOIN users u ON u.id = f.friend_id
      WHERE f.user_id = ${userId}
      ORDER BY f.created_at DESC
    `).catch(() => [] as unknown);
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = verifyAdminToken(req);
  if (authError) return authError;

  const userId = Number(params.id);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: '无效的用户ID' }, { status: 400 });
  }

  try {
    const [user] = await db
      .select({
        id: users.id,
        phone: users.phone,
        nickname: users.nickname,
        avatar: users.avatar,
        gender: users.gender,
        birthday: users.birthday,
        region: users.region,
        status: users.status,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    const [
      userPosts,
      userRatings,
      userFavorites,
      userPlans,
      userComments,
      footprintStorage,
      messageRows,
      favoritePlaceEntries,
    ] = await Promise.all([
      db
        .select({
          id: posts.id,
          userId: posts.userId,
          title: posts.title,
          coverImageUrl: posts.coverImageUrl,
          topic: posts.topic,
          commentsCnt: posts.commentsCnt,
          favoritesCnt: posts.favoritesCnt,
          status: sql<string | null>`NULL`.as('status'),
          createdAt: posts.createdAt,
        })
        .from(posts)
        .where(eq(posts.userId, userId))
        .orderBy(desc(posts.createdAt))
        .catch(() => []),
      db
        .select()
        .from(ratings)
        .where(eq(ratings.userId, userId))
        .orderBy(desc(ratings.createdAt))
        .catch(() => []),
      db
        .select({
          id: favorites.id,
          postId: favorites.postId,
          createdAt: favorites.createdAt,
          postTitle: posts.title,
        })
        .from(favorites)
        .leftJoin(posts, eq(favorites.postId, posts.id))
        .where(eq(favorites.userId, userId))
        .orderBy(desc(favorites.createdAt))
        .catch(() => []),
      db
        .select({
          id: plans.id,
          name: plans.name,
          startDate: plans.startDate,
          endDate: plans.endDate,
          status: plans.status,
          createdAt: plans.createdAt,
        })
        .from(plans)
        .where(eq(plans.userId, userId))
        .orderBy(desc(plans.createdAt))
        .catch(() => []),
      db
        .select({
          id: comments.id,
          postId: comments.postId,
          content: comments.content,
          status: comments.status,
          createdAt: comments.createdAt,
          postTitle: posts.title,
        })
        .from(comments)
        .leftJoin(posts, eq(comments.postId, posts.id))
        .where(eq(comments.userId, userId))
        .orderBy(desc(comments.createdAt))
        .catch(() => []),
      db
        .select({
          id: storageFiles.id,
          placeTitle: storageFiles.placeTitle,
          filename: storageFiles.filename,
        })
        .from(storageFiles)
        .where(eq(storageFiles.userId, userId))
        .catch(() => []),
      db.execute(sql`
        SELECT
          CASE WHEN sender_id = ${userId} THEN receiver_id ELSE sender_id END AS other_user_id,
          MAX(id) AS last_message_id
        FROM messages
        WHERE sender_id = ${userId} OR receiver_id = ${userId}
        GROUP BY CASE WHEN sender_id = ${userId} THEN receiver_id ELSE sender_id END
        ORDER BY MAX(id) DESC
        LIMIT 8
      `).catch(() => [] as unknown),
      db
        .select({
          listItemId: userListFavorites.listItemId,
          addedAt: userListFavorites.createdAt,
        })
        .from(userListFavorites)
        .where(eq(userListFavorites.userId, userId))
        .orderBy(desc(userListFavorites.createdAt))
        .catch(() => []),
    ]);

    const friendRowsResult = await loadFriendRows(userId);
    const friendLinks = extractRows<{
      id: number | string;
      userId: number | string;
      friendUserId: number | string;
      createdAt: string;
      friendNickname: string | null;
      friendAvatar: string | null;
      friendPhone: string | null;
    }>(friendRowsResult);

    const ratingTargetIds = new Set<number>();
    for (const rating of userRatings) {
      if (rating.targetType === 'list_item') {
        ratingTargetIds.add(rating.targetId);
      }
    }
    for (const entry of favoritePlaceEntries) {
      if (entry.listItemId) {
        ratingTargetIds.add(entry.listItemId);
      }
    }

    const targetItems = ratingTargetIds.size
      ? await db
          .select({ id: listItems.id, title: listItems.title })
          .from(listItems)
          .where(inArray(listItems.id, [...ratingTargetIds]))
      : [];
    const listItemTitleMap = new Map(targetItems.map((item) => [item.id, item.title]));

    const ratingDetails = userRatings.map((rating) => ({
      ...rating,
      targetTitle: rating.targetType === 'list_item' ? (listItemTitleMap.get(rating.targetId) || null) : null,
    }));

    const favoritePlaces = favoritePlaceEntries.map((entry) => ({
      listItemId: entry.listItemId,
      addedAt: entry.addedAt instanceof Date ? entry.addedAt.toISOString() : String(entry.addedAt),
      title: listItemTitleMap.get(entry.listItemId) || null,
    }));

    const storageCountByTitle = new Map<string, number>();
    for (const file of footprintStorage) {
      storageCountByTitle.set(file.placeTitle, (storageCountByTitle.get(file.placeTitle) || 0) + 1);
    }

    const messageIdRows = extractRows<{ last_message_id: number | string; other_user_id: number | string }>(messageRows);
    const messageIds = messageIdRows
      .map((row) => Number(row.last_message_id))
      .filter((value) => Number.isFinite(value));
    const otherUserIds = messageIdRows
      .map((row) => Number(row.other_user_id))
      .filter((value) => Number.isFinite(value));

    const [lastMessages, messagePeers] = await Promise.all([
      messageIds.length
        ? db.execute(sql`
            SELECT id, sender_id, receiver_id, content, is_read, created_at
            FROM messages
            WHERE id IN (${sql.join(messageIds.map((id) => sql`${id}`), sql`, `)})
          `).catch(() => [] as unknown)
        : Promise.resolve([] as unknown),
      otherUserIds.length
        ? db
            .select({
              id: users.id,
              nickname: users.nickname,
              avatar: users.avatar,
              phone: users.phone,
            })
            .from(users)
            .where(inArray(users.id, otherUserIds))
        : Promise.resolve([]),
    ]);

    const messageMap = new Map<number, any>();
    for (const row of extractRows<any>(lastMessages)) {
      messageMap.set(Number(row.id), row);
    }
    const peerMap = new Map(messagePeers.map((peer) => [peer.id, peer]));

    const recentConversations = messageIdRows.map((row) => {
      const peerId = Number(row.other_user_id);
      const message = messageMap.get(Number(row.last_message_id));
      const peer = peerMap.get(peerId);
      return {
        userId: peerId,
        nickname: peer?.nickname || null,
        avatar: peer?.avatar || null,
        phone: peer?.phone || null,
        lastMessage: message
          ? {
              id: Number(message.id),
              senderId: Number(message.sender_id),
              receiverId: Number(message.receiver_id),
              content: message.content,
              isRead: Number(message.is_read),
              createdAt: message.created_at,
            }
          : null,
      };
    });

    const stats = {
      postsCount: userPosts.length,
      favoritePlacesCount: favoritePlaces.length,
      favoritePostsCount: userFavorites.length,
      plansCount: userPlans.length,
      ratingsCount: ratingDetails.length,
      commentsCount: userComments.length,
      friendsCount: friendLinks.length,
      footprintPhotoCount: footprintStorage.length,
      footprintPlaceCount: storageCountByTitle.size,
      conversationCount: recentConversations.length,
    };

    return NextResponse.json({
      user: {
        ...user,
        favoriteLists: favoritePlaces,
        ratingDetails,
      },
      stats,
      posts: userPosts,
      favoritePosts: userFavorites,
      plans: userPlans,
      comments: userComments,
      friends: friendLinks.map((item) => ({
        id: Number(item.friendUserId),
        nickname: item.friendNickname,
        avatar: item.friendAvatar,
        phone: item.friendPhone,
        createdAt: item.createdAt,
      })),
      recentConversations,
    });
  } catch (error: any) {
    console.error('Admin user detail error:', error);
    return NextResponse.json({ error: '获取用户详情失败' }, { status: 500 });
  }
}
