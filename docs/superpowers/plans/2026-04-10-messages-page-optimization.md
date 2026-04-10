# 消息页面优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复消息列表为空问题，优化前端逻辑减少请求，合并通知到消息列表，删除"私信"标题和分割线

**Architecture:** 前后端分离架构，前端 Next.js，后端 Nest.js。前端修复数据加载逻辑，后端优化SQL查询并新增通知API。

**Tech Stack:** React, Next.js, TypeScript, Nest.js, TypeORM

---

## 文件结构

**前端：**
- Modify: `src/app/(shell)/messages/MessagesClient.tsx` - 消息页面主组件，修复加载逻辑，合并通知
- Modify: `src/app/(shell)/messages/messages.module.css` - 样式调整
- Modify: `src/services/api.ts` - 新增 getNotices API

**后端：**
- Modify: `trip-backend/src/message/message.service.ts` - 优化 getRecentChats SQL，新增 getNotices
- Modify: `trip-backend/src/message/message.controller.ts` - 新增 getNotices 接口

---

## 任务一：后端优化 getRecentChats SQL

**Files:**
- Modify: `trip-backend/src/message/message.service.ts:44-120`

- [ ] **Step 1: 读取现有 message.service.ts 文件**

```typescript
// 查看现有 getRecentChats 方法实现
```

- [ ] **Step 2: 优化 SQL 查询逻辑**

将现有的复杂查询改为更简洁高效的子查询方式：

```typescript
async getRecentChats(userId: number, limit = 20): Promise<ChatWithUser[]> {
  // 使用子查询获取每个对话的最新消息
  const subQuery = this.messages
    .createQueryBuilder('m')
    .select('CASE WHEN m.sender_id = :userId THEN m.receiver_id ELSE m.sender_id END', 'other_user_id')
    .addSelect('MAX(m.id)', 'last_msg_id')
    .where('m.sender_id = :userId OR m.receiver_id = :userId', { userId })
    .groupBy('CASE WHEN m.sender_id = :userId THEN m.receiver_id ELSE m.sender_id END')
    .setParameter('userId', userId);

  const results = await this.messages
    .createQueryBuilder('m')
    .innerJoin(
      `(${subQuery.getQuery()})`,
      'sub',
      'm.id = sub.last_msg_id'
    )
    .leftJoinAndSelect('users', 'u', 'u.id = sub.other_user_id')
    .select([
      'sub.other_user_id as userId',
      'u.nickname',
      'u.avatar',
      'm.content',
      'm.sender_id',
      'm.receiver_id',
      'm.is_read',
      'm.created_at',
    ])
    .setParameters(subQuery.getParameters())
    .orderBy('m.created_at', 'DESC')
    .limit(limit)
    .getRawMany();

  // 获取未读数
  const unreadCounts = await this.messages
    .createQueryBuilder('m')
    .select('m.sender_id', 'senderId')
    .addSelect('COUNT(*)', 'count')
    .where('m.receiver_id = :userId', { userId })
    .andWhere('m.is_read = 0')
    .groupBy('m.sender_id')
    .getRawMany();

  const unreadMap = new Map(unreadResults.map(u => [Number(u.senderId), Number(u.count)]));

  return results.map(r => ({
    userId: Number(r.userId),
    nickname: r.u_nickname,
    avatar: r.u_avatar,
    lastMessage: {
      id: Number(r.m_id),
      senderId: Number(r.m_sender_id),
      receiverId: Number(r.m_receiver_id),
      content: r.m_content,
      isRead: r.m_is_read,
      createdAt: r.m_created_at,
    },
    unreadCount: unreadMap.get(Number(r.userId)) || 0,
  }));
}
```

- [ ] **Step 3: 运行后端测试验证**

```bash
cd /root/trip/trip-backend
npm run start:dev
# 使用 Postman 测试 /api/message/chats 接口
```

- [ ] **Step 4: 提交代码**

```bash
git add trip-backend/src/message/message.service.ts
git commit -m "fix: optimize getRecentChats SQL query"
```

---

