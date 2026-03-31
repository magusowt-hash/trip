# Trip Web 开发文档总结

> 注释：本文档用于对齐“产品/设计/开发”的当前实现状态，重点说明代码现状与下一步迭代方向。

## 1. 项目概述
Trip Web 是一个基于 Next.js App Router 的 Web 项目，采用“业务模块分层 + 通用能力沉淀”的结构。

- 技术栈：Next.js + React + TypeScript
- 路由模式：`src/app`（App Router）
- 目标：建立可复用设计系统与组件体系，支持首页、详情页、行程页持续迭代

> 注释：该章节用于新人快速理解项目定位，避免只看代码不知目标。

## 2. 当前目录与分层
核心目录如下：

- `src/app`：页面路由与页面入口
- `src/modules`：业务模块（`home/search/post/itinerary/user`）
- `src/components`：通用组件（`ui` / `layout` / `feedback`）
- `src/services`：请求封装与 API 调用
- `src/store`：全局状态（当前为轻量内存态）
- `src/hooks`：通用 Hooks
- `src/utils`：工具函数
- `src/config`：环境配置与功能开关
- `src/styles`：设计令牌与基础样式
- `docs`：项目文档

> 注释：后续新增目录时，优先遵循本分层，不建议把业务逻辑直接堆在 `app` 下。

## 3. 设计系统落地（对应 Figma）
已将 Figma 的 `00_Design_System / 01_Foundations` 映射到代码：

- 设计令牌：`src/styles/tokens.css`
  - Colors：Primary / Secondary / Background / Text / Border / Danger
  - Typography：H1 / H2 / Body / Caption
  - Spacing：4 / 8 / 12 / 16 / 24 / 32
  - Effects：圆角与阴影
- 设计常量：`src/constants/designSystem.ts`
- 基础样式：`src/styles/base.css`
- 全局引入：`src/app/globals.css`

> 注释：颜色、字号、间距优先走 token，减少页面内硬编码样式。

## 4. 组件体系现状（对应 Figma 02_Components）
### 4.1 已实现组件
- Buttons：`src/components/ui/Button.tsx`
  - 变体：`primary` / `secondary` / `ghost`
  - 状态：支持 `disabled`
- Inputs：`src/components/ui/Input.tsx`
- Modals：`src/components/ui/Modal.tsx`
- Cards / 业务块（按领域拆到 `modules`，避免与原子 UI 混放）：
  - `PostCard` + 帖子详情浮窗：`src/modules/post/`（`PostCard.tsx`、`PostDetailModal/`）
  - `RecommendCard`：`src/modules/recommend/RecommendCard.tsx`
  - `ItineraryCard`：`src/modules/itinerary/components/ItineraryCard.tsx`
- 页面级空/错/加载态：`src/components/feedback/PageState.tsx`
- Navigation：
  - `Header`：`src/components/layout/Header.tsx`
  - `BottomBar`：`src/components/layout/BottomBar.tsx`
  - `Footer`：`src/components/layout/Footer.tsx`
- Itinerary 模块组件：
  - `DayTabs`：`src/modules/itinerary/components/DayTabs.tsx`
  - `Timeline`：`src/modules/itinerary/components/Timeline.tsx`
  - `ItineraryItem`：`src/modules/itinerary/components/ItineraryItem.tsx`

### 4.2 组件规范
- 页面优先复用组件，避免重复写样式
- 组件持续补齐 Variants（状态/尺寸/禁用）
- 布局语义对齐 Auto Layout 思路（`row` / `grid` + token 间距）

> 注释：如果某页面出现重复 UI，请先抽组件再继续加需求。

## 5. 页面实现与状态命名（对应 Figma 03_Pages）
已完成基础页面：

- Home：`src/app/page.tsx`（`Home_Default`）
- Post Detail：`src/app/post/[id]/page.tsx`（`Detail_Default`）
- Itinerary：`src/app/itinerary/page.tsx`（`Itinerary_Default`）
- Search：`src/app/search/page.tsx`（重定向至探索）
- User：`src/app/(shell)/user/page.tsx`
- 发布：**无 `/create` 路由**；侧栏/底栏「+」经 `PublishFlowProvider` 打开 `PostComposeModal`（`src/components/post-compose/`，交互见 `tips.txt`）

状态命名规范：`页面_状态`（如 `Home_Default`、`Detail_Loading`）。

> 注释：新增页面状态时，命名必须与 Figma 统一，便于设计联动验收。

## 6. 流程与原型映射（对应 Figma 04/05）
- 主链路：`Home -> Detail -> Itinerary`
- 代码中通过路由与页面状态承载流程验证
- 交互细节建议在 Figma `05_Prototypes` 持续维护

> 注释：流程先在 Figma 评审，再落代码可显著减少返工。

## 7. 接口与数据层现状
- 请求封装：`src/services/request.ts`
  - 支持：GET/POST/PUT/PATCH/DELETE
  - Base URL：`NEXT_PUBLIC_API_BASE_URL`
  - 默认 JSON 请求与错误抛出
- API 示例：`src/services/api.ts`
- 错误处理入口：`src/services/interceptors.ts`（当前为轻量实现）

