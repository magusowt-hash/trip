# Trip Web 前端说明（后端对接用）

本文档面向**后端与联调同学**，概括当前前端实现、路由、环境变量与数据契约建议，便于约定 REST/鉴权/CORS 与联调排期。产品级说明见 [`development-summary.md`](./development-summary.md)；部署见 [`deployment.md`](./deployment.md)。

---

## 1. 技术栈与仓库结构

| 项 | 说明 |
|----|------|
| 框架 | Next.js 14（App Router）、React 18、TypeScript |
| 样式 | 全局 CSS（`src/styles/tokens.css`、`base.css`），部分页面 CSS Modules |
| HTTP | 原生 `fetch` 封装于 `src/services/request.ts` |
| 构建 | `next build`；生产可用 `output: 'standalone'`（见 `next.config.mjs`）、`Dockerfile` |

**常用目录：**

| 路径 | 职责 |
|------|------|
| `src/app` | 路由、`layout.tsx`、`api/*`（Next Route Handlers） |
| `src/app/(shell)` | 带统一**顶栏 + 左侧栏**的业务页（发现 / 计划 / 消息 / 用户等） |
| `src/modules` | 业务模块（如 `post` 帖子卡片与详情弹层） |
| `src/components` | 通用 UI、布局（`layout/Header`、`AppSidebar`、`ShellLayout`） |
| `src/services` | `request.ts`、`api.ts`、拦截器 |
| `src/config` | 环境读取等 |

---

## 2. 路由一览（联调范围）

### 2.1 Shell 内页面（`src/app/(shell)/`）

共享 **`Header` + `AppSidebar` + 主内容区**；主内容区单独滚动，侧栏不随文档滚动（`shell-root--scroll-lock`）。

| 路径 | 说明 | 数据现状 |
|------|------|----------|
| `/` | 重定向至 `/explore` | — |
| `/explore` | **发现**：四列瀑布流帖子卡片 | 前端 **本地 demo 数组**，未接 API |
| `/plan` | 计划页（示例计划 + 收藏） | 静态演示数据 |
| `/messages` | 消息（私信 / 通知 Tab + 会话列表 UI） | 静态演示数据 |
| `/user` | 个人主页（头像、统计、菜单列表） | 静态 + `NEXT_PUBLIC_APP_VERSION` |
| `/placeholder` | 重定向至 `/plan` | — |

### 2.2 Shell 外页面（独立布局）

| 路径 | 说明 |
|------|------|
| `/search` | 重定向至 `/explore` |
| （无独立路由） | **发布**：侧栏「+」或底部栏「+」打开全局 `PostComposeModal`（见 `PublishFlowProvider`） |
| `/post/[id]` | 帖子详情状态演示 |
| `/itinerary` | 行程演示 |
| `/components` | 组件验收页 |

### 2.3 前端自身探活（非业务后端）

- `GET /api/health`：Next Route Handler，返回 JSON（`status: ok`、`service: trip-web`、`timestamp`），供负载均衡/容器健康检查，**不依赖后端服务**。

---

## 3. 环境变量（与后端联调强相关）

模板见仓库根目录 **`build.env`**（可复制为 `.env.production` / 平台环境变量）。

| 变量 | 必填 | 说明 |
|------|------|------|
| `NEXT_PUBLIC_API_BASE_URL` | 联调后端时必填 | 浏览器请求用的 **API 根地址**（无尾斜杠），如 `https://api.example.com`。空字符串时前端请求发往同源。 |
| `NEXT_PUBLIC_SITE_URL` | 生产建议填 | 站点绝对地址，用于 `metadata`、`sitemap`、`robots`。 |
| `NEXT_PUBLIC_APP_NAME` | 可选 | 应用名称（标题模板等）。 |
| `NEXT_PUBLIC_APP_VERSION` | 可选 | 个人页等展示用版本号。 |
| `DATABASE_URL` | 认证启用时必填 | 外部 Postgres 连接串（Drizzle/pg 用）。 |
| `AUTH_JWT_SECRET` | 认证启用时必填 | JWT 签名密钥（用于 `/api/auth/*`）。 |
| `AUTH_COOKIE_NAME` | 可选 | 登录态 cookie 名（默认 `trip_auth`）。 |
| `AUTH_BCRYPT_SALT_ROUNDS` | 可选 | bcrypt cost factor（默认 12；>=10 推荐）。 |

