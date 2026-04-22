# 收藏功能开发文档

## 概述
实现用户收藏帖子功能，支持 toggle 收藏状态，用户个人页面查看收藏列表，管理后台查看收藏统计。

## 数据库设计

### 已有表
- `posts`: 帖子表，增加 `favorites_cnt` 计数器
- `favorites`: 收藏关系表

#### favorites 表结构
```sql
CREATE TABLE `favorites` (
  `id` int NOT NULL AUTO_INCREMENT,
  `post_id` int NOT NULL,
  `user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_post_user` (`post_id`,`user_id`),
  KEY `idx_post_id` (`post_id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `FK_favorites_post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_favorites_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## API 接口

### 1. POST /api/posts/[id]/favorite
- **功能**: 切换收藏状态（收藏/取消收藏）
- **认证**: 需要登录（从 cookie 获取 JWT）
- **请求**: 无 Body
- **响应成功**:
  ```json
  {
    "favorited": boolean,   // 当前是否已收藏
    "favoritesCnt": number  // 帖子当前收藏总数
  }
  ```
- **响应错误**:
  - 401 未登录: `{ "error": "请先登录" }`
  - 400 无效ID: `{ "error": "无效的帖子ID" }`
  - 500 服务器错误: `{ "error": "操作失败" }`

### 2. GET /api/favorites
- **功能**: 获取当前用户收藏列表（分页）
- **认证**: 需要登录
- **查询参数**:
  - `limit`: 每页数量 (默认 20, 最大 50)
  - `cursor`: 分页游标 (上次返回的 `nextCursor`)
- **响应成功**:
  ```json
  {
    "favorites": [
      {
        "id": number,           // 收藏记录ID
        "postId": number,       // 帖子ID
        "title": string,        // 帖子标题
        "coverImageUrl": string|null, // 封面图
        "topic": string,        // 帖子话题
        "createdAt": string     // 收藏时间 (ISO 8601)
      }
    ],
    "nextCursor": string|null, // 下一页游标，null表示无更多
    "hasMore": boolean         // 是否还有更多数据
  }
  ```
- **响应错误**: 同上

### 3. GET /api/admin/favorites
- **功能**: 管理后台收藏列表（分页）
- **认证**: 管理员Cookie（后台系统）
- **查询参数**:
  - `page`: 页码 (默认 1)
  - `pageSize`: 每页数量 (默认 10)
- **响应成功**:
  ```json
  {
    "favorites": [
      {
        "id": number,
        "postId": number,
        "userId": number,
        "createdAt": string,
        "postTitle": string,
        "userNickname": string
      }
    ],
    "total": number  // 总收藏数
  }
  ```

## 前端实现

### 核心 Hook
- `src/hooks/useUserFavorites.ts`: 负责获取用户收藏列表，支持分页加载

### 主要页面/组件
1. **PostDetailModal** (`src/modules/post/PostDetailModal/index.tsx`)
   - 收藏按钮状态：实心❤️（已收藏）/空心🤍（未收藏）
   - 点击时调用 `/api/posts/[id]/favorite` API
   - 乐观更新本地收藏数和状态

2. **用户个人页** (`src/app/(shell)/user/UserMine.tsx`)
   - 新增 Tab 切换功能：我的帖子 / 我的收藏
   - 使用 `useUserFavorites` hook 获取收藏数据
   - 与我的帖子共享相同的瀑布流布局

3. **用户收藏列表页** (`src/app/(shell)/user/favorites/page.tsx`)
   - 完整的收藏列表页面（直接路由 `/user/favorites`）
   - 使用相同布局和样式

4. **攻略弹窗** (`src/app/(shell)/plan/page.tsx`)
   - 点击「+ 添加攻略」弹出 Modal
   - Modal 内展示用户收藏的帖子（双列封面图+标题）
   - 支持分页（每页6条）
   - 点击封面后将对应帖子导入到攻略编辑器中

5. **管理后台** (`src/app/api/admin/favorites/route.ts`)
   - 提供收藏总览接口，供后台系统使用

## 样式文件
- `src/app/(shell)/plan/plan-page.module.css`: 新增攻略弹窗相关样式（`.guideModal*` 系列）
- `src/app/(shell)/user/page.module.css`: 新增 Tab 切换样式（`.tabBar`, `.tab`, `.tabActive`）

## 依赖
- 后端: Next.js App Router, Drizzle ORM, MySQL
- 前端: React, React Hooks (useState, useEffect, useMemo, useCallback, useRef)
- 通用: `next/navigation`, `next/link`

## 测试验证
1. 登录状态下可收藏/取消收藏帖子
2. 收藏状态在 PostDetailModal 中实时更新（❤️/🤍）
3. 用户个人页 Tab 能正常切换显示帖子/收藏列表
4. 收藏列表页可访问并展示正确数据
5. 攻略编辑器中的「+ 添加攻略」弹出收藏列表，可选择导入
6. 管理员可通过 `/api/admin/favorites` 查看所有收藏记录

## 注意事项
- 所有 API 依赖登录状态，未登录时会返回 401
- 收藏关系通过唯一索引防止重复收藏
- 前端采用乐观更新提升体验，后端实际写库后返回最新状态
- 分页使用 cursor-based 方式，更适合实时变化的数据流