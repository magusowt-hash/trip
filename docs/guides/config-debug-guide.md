# Trip Web 配置调试指南

## 目录
- [环境变量配置](#环境变量配置)
- [项目结构](#项目结构)
- [API 接口配置](#api-接口配置)
- [数据库配置](#数据库配置)
- [认证配置](#认证配置)
- [常见问题排查](#常见问题排查)
- [部署配置](#部署配置)

---

## 环境变量配置

### 必需的环境变量 (.env.local)

```bash
# 浏览器端配置 (NEXT_PUBLIC_* 会打进前端包)
NEXT_PUBLIC_API_BASE_URL=          # 外置后端时填写，如 http://127.0.0.1:3000 或 /api
NEXT_PUBLIC_APP_NAME=Trip Web
NEXT_PUBLIC_SITE_URL=http://121.5.24.138:3000
NEXT_PUBLIC_APP_VERSION=0.1.0

# 服务端配置 (仅 Node 运行时读取)
DATABASE_URL=mysql://magus:3W.xh.com@127.0.0.1:3306/trip
AUTH_JWT_SECRET=3W.xh.com
AUTH_COOKIE_SECURE=false
```

### 环境变量说明

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `NEXT_PUBLIC_API_BASE_URL` | 否 | 前端 API 基地址。为空时走 Next.js 内置 API (`/api/*`)，有值时代理到后端 |
| `AUTH_JWT_SECRET` | 是 | JWT 密钥，必须与后端一致，否则 middleware 验证失败 |
| `DATABASE_URL` | 是 | MySQL 连接字符串 |
| `AUTH_COOKIE_SECURE` | 否 | HTTPS 时设为 true，生产环境建议 true |

---

## 项目结构

```
trip/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API 路由
│   │   │   ├── auth/           # 认证相关 API
│   │   │   │   ├── login/
│   │   │   │   ├── register/
│   │   │   │   ├── me/
│   │   │   │   ├── session/
│   │   │   │   └── logout/
│   │   │   ├── user/
│   │   │   │   ├── profile/
│   │   │   │   └── search/
│   │   │   ├── friend/
│   │   │   │   └── add/
│   │   │   └── health/
│   │   └── (shell)/            # 需要登录的页面
│   ├── config/
│   │   └── env.ts              # 环境变量导出
│   ├── db/
│   │   ├── index.ts            # 数据库连接 (硬编码配置)
│   │   └── schema.ts           # Drizzle ORM schema
│   ├── server/auth/
│   │   ├── jwt.ts              # JWT 签名/验证 (HS256, 7天)
│   │   ├── cookies.ts          # Cookie 读写
│   │   └── password.ts         # 密码哈希
│   ├── services/
│   │   ├── api.ts              # 前端 API 封装
│   │   ├── request.ts          # fetch 封装
│   │   └── interceptors.ts     # 错误拦截
│   └── middleware.ts           # 登录保护中间件
├── package.json
├── next.config.mjs              # Next.js 配置
└── tsconfig.json                # TypeScript 配置
```

---

## API 接口配置

### 前端 API 调用路径 (src/services/api.ts)

| 函数 | 路径 | 说明 |
|------|------|------|
| `getHealth()` | `/health` | 健康检查 |
| `getUserProfile()` | `/user/profile` | 获取用户资料 |
| `updateUserProfile()` | `/user/profile` (PATCH) | 更新用户资料 |
| `searchUsers()` | `/user/search?keyword=` | 搜索用户 |
| `addFriend()` | `/friend/add` (POST) | 添加好友 |

### 后端 API 路由 (src/app/api/)

**认证接口 (内置):**
- `POST /api/auth/login` - 登录
- `POST /api/auth/register` - 注册
- `GET /api/auth/me` - 获取当前用户
- `POST /api/auth/session` - Session 验证
- `POST /api/auth/logout` - 登出

**用户接口:**
- `GET /api/user/profile` - 获取用户资料
- `PATCH /api/user/profile` - 更新用户资料
- `GET /api/user/search` - 搜索用户 (代理到后端)

**好友接口:**
- `POST /api/friend/add` - 添加好友 (代理到后端)

**健康检查:**
- `GET /api/health` - 健康检查

---

## 数据库配置

### 当前配置 (src/db/index.ts - 硬编码)

```typescript
const pool = mysql.createPool({
  host: '127.0.0.1',
  port: 3306,
  user: 'magus',
  password: '3W.xh.com',
  database: 'trip',
  waitForConnections: true,
  connectionLimit: 10,
});
```

### Schema (src/db/schema.ts)

```typescript
export const users = mysqlTable('users', {
  id: serial('id').primaryKey(),
  phone: varchar('phone', { length: 32 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  nickname: varchar('nickname', { length: 64 }),
  avatar: text('avatar'),
  gender: tinyint('gender').default(0),
  birthday: date('birthday'),
  region: varchar('region', { length: 128 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

---

## 认证配置

### JWT 配置 (src/server/auth/jwt.ts)

- **算法**: HS256
- **过期时间**: 7天
- **Payload**: `{ sub: userId, phone: string }`
- **密钥**: `AUTH_JWT_SECRET` 环境变量

### Cookie 配置 (src/server/auth/cookies.ts)

| 属性 | 值 |
|------|-----|
| Name | `trip_auth` (可配置) |
| httpOnly | `true` (安全) |
| secure | `AUTH_COOKIE_SECURE` 环境变量 |
| sameSite | `lax` |
| maxAge | 7天 (604800秒) |

### Middleware 保护 (src/middleware.ts)

- **保护范围**: 除 `/login`, `/register`, `/api/*`, `/_next/*` 外的所有页面
- **验证方式**: 检查 `trip_auth` cookie 并验证 JWT

---

## 常见问题排查

### 1. 登录后仍然跳转到登录页

**检查项:**
1. `AUTH_JWT_SECRET` 环境变量是否设置且与后端一致
2. Cookie 是否正确设置 (`httpOnly` 必须为 true)
3. JWT 是否过期

**调试方法:**
```bash
# 检查 cookie
document.cookie

# 手动解码 JWT (Base64)
atob(token.split('.')[1])
```

### 2. API 请求 404

**检查项:**
1. `NEXT_PUBLIC_API_BASE_URL` 是否正确配置
2. Next.js rewrites 配置是否正确 (next.config.mjs)
3. API 路径是否匹配 (`/api/*` vs `/user/*`)

### 3. 数据库连接失败

**检查项:**
1. MySQL 服务是否运行
2. 用户名密码是否正确 (`magus` / `3W.xh.com`)
3. 数据库 `trip` 是否存在

**测试连接:**
```bash
mysql -u magus -p'3W.xh.com' -h 127.0.0.1 -D trip
```

### 4. 前端调用后端接口失败

**检查项:**
1. 后端服务是否运行 (端口 3000/3002)
2. CORS 配置
3. Cookie 是否正确传递

---

## 部署配置

### Next.js 配置 (next.config.mjs)

```javascript
{
  output: 'standalone',     // Docker 部署优化
  poweredByHeader: false,    // 隐藏 X-Powered-By
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:3002/api/:path*',
      },
    ];
  },
}
```

### 部署命令

```bash
# 开发
npm run dev

# 构建
npm run build

# 生产运行
npm run start

# 绑定所有网卡
npm run start:bind

# Nginx 反向代理 (端口 3001)
npm run start:bind:nginx
```

### Docker 部署

1. 构建: `npm run build`
2. 运行: `npm run start` 或使用 standalone 产物

---

## 调试技巧

### 开启详细日志

在 `src/middleware.ts` 和各 API 路由中添加 console.log:

```typescript
// middleware.ts
console.log('Middleware:', pathname, token);

// route.ts
console.log('Request:', req.method, req.url);
```

### 检查环境变量

```typescript
// 在任意组件中
console.log('API_BASE_URL:', process.env.NEXT_PUBLIC_API_BASE_URL);
console.log('AUTH_SECRET:', process.env.AUTH_JWT_SECRET ? 'set' : 'missing');
```

### 网络请求调试

浏览器 DevTools > Network:
1. 检查请求头中的 Cookie
2. 检查响应头中的 Set-Cookie
3. 查看请求/响应体内容