## 任务二：后端新增 getNotices API

**Files:**
- Modify: `trip-backend/src/message/message.service.ts` - 新增 getNotices 方法
- Modify: `trip-backend/src/message/message.controller.ts` - 新增接口

- [ ] **Step 1: 在 message.service.ts 添加 getNotices 方法**

```typescript
interface Notice {
  id: number;
  content: string;
  createdAt: string;
  type: string;
  isRead: number;
}

async getNotices(userId: number, limit = 20): Promise<Notice[]> {
  // sender_id = 0 表示系统通知
  return this.messages.find({
    where: { senderId: 0 },
    order: { createdAt: 'DESC' },
    take: limit,
  });
}
```

- [ ] **Step 2: 在 message.controller.ts 添加接口**

```typescript
@Get('notices')
async getNotices(@Req() req: AuthRequest, @Query('limit') limit?: string) {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedException();
  const notices = await this.messageService.getNotices(userId, limit ? Number(limit) : 20);
  return { notices };
}
```

- [ ] **Step 3: 测试新接口**

```bash
# 使用 Postman 测试 /api/message/notices 接口
```

- [ ] **Step 4: 提交代码**

```bash
git add trip-backend/src/message/message.service.ts trip-backend/src/message/message.controller.ts
git commit -m "feat: add getNotices API for system notifications"
```

---

## 任务三：前端新增 getNotices API

**Files:**
- Modify: `src/services/api.ts`

- [ ] **Step 1: 在 api.ts 添加 getNotices 类型和函数**

```typescript
export interface Notice {
  id: number;
  content: string;
  createdAt: string;
  type?: string;
  isRead: number;
}

export async function getNotices(): Promise<{ notices: Notice[] }> {
  return request<{ notices: Notice[] }>('/api/message/notices');
}
```

- [ ] **Step 2: 提交代码**

```bash
git add src/services/api.ts
git commit -m "feat: add getNotices API to frontend"
```

---

## 任务四：前端修复消息列表加载逻辑

**Files:**
- Modify: `src/app/(shell)/messages/MessagesClient.tsx:287-317`

- [ ] **Step 1: 添加加载状态**

在 MessagesClient 组件中添加 loading 状态：

```typescript
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
```

- [ ] **Step 2: 修改 loadData 函数添加错误处理**

```typescript
async function loadData() {
  setLoading(true);
  setError(null);
  try {
    const [profile, friendsData] = await Promise.all([
      getUserProfile(),
      getFriends()
    ]);
    setCurrentUserId(profile.user.id);
    setFriends(friendsData.friends ?? []);
    
    const chats = await getRecentChats();
    const mappedChats: InboxItem[] = (chats.chats ?? []).map((chat) => {
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
    setRecentChats(mappedChats);
  } catch (e) {
    console.error('获取用户信息失败', e);
    setError('加载失败，请重试');
  } finally {
    setLoading(false);
  }
}
```

- [ ] **Step 3: 在 UI 中显示加载状态和错误**

在消息列表区域添加：

```typescript
{loading ? (
  <p className={styles.emptyHint}>加载中...</p>
) : error ? (
  <p className={styles.emptyHint}>{error}</p>
) : list.length === 0 ? (
  <p className={styles.emptyHint}>暂无消息</p>
) : (
  // 现有列表渲染
)}
```

- [ ] **Step 4: 提交代码**

```bash
git add src/app/(shell)/messages/MessagesClient.tsx
git commit -m "fix: add loading state and error handling for messages"
```

---

## 任务五：前端合并通知到消息列表

**Files:**
- Modify: `src/app/(shell)/messages/MessagesClient.tsx:209-317`

- [ ] **Step 1: 移除 tab 状态，只保留 chat**

删除 TabKey 类型和 tab 状态，删除通知 tab 相关代码：

```typescript
// 删除这些代码：
// type TabKey = 'chat' | 'notice';
// const [tab, setTab] = useState<TabKey>('chat');
```

- [ ] **Step 2: 修改 loadData 同时获取通知**

