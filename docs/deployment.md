# Trip Web 云服务器部署指南

本文说明如何将前端按既定方案（Next.js App Router、模块化目录、设计系统）**构建并部署到云服务器**，含 Docker、直连 Node、Nginx 反代与 PM2 守护。

---

## 1. 部署架构说明

```
用户 → [ 域名 :443/80 ] → Nginx（可选 HTTPS）
                          → 反代 127.0.0.1:3000
                          → Next.js（Docker 容器内或本机 Node 进程）
```

- 前端为 **Next.js SSR/Node 服务**，生产环境需长期运行 Node 进程（或容器）。
- `NEXT_PUBLIC_*` 在**构建时**会打入浏览器端包；若改 API 地址，需**重新构建**或构建镜像时传入 `ARG`。

---

## 2. 环境变量

复制项目根目录 `build.env`（或在部署平台上等价设置环境变量）：

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_API_BASE_URL` | 后端 API 根地址，需允许浏览器跨域（CORS） |
| `NEXT_PUBLIC_APP_NAME` | 应用名称（可选） |
| `NEXT_PUBLIC_SITE_URL` | 站点绝对地址（`https://你的域名`，用于 metadata / sitemap / robots） |
| `DATABASE_URL` | 外部 Postgres 连接串（Drizzle/pg 用） |
| `AUTH_JWT_SECRET` | JWT 签名密钥（用于 /api/auth/* 登录态） |
| `AUTH_COOKIE_NAME` | httpOnly cookie 名称（默认 `trip_auth`） |
| `NODE_ENV` | `production` 时 cookie 会启用 `secure`（同一套环境变量用于 Docker/PM2） |

### 2.1 数据库迁移（外部 Postgres）
本项目使用 `drizzle-kit` 生成/执行迁移。

> 仅需在你首次连上外部 Postgres（或 schema 变更）时执行。

```bash
# 生成迁移文件（会写入 ./drizzle/ 目录）
npm run db:generate

# 将迁移应用到外部 Postgres
npm run db:migrate
```

**探活地址**：部署后可用 `GET /api/health` 做负载均衡或容器健康检查（返回 JSON `status: ok`）。

生产可在以下位置配置：

- 本机：`.env.production`
- Docker：`docker compose` 的 `environment` 或 `build.args`（构建阶段需与运行一致）
- 云平台：控制台「环境变量」

---

## 3. 方式 A：Docker（推荐）

项目已启用 `next.config.mjs` 中的 `output: 'standalone'`，镜像体积小、适合云主机。

### 3.1 构建镜像

```bash
docker build -t trip-web:latest \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com \
  .
```

### 3.2 运行容器

```bash
docker run -d --name trip-web -p 3000:3000 \
  -e NEXT_PUBLIC_API_BASE_URL=https://api.example.com \
  trip-web:latest
```

### 3.3 使用 Compose

```bash
cp build.env .env.production
# 编辑 .env.production 后

docker compose up -d --build
```

默认映射 `3000:3000`。前面可再接 Nginx（见第 5 节）。

---

## 4. 方式 B：云服务器直接运行 Node（无 Docker）

适用于已有 Node 20+ 的 Linux 主机。

```bash
git clone <你的仓库> && cd trip
npm install
cp build.env .env.production
# 编辑 .env.production

export NODE_ENV=production
npm run build
npm run start:bind
```

`start:bind` 会监听 `0.0.0.0:3000`，便于外网通过安全组 + Nginx 访问。

生产环境建议使用 **PM2** 防止进程退出：

```bash
npm install -g pm2
npm run build
pm2 start deploy/pm2/ecosystem.config.cjs --env production
pm2 save
pm2 startup
```

---

## 5. Nginx 反向代理

将示例配置复制到服务器并修改域名、证书路径：

- 示例文件：`deploy/nginx/trip.conf.example`

要点：

- `proxy_pass` 指向 `http://127.0.0.1:3000`
- 建议生产使用 **HTTPS**（Let's Encrypt 等）
- 已包含 `Upgrade`/`Connection`，便于后续 WebSocket 扩展

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 6. 防火墙与安全组

- 云厂商安全组：放行 **80 / 443**（及对运维开放的 SSH 端口）
- 一般 **不要** 对公网直接暴露 3000，由 Nginx 反代即可

---

## 7. 构建与发布检查清单

- [ ] `NEXT_PUBLIC_API_BASE_URL` 已配置且后端 CORS 允许站点域名
- [ ] 修改公开环境变量后已执行 `npm run build`（或带 `--build-arg` 的镜像构建）
- [ ] 生产 `NODE_ENV=production`
- [ ] 进程由 Docker 或 PM2/systemd 守护
- [ ] Nginx 与 HTTPS 已配置（生产）

---

## 8. 故障排查

| 现象 | 可能原因 |
|------|----------|
| 页面空白 / 接口失败 | `NEXT_PUBLIC_API_BASE_URL` 未设或 CORS 未放行 |
| 外网无法访问 | 安全组未放行 80/443，或只监听了 localhost |
| Docker 构建慢 | 首次拉取基础镜像；可使用国内镜像源加速 |
| standalone 启动失败 | 确认 `npm run build` 成功，且镜像内 `server.js` 与 `static` 路径正确 |

---

## 9. 与开发文档的关系

- 业务结构、组件与 Figma 映射：见 [development-summary.md](./development-summary.md)
- 设计文件对应关系：见 [figma-structure.md](./figma-structure.md)
