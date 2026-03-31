# Trip Web 前端移植/迁移指南

> 用途：当你把该前端从本仓库“移植”到新项目（或替换后端）时，用这份文档作为落地清单。

## 1. 移植范围与边界

本仓库前端主要包含以下可迁移部分：

- 路由与页面：`src/app/*/page.tsx`
- 业务模块分层：`src/modules/*`
- 通用组件库：`src/components/ui`、`src/components/layout`、`src/components/feedback`
- 业务向展示块：`src/modules/post`、`src/modules/recommend`、`src/modules/itinerary/components` 等
- 请求层：`src/services/request.ts` + `src/services/interceptors.ts` + `src/services/api.ts`
- 设计令牌与基础样式：`src/styles/*` + `src/app/globals.css`
- 运营必备能力：`/api/health`、404/错误兜底、SEO（metadata/robots/sitemap）

本仓库无法单独保证的部分：

- 后端接口的鉴权/限流/错误码语义
- CORS 策略、HTTPS 证书与域名解析
- 安全与等保等合规审计

## 2. 迁移前准备（建议先对齐）

1. Node 环境：建议 Node 18.18+（生产构建与 Docker 用的也在此范围）
2. 依赖锁定：务必提交 `package-lock.json`，生产使用 `npm ci`（避免线上差异）
3. 构建关键配置：
   - `next.config.mjs` 含 `output: 'standalone'`，适配 Docker/云主机

## 3. 环境变量对照表（必改项）

复制 `build.env` 并在新环境填写：

- `NEXT_PUBLIC_API_BASE_URL`：后端 API 根地址（浏览器请求时使用）
- `NEXT_PUBLIC_APP_NAME`：应用展示名（可选）
- `NEXT_PUBLIC_SITE_URL`：站点绝对地址（用于 metadata / sitemap / robots）

> 注释：`NEXT_PUBLIC_*` 会在“构建时”注入到前端产物；如果你在运行后才改环境变量，可能不会生效，需要重新构建/重新打镜像。

## 4. 目录结构与新增代码位置（保持一致性）

- `src/app`
  - 页面路由、状态命名对应 Figma：`Home_Default`、`Detail_Error` 等
- `src/modules`
  - 业务能力分组（功能模块内部组件放 `components/`）
- `src/components/ui`
  - 原子 UI：`Button` / `Input` / `Modal`（优先实现 variants/states）
- `src/components/feedback`
  - 页面级状态：`PageState`（LoadingState / EmptyState / ErrorState）
- `src/components/layout`
  - 页面骨架：Header / BottomBar / Footer
- `src/modules/<feature>`
  - 领域组件：如 `post`（信息流卡片 + 帖子详情浮窗）、`itinerary/components`（行程卡片等）
- `src/services`
  - 请求封装与 API 调用入口
- `src/styles`
  - tokens 与基础样式；页面/组件不要再写大量硬编码样式

## 5. 页面迁移/新增流程（对应 Figma 03_Pages）

1. 先确定页面“状态命名”：
   - 必须遵循 `页面_状态`（示例：`Home_Loading`、`Itinerary_Edit`）
2. 找到对应目录：
   - 路由文件放 `src/app/<route>/page.tsx` 或动态路由 `src/app/post/[id]/page.tsx`
3. 组合组件：
   - 优先使用：
     - `src/modules/post/*`、`src/modules/recommend/*` 等领域卡片
     - `src/modules/itinerary/components/*` 的行程模块组件
     - `src/components/ui/*` 的基础交互组件（按钮、输入、弹窗）
4. 状态页实现：
   - Loading：用 `src/components/feedback/PageState.tsx` 中的 LoadingState
   - Empty：用 EmptyState
   - Error：用 ErrorState

## 6. 组件迁移/新增流程（对应 Figma 02_Components）

1. 基础原子组件（`src/components/ui`）
   - 提供完整 `variants / sizes / disabled` 等交互状态
   - 注意 Next 客户端组件边界：使用 `useEffect/useState` 的组件要标注 `'use client'`
2. 领域展示组件（`src/modules/<feature>`）
   - 与具体业务列表/详情强相关的卡片、浮窗等；尽量传入最少业务 props，避免在组件内写死路由/全局状态
3. 模块内部组件（`src/modules/<feature>/components`）
   - 与业务强绑定的交互（如行程 DayTabs/Timeline）放这里

## 7. 请求层迁移/适配（对接新后端）

当前请求封装：

- `src/services/request.ts`：统一 fetch(JSON) + error 抛出
- `src/services/interceptors.ts`：当前为轻量实现

迁移到新后端时，通常需要：

- 改造 BASE_URL 或重映射路径（确保路径拼接正确）
- 增加鉴权（Token / Cookie / Header 注入）
- 统一错误码语义：
  - 在 `request.ts` 或 `interceptors.ts` 中把后端错误码映射成前端可识别的错误对象/消息

## 8. 与部署/运营的耦合点（上线要点）

- 健康检查：`GET /api/health`
  - 用于 LB / K8s / Docker healthcheck 探活
- 错误兜底：
  - `src/app/not-found.tsx`
  - `src/app/error.tsx`
  - `src/app/global-error.tsx`
- SEO：
  - `src/app/layout.tsx` 的 `metadata` 与 `metadataBase`
  - `robots.ts`、`sitemap.ts`（依赖 `NEXT_PUBLIC_SITE_URL`）

## 9. 迁移验收用例（建议上线前跑通）

1. 本地启动：
   - `npm install`
   - `npm run dev`
2. 页面访问：
   - `/`（Home）
   - `/search`（Search）
   - `/itinerary`（Itinerary）
   - `/post/1`（Post Detail 动态路由）
   - `/components`（组件展示页，验证 UI 交互状态）
3. 交互验证：
   - 弹窗 `Modal`：点击遮罩/按 `Esc` 关闭（如有 onClose）
   - Input：Enter 触发 onEnter（如组件提供该能力）
   - Search：错误提示与 Toast（如已接入）
4. 生产构建：
   - `npm run build`
   - `npm run start:bind`
5. 健康检查：
   - `GET /api/health` 返回 `status: ok`

## 10. 常见坑（强烈建议阅读）

- 文档/代码编码：确保编辑器保存为 UTF-8，避免出现中文乱码
- `next.config.mjs` 的 `output: 'standalone'`：
  - 如果你移植到非 Docker 环境，可以保留不改；但不要删除 standalone 产物所依赖的结构
- `NEXT_PUBLIC_*`：改完环境变量要重新构建
- Next 组件边界：
  - 使用 hooks 的组件必须是 client component（带 `'use client'`）

