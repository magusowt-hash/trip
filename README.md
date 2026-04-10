# Trip Web

Next.js（App Router）+ TypeScript 的旅行平台前端，按业务模块分层，配套设计系统与云服务器部署方案。

## 快速开始

```bash
npm install
npm run dev
```

浏览器访问 <http://localhost:3000>。

---
## 前后端分离启动（Next: `trip-web` + Nest: `trip-backend`）

### 1. 启动后端（默认监听 `3000`）
```bash
cd trip-backend
npm install
npm run start:dev
```

探活：
- `curl http://localhost:3000/test`
- `curl http://localhost:3000/health`

### 2. 启动前端（建议监听 `3001`，避免端口冲突）
```bash
cd ..
npm install
npm run dev:nginx
```

浏览器访问 <http://localhost:3001>。

### 3. 前端环境变量（必须）
在前端 `.env.local` / 生产环境里设置：
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

如果你使用 Nginx 统一域名并将 `/api` 反代到后端，则改为：
```env
NEXT_PUBLIC_API_BASE_URL=/api
```

## 文档

| 文档 | 说明 |
|------|------|
| [docs/development-summary.md](./docs/development-summary.md) | 架构、目录、组件与开发规范 |
| [docs/frontend-backend-handoff.md](./docs/frontend-backend-handoff.md) | **前后端对接**：路由、环境变量、数据契约与联调清单 |
| [docs/frontend-porting.md](./docs/frontend-porting.md) | 前端移植/迁移指南（对接新后端必读） |
| [docs/deployment.md](./docs/deployment.md) | **云服务器 / Docker / Nginx / PM2 部署** |
| [docs/operations-readiness.md](./docs/operations-readiness.md) | **公网运营可行性 / 上线检查清单** |
| [docs/figma-structure.md](./docs/figma-structure.md) | Figma 与代码目录映射 |
| [docs/post-detail-modal.md](./docs/post-detail-modal.md) | **帖子详情浮窗**（模块、API、图库与缩略图交互） |

## 环境变量

复制 `build.env`（或项目内环境变量模板）为 `.env.local` / `.env.production`，按需填写 `NEXT_PUBLIC_*`。

## 生产构建

```bash
npm run build
npm run start
# 或监听所有网卡（云主机常用）
npm run start:bind
```

## 部署概览

- **推荐**：`Dockerfile` + `docker compose`（`output: 'standalone'`）
- **备选**：系统 Node + `npm run build` + PM2（见 `deploy/pm2/ecosystem.config.cjs`）
- **入口**：Nginx 统一域名：
  - `/` 反代到 `127.0.0.1:3001`（Next）
  - `/api` 反代到 `127.0.0.1:3000`（Nest）
  - 见 `deploy/nginx/trip.conf.example` 与 `docs/deployment.md`

详见 [docs/deployment.md](./docs/deployment.md)。