**重要：** 所有 `NEXT_PUBLIC_*` 在 **构建期** 打入前端包；Docker 构建已通过 `ARG` 传入（见 `Dockerfile`）。修改后需**重新 build** 才在浏览器生效。

补充：`DATABASE_URL` / `AUTH_JWT_SECRET` 等非 `NEXT_PUBLIC_*` 变量由 Node 服务端在运行时读取。

**CORS：** 浏览器直接请求 `NEXT_PUBLIC_API_BASE_URL` 时，后端需允许当前站点 `Origin`，并按约定暴露所需响应头（若使用 `Authorization` / Cookie）。

## 3.1 本地仅跑前端（后端/数据库已部署，使用远程 API）

- 前端环境：确保 `NEXT_PUBLIC_API_BASE_URL` 指向你已部署的后端服务根地址（无尾斜杠），例如 `https://api.example.com`。
- 本地不需要部署后端/数据库：`DATABASE_URL` / `AUTH_JWT_SECRET` 只有在你想让 `src/middleware.ts` 做未登录重定向时才需要。
- 若本地未配置 `AUTH_JWT_SECRET`，middleware 会自动跳过保护（便于先把前端跑起来），登录成功后仍可通过 cookie 访问后续页面。

---

## 4. HTTP 客户端约定

- 实现：`src/services/request.ts`  
  - `BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? ''`  
  - 默认 `Content-Type: application/json`、`cache: 'no-store'`  
  - 非 2xx：读取 `response.text()` 后 `throw`，经 `src/services/interceptors.ts` 的 `onRequestError` 处理（当前较薄，可扩展错误码/登出）。

- 示例调用：`src/services/api.ts` 中 `getHealth()` 请求 **`/health`**（指 **后端** 根路径下的 health，与 Next 的 `/api/health` 不同）。

**待与后端对齐的建议项：**

1. 统一错误响应体（如 `{ code, message, details }`）与 HTTP 状态码表。  
2. 鉴权：Bearer Token / Cookie 名、刷新策略、401/403 时前端行为。  
3. 分页/游标字段命名（如 `page`、`pageSize` 或 `cursor`）。  
4. 是否提供 **OpenAPI 3** 或导出 Postman Collection，便于生成类型（可配合 `openapi-typescript`）。

---

## 5. 核心业务数据形状（建议与后端对齐）

### 5.1 帖子（发现流 + 详情弹层）

发现页卡片与详情弹层共用一套字段来源，类型见 `src/modules/post/PostDetailModal/types.ts`。

**帖子主体（`PostDetailModalProps` 中与列表/详情相关的字段）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `cover` | `string` | 封面图 URL |
| `topic` | `string` | 话题/分类标签（与侧栏筛选相关，见下节） |
| `title` | `string` | 标题 |
| `content` | `string?` | 正文摘要或详情 |
| `author` | `string` | 作者昵称 |
| `avatar` | `string?` | 作者头像 URL |
| `gallery` | `string[]?` | 多图图集（详情内轮播/全屏查看） |
| `comments` | `number?` | 评论数（卡片上可不展示，弹层仍可用） |
| `favorites` | `number?` | 点赞/收藏数（同上） |

**评论项（弹层内列表，若后端分页需另约定）：**

```ts
// CommentItem
{ id: string; name: string; avatar: string; text: string; time: string }
```

### 5.2 发现页分类（侧栏）

定义于 `src/components/layout/ExploreFeedContext.tsx`：

- 分类常量：`['推荐', '城市漫游', '海边假期', '避坑指南', '摄影灵感']`
- 逻辑：**「推荐」** 展示全部；其它选项按 `item.topic === activeCategory` 过滤。

后端若用 **分类 ID** 或 **slug**，建议提供映射表或与 `topic` 字符串一致，避免前端硬编码多套体系。

### 5.3 消息页（UI 占位）

`MessagesClient` 使用本地数组展示会话行。对接时可约定例如：`/conversations`、`/notifications` 的分页列表与未读数字段。

### 5.4 用户页

`UserMine` 为展示型页面；登录态、用户信息、订单/收藏统计等需后端会话与接口约定。

