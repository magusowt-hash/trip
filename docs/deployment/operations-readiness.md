# 网络运营可行性说明（前端）

本文从**可部署、可观测、可恢复、可维护**四方面说明本前端是否具备投入公网运营的基础，并列出上线前必做项。

---

## 1. 结论（当前状态）

在完成下列**必做检查项**后，本项目前端**可以**作为公网站点运行：Next.js 生产构建、Standalone 容器、Nginx 反代、健康检查、基础安全头、404/错误兜底、SEO 元数据与站点地图均已具备。

仍需与**后端、运维、安全**协同的部分见第 5 节（不属于纯前端仓库可单独保证的范围）。

---

## 2. 已具备的运营能力

| 能力 | 实现位置 |
|------|----------|
| 生产构建与单机/容器运行 | `output: 'standalone'`，`Dockerfile`，`npm run build` / `start:bind` |
| 负载均衡 / K8s 探活 | `GET /api/health`（`src/app/api/health/route.ts`） |
| 容器健康检查 | `Dockerfile` `HEALTHCHECK`，`docker-compose.yml` `healthcheck` |
| 降低指纹暴露 | `poweredByHeader: false` |
| 基础安全响应头 | `next.config.mjs` → `X-Frame-Options`、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy` |
| 用户侧错误体验 | `not-found.tsx`、`error.tsx`、`global-error.tsx` |
| SEO / 分享基础 | `layout.tsx` `metadata` + `metadataBase`，`robots.ts`，`sitemap.ts` |
| 依赖可复现 | `package.json` 固定 `next` / `react` 等与 `eslint-config-next` 对齐版本；**请提交 `package-lock.json` 并使用 `npm ci` 构建** |

---

## 3. 上线前必做检查清单

- [ ] 生产环境变量：`NEXT_PUBLIC_API_BASE_URL`、`NEXT_PUBLIC_SITE_URL`（HTTPS 域名）、`NEXT_PUBLIC_APP_NAME`
- [ ] 后端 **CORS** 允许浏览器来源为你的站点域名
- [ ] `NEXT_PUBLIC_*` 变更后已 **重新执行生产构建**（或镜像构建带对应 `ARG`）
- [ ] 仅通过 **Nginx 443/80** 对外，**不**将 3000 暴露公网（或安全组收紧）
- [ ] HTTPS 与（可选）`Strict-Transport-Security` 在 Nginx/网关配置（见 `deploy/nginx/trip.conf.example` 注释）
- [ ] 进程守护：Docker / PM2 / systemd 任选其一，并配置自动重启
- [ ] 监控：`/api/health` 纳入 LB 或监控系统；日志采集按公司规范接入

---

## 4. 建议的后续增强（非阻塞但强烈建议）

- 前端错误上报：Sentry 等与 `error.tsx` / `global-error.tsx` 内注释位置对接
- WAF / CDN：由云平台或 Nginx 模块提供，防刷与 DDoS
- 性能：图片走 `next/image` 与 CDN；关键路由做懒加载与分包
- 合规：隐私政策、Cookie 同意（若采集用户数据）

---

## 5. 前端无法单独保证的边界

- 后端可用性、鉴权、限流、数据安全
- 证书续期、域名 DNS、全局高可用架构
- 渗透测试与等保等合规审计

以上需与后端、运维、安全团队共同完成。

---

## 6. 相关文档

- [deployment.md](./deployment.md) — 部署步骤
- [development-summary.md](./development-summary.md) — 架构与开发规范