```typescript
async function loadData() {
  setLoading(true);
  setError(null);
  try {
    const [profile, friendsData, chatsData, noticesData] = await Promise.all([
      getUserProfile(),
      getFriends(),
      getRecentChats(),
      getNotices()
    ]);
    setCurrentUserId(profile.user.id);
    setFriends(friendsData.friends ?? []);
    
    // 处理消息列表
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
    
    // 处理通知列表
    const mappedNotices: InboxItem[] = (noticesData.notices ?? []).map((notice) => ({
      id: `notice_${notice.id}`,
      name: '通知消息',
      preview: notice.content,
      time: notice.createdAt ? new Date(notice.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '',
      unread: notice.isRead === 0 ? 1 : 0,
      avatar: '/notification-icon.svg',
      isSystem: true,
    }));
    
    // 合并并按时间排序
    const allItems = [...mappedChats, ...mappedNotices].sort((a, b) => {
      if (!a.time || !b.time) return 0;
      return new Date(b.time).getTime() - new Date(a.time).getTime();
    });
    
    setRecentChats(allItems);
  } catch (e) {
    console.error('获取数据失败', e);
    setError('加载失败，请重试');
  } finally {
    setLoading(false);
  }
}
```

- [ ] **Step 3: 修改列表渲染区分系统通知**

```typescript
// 在 convRow 渲染时
list.map((item) => (
  <button 
    key={item.id} 
    type="button" 
    className={`${styles.convRow} ${item.isSystem ? styles.systemNoticeRow : ''}`} 
    onClick={() => item.isSystem ? handleNoticeClick(item) : handleChatClick(item)}
  >
    <img 
      className={styles.avatar} 
      src={item.avatar} 
      alt="" 
    />
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
```

- [ ] **Step 4: 提交代码**

```bash
git add src/app/(shell)/messages/MessagesClient.tsx
git commit -m "feat: merge notices into messages list"
```

---

## 任务六：前端删除"私信"标题和分割线

**Files:**
- Modify: `src/app/(shell)/messages/MessagesClient.tsx:530-551`
- Modify: `src/app/(shell)/messages/messages.module.css`

- [ ] **Step 1: 删除 tab 区域的"私信"标题**

修改 MessagesClient.tsx 中的 header 部分：

```typescript
// 删除 tabs 显示，只保留 tab 切换但无标题
<header className={styles.header}>
  <div className={styles.tabs} role="tablist">
    <button
      type="button"
      role="tab"
      aria-selected={true}
      className={`${styles.tab} ${styles.tabActive}`}
      onClick={() => {}}
    >
      私信
    </button>
  </div>
</header>
```

- [ ] **Step 2: 删除 messages.module.css 中的分割线样式**

找到并删除或注释掉 tab 区域的 border-bottom：

```css
/* 修改前 */
.tabs {
  display: flex;
  gap: 28px;
  margin-top: 14px;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0;
}

/* 修改后 */
.tabs {
  display: flex;
  gap: 28px;
  margin-top: 14px;
  border-bottom: none;
  padding-bottom: 0;
}
```

- [ ] **Step 3: 提交代码**

```bash
git add src/app/(shell)/messages/MessagesClient.tsx src/app/(shell)/messages/messages.module.css
git commit -m "feat: remove private message title and tab divider"
```

---

## 任务七：测试和验证

**Files:**
- 测试所有 API 和 UI 功能

- [ ] **Step 1: 后端测试**

```bash
# 启动后端服务
cd /root/trip/trip-backend
npm run start:dev

# 测试接口：
# 1. GET /api/message/chats - 获取最近消息列表
# 2. GET /api/message/notices - 获取通知列表
```

- [ ] **Step 2: 前端测试**

```bash
# 启动前端
cd /root/trip
npm run dev

# 访问 /messages 页面
# 1. 验证消息列表正常显示
# 2. 验证通知消息正常显示
# 3. 验证"私信"标题已删除
# 4. 验证 tab 分割线已删除
```

- [ ] **Step 3: 提交最终代码**

```bash
git add .
git commit -m "feat: complete messages page optimization"
```