### 5.5 登录/注册与鉴权（新增，仓库内置）
当前仓库已实现：
- `POST /api/auth/register`：`{ phone, password, confirmPassword }`（成功写入 httpOnly cookie）
- `POST /api/auth/login`：`{ phone, password }`（成功写入 httpOnly cookie）
- `GET /api/auth/me`：返回当前登录用户简表（未登录返回 401）
- `POST /api/auth/logout`：清除 cookie（204）

#### 5.5.1 用户表结构（Postgres + Drizzle）

- 表名：`users`
- 字段：
  - `id SERIAL PRIMARY KEY`
  - `phone VARCHAR(32) UNIQUE NOT NULL`
  - `password_hash VARCHAR(255) NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Drizzle 定义见 `src/db/schema.ts`：

```ts
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    phone: varchar('phone', { length: 32 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    phoneUnique: uniqueIndex('users_phone_unique').on(t.phone),
  }),
);
```

#### 5.5.2 密码加密与存储方案

- 使用 `bcryptjs` 作为密码哈希库（见 `src/server/auth/password.ts`）：
  - `hashPassword(password: string)`：内部调用 `bcrypt.hash`，salt 轮数由 `AUTH_BCRYPT_SALT_ROUNDS` 控制（默认 12）。
  - `verifyPassword(password: string, passwordHash: string)`：使用 `bcrypt.compare` 验证。
- 数据库中只存 `password_hash`（哈希结果），**不存任何明文或可逆加密密码**。
- 日志与接口响应中不会返回或打印密码 / `password_hash`。

登录态：cookie 名为 `AUTH_COOKIE_NAME`（默认 `trip_auth`），cookie 内保存 JWT（HS256）。
受保护页面：`src/middleware.ts` 未登录会重定向到 `/login`。

---

## 6. 建议的 REST 资源映射（非已实现，供排期参考）

以下仅为与当前 UI 模块对应关系，**路径以实际 OpenAPI 为准**：

| 前端模块 | 建议方向 |
|----------|----------|
| `GET /explore` 数据 | `GET /posts` 或 `GET /feed`，支持 `category`、`cursor`/`page` |
| 帖子详情 | `GET /posts/{id}`，含 `gallery`、`author`、计数等 |
| 评论 | `GET/POST /posts/{id}/comments` |
| 计划 | `GET/POST /plans`、收藏关系等 |
| 消息 | `GET /conversations`、`GET /notifications` |
| 用户 | `GET /api/auth/me`（鉴权必需，仓库内置）；如需资料编辑可由后端扩展 |
| 健康检查 | 后端独立 `GET /health`（与 Next ` /api/health` 区分） |

---

## 7. 构建与本地命令

```bash
npm install
npm run dev          # 开发
npm run build        # 生产构建
npm run lint         # ESLint
```

Docker：`docker compose` / `docker build` 参见 `Dockerfile` 与 `docs/deployment.md`。

---

## 8. 联调自检清单

- [ ] `.env.local` / 生产环境已配置 `NEXT_PUBLIC_API_BASE_URL` 并已重新构建前端。  
- [ ] 认证所需服务端变量已配置：`DATABASE_URL`、`AUTH_JWT_SECRET`（以及可选 `AUTH_COOKIE_NAME`）。  
- [ ] `/api/auth/register` / `/api/auth/login` 成功后会写入 `AUTH_COOKIE_NAME` cookie，并可正常访问受保护页面（如 `/explore`）。  
- [ ] 后端 CORS 允许前端站点；若 Cookie 鉴权，配置 `SameSite` / HTTPS。  
- [ ] 浏览器 Network 中接口域名、路径、401/403 行为符合预期。  
- [ ] 帖子字段与分类、筛选逻辑与 `topic` / 分类参数一致。  
- [ ] 健康检查：运维使用 Next `GET /api/health`；业务集群探活使用后端的 `/health`（或统一网关路径）。

---

## 9. 关联文档

| 文档 | 用途 |
|------|------|
| [`development-summary.md`](./development-summary.md) | 前端实现总览、目录与组件 |
| [`deployment.md`](./deployment.md) | Docker、Nginx、环境变量、上线 |
| [`operations-readiness.md`](./operations-readiness.md) | 运营与安全 |
| [`frontend-porting.md`](./frontend-porting.md) | 迁移/换仓库注意事项 |
| 根目录 [`README.md`](../README.md) | 入口索引 |

---

*文档版本：与仓库当前代码同步维护；接口以实际 OpenAPI/联调为准。*