> 注释：后续可在 `interceptors` 增加统一错误码映射与鉴权失效处理。

### 7.1 登录/注册与鉴权（新增）
当前仓库已内置用户注册/登录/会话接口，并用 `httpOnly cookie` 保存登录态（JWT）。

- 注册：`POST /api/auth/register`（请求：`{ phone, password, confirmPassword }`）
- 登录：`POST /api/auth/login`（请求：`{ phone, password }`）
- 当前用户：`GET /api/auth/me`（需要已登录 cookie）
- 登出：`POST /api/auth/logout`（清 cookie）
- 未登录重定向：`src/middleware.ts` 会对除 `/login`、`/register`、`/api/*`、`/_next/*` 等公开路径以外的页面进行保护

Cookie/JWT 环境变量（仅服务端读取）：
- `AUTH_JWT_SECRET`
- `AUTH_COOKIE_NAME`（默认 `trip_auth`）

对应前端页面：
- `/login`：`src/app/login/page.tsx`
- `/register`：`src/app/register/page.tsx`

### 7.2 数据库（Drizzle + Postgres，新增）
数据库使用 Drizzle ORM 直连外部 Postgres，并通过 drizzle-kit 管理迁移。

- Drizzle client：`src/db/index.ts`
- Schema：`src/db/schema.ts`（`users` 表）
- 迁移配置：`drizzle.config.ts`
- 迁移脚本：
  - `npm run db:generate`：生成迁移文件（写入 `./drizzle/`）
  - `npm run db:migrate`：将迁移应用到外部 Postgres

## 8. 状态与工具层现状
- 全局状态：`src/store/userStore.ts`、`src/store/appStore.ts`（当前内存态）
- 业务状态：`src/modules/home/store.ts`
- 通用 Hooks：`src/hooks/useDebounce.ts`、`src/hooks/useAuth.ts`
- 工具函数：`src/utils/format.ts`、`src/utils/storage.ts`、`src/utils/logger.ts`

> 注释：当前状态层较轻，业务复杂后建议升级为 Zustand 或 React Query。

## 9. 运行与开发命令
- 安装依赖：`npm install`
- 本地开发：`npm run dev`
- 生产构建：`npm run build`
- 生产启动：`npm run start`（默认仅本机访问）
- 云主机监听全网卡：`npm run start:bind`（`0.0.0.0:3000`）
- 代码检查：`npm run lint`
- 环境变量模板：复制 `build.env` 为 `.env.local` / `.env.production`

## 10. 前端完成度（相对原定方案）
- 目录分层、`src/app` 路由、设计令牌与基础组件已落地
- 首页 / 搜索 / 详情 / 行程 / 组件展示等页面与多状态演示已具备
- 部署侧已对齐：**`next.config.mjs` 启用 `output: 'standalone'`**，并提供 Docker、Nginx 示例、PM2 配置

## 11. 后续开发建议（优先级）
1. 强化请求层（Token 注入、统一错误码、重试/超时）
2. 升级状态与数据获取（可选：Zustand / TanStack Query）
3. 补充测试（组件快照 + 关键链路 E2E）
4. 与后端约定 API 版本与 OpenAPI，便于联调

## 12. 云服务器部署（必读）
详见独立文档，与本文互补：

| 文档 | 内容 |
|------|------|
| [README.md](../README.md) | 快速开始与文档索引 |
| [deployment.md](./deployment.md) | Docker / Compose、Nginx、PM2、环境变量、检查清单 |
| [operations-readiness.md](./operations-readiness.md) | 公网运营可行性、安全/探活/SEO、上线必做项 |

仓库内相关文件：

- `Dockerfile`、`docker-compose.yml`、`.dockerignore`
- `deploy/nginx/trip.conf.example`
- `deploy/pm2/ecosystem.config.cjs`
- `build.env`
- `src/app/api/health/route.ts`（运维探活）

## 13. 关联文档
- **后端联调**：`docs/frontend-backend-handoff.md`（路由、环境变量、接口与数据契约）
- 设计映射：`docs/figma-structure.md`
- 部署指南：`docs/deployment.md`
- 运营可行性：`docs/operations-readiness.md`

## 14. 移植/迁移指南
如果你计划把本项目前端移植到新仓库或新后端，优先阅读并按清单执行：

- 主文档：`docs/frontend-porting.md`

移植时重点检查以下三件事：

1. 环境变量与构建：`NEXT_PUBLIC_*` 需要重新构建才能生效
2. 目录规则与组件复用：新增页面/组件必须遵循 `src/app / src/modules / src/components` 分层
3. 请求层适配：`src/services/request.ts` + `src/services/interceptors.ts` 需要与新后端错误码/鉴权约定对齐

## 15. 移植验收建议
移植完成后建议至少验证以下入口页面与交互能力：

- `/`：Home（含 Default / Loading / Empty 演示）
- `/search`：Search（输入、错误提示与结果展示）
- `/itinerary`：Itinerary（含 Default / Edit / Empty 演示）
- `/post/1`：动态路由页面渲染正常
- `/components`：Button / Input / Modal 基础交互状态可用
