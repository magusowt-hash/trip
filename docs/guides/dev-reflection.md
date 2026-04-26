# 开发反思与常见错误总结

## 错误分类

### 1. 环境配置错误
**错误**: 前后端 API 通信失败
**表现**: 404/500 错误、连接被拒绝
**原因**: 
- NEXT_PUBLIC_API_BASE_URL 未配置或配置错误
- 后端端口变更后前端未同步更新
- 服务未启动或意外停止

**教训**:
- 始终确认环境变量 `NEXT_PUBLIC_API_BASE_URL` 与后端实际地址一致
- 部署或重启服务后要验证服务正常运行
- 遇到连接问题先检查服务是否启动 (`netstat -tlnp`)

### 2. 后端认证问题
**错误**: JWT 认证中间件无法正常工作
**表现**: 所有请求返回 401 Unauthorized
**原因**:
- 尝试使用 NestJS Guard 但依赖注入配置复杂导致失败
- 使用 NestJS 中间件方式但语法错误

**教训**:
- NestJS Guard 依赖注入在多模块间共享时需要正确配置 `@Global()` 和 exports
- 直接在 main.ts 中使用 Express 中间件更简单可靠
- 优先使用成熟方案而非自己发明

### 3. 前端渲染不一致
**错误**: Hydration 错误
**表现**: "Hydration failed because the initial UI does not match what was rendered on the server"
**原因**:
- 服务端和客户端渲染内容不一致
- 在服务端渲染时使用客户端特定 API (如 localStorage)

**教训**:
- 涉及浏览器 API 的代码放在 `useEffect` 中执行
- 使用条件渲染或 loading 状态避免服务端/客户端差异
- 避免在组件顶层直接调用需要客户端环境的方法

### 4. TypeScript 类型错误
**错误**: 类型不匹配
**表现**: 编译错误
**原因**:
- 使用 `(req as any)` 虽然简单但不是最佳实践
- 正确做法是声明扩展类型

**教训**:
- 尽量避免使用 `any`，正确声明类型
- 遇到第三方库类型问题可以用 declare module 扩展

### 5. 代码清理不彻底
**错误**: 编译报错
**原因**: 删除了引用但未删除相关代码
**教训**:
- 重构时先备份再删除
- 每次改动后都运行 `npm run build` 检查

## 开发流程建议

### 开始新功能前
1. 确认环境配置正确
2. 确认服务正常运行
3. 确认数据库连接正常

### 开发过程中
1. 小步提交，每次只改一点
2. 改动后立即测试
3. 遇到问题先分析再动手

### 遇到问题时的调试步骤
1. 检查服务是否运行 (`netstat -tlnp`)
2. 检查端口配置是否一致
3. 查看服务日志
4. 用 curl 直接测试 API
5. 检查请求/响应内容

### 6. Admin API 鉴权方式不统一
**错误**: 管理后台详情页请求 admin API 未传 `Authorization` header
**表现**: 页面加载数据为空，仅 `credentials: 'include'` 无法通过认证
**原因**: 
- AdminTable 组件通过 `Authorization: Bearer <token>` 鉴权
- 用户详情页手写 `fetch` 时只传了 `credentials: 'include'`，但 admin API 不吃 cookie，只认 header token
- `verifyAdminToken` 虽然会先检查 cookie (`getAdminTokenFromRequest`)，但管理后台登录存的是 header token 而非 cookie

**教训**:
- Admin 页面统一通过 `useAdminAuth()` 获取 `token`，手动 fetch 时必须传入 headers
- 不要假设 admin 端点和普通用户端点使用同一鉴权方式
- 新增 admin 页面组件时，优先复用 `AdminTable` 或显式传入 token

### 7. JSON 列迁移到关联表后字段名不更新
**错误**: Admin 用户详情页读取已废弃的 `user.ratings`（JSON 列）而非 `user.ratingDetails`
**表现**: 评分 tab 一直显示"暂无评分"
**原因**: 
- 旧版 `users.ratings` 是 JSON 列，存储评分数据
- 迁移到独立 `ratings` 表后，API 返回 `ratingDetails` 字段名，但前端仍读 `user.ratings`
- 类型定义 `UserData` 也缺少 `ratingDetails` 字段
- 评分 tab 的 `renderRatings` 还使用了旧字段名 `r.target` / `r.score`，与新表列名不一致

**教训**:
- 数据源从 JSON 列迁移到关联表后，必须同步检查所有读该字段的前端代码
- 字段名重命名后（如 `target` → `targetType`），grep 所有引用确保无遗漏
- 类型定义应紧跟 API 响应结构，避免用 `as any` 绕过类型检查

### 8. Drizzle ORM 聚合查询静默吞异常
**错误**: Admin 用户列表的 `ratingsCnt` 始终为 0
**表现**: 列表页每个用户的评分数量列显示 0
**原因**: 
```typescript
// 错误写法 — 跑时会抛异常被外层 catch 吞掉，count 默认为 0
const counts = await db
  .select({ uid: ratings.userId, count: sql<number>\`count(*)\` })
  .from(ratings)
  .groupBy(ratings.userId);
```
- Drizzle ORM 的 `sql` + `groupBy` 在某些 MySQL 版本下组合不正确，运行时抛异常
- 外层 `try/catch` 捕获后只打印了 log 没有给前端返回错误，导致前端看到 `ratingsCnt: 0`

**教训**:
- 外层 try/catch 不应吞掉非预期错误，至少返回 500 让调用方知晓
- Drizzle ORM 中复杂聚合改用 JS 层处理：先 `select({ uid })` 全量查询，再用 Map 计数
- 使用 `sql` 模板时必须在函数签名中显式标注 `<number>` 类型
- 可以在开发环境用 `DEBUG=drizzle-orm/*` 查看生成的 SQL

### 9. 管理后台详情 ID 未对应展示标题
**错误**: 评分、收藏、足迹页面只显示了 ID 数字，看不到对应名称
**表现**: 管理员看到"地点ID: 312"但不知道 312 是什么地点
**原因**: 
- `renderRatings` 只渲染 `r.targetId`，没有查找对应 `list_items.title`
- `renderFavorites` / `renderVisited` 同理只显示 `f.listItemId`
- 未设计批量解析 ID→标题的逻辑

**教训**:
- 凡是在管理后台展示 ID 的地方，都应考虑同时显示可读的名称/标题
- 批量查询技巧：先收集所有 ID，一次 `inArray` 查询，再构建 Map 映射
- API 层负责组装关联数据，前端只做展示，避免前端发 N+1 查询

## 关键架构决策（本会话）

### 评分系统：独立表 vs JSON 列
- **选择**：独立 `ratings` 表（`user_id` + `target_type` + `target_id` + `rating` + `comment`）
- **原因**：支持 UNIQUE 约束（每人每目标只能评分一次）、类型安全查询、按时间排序、方便管理后台统计
- **代价**：需要额外 JOIN 查询，不能像 JSON 列那样直接随 user 返回
- **实现**：在 Admin API 中手动批量解析 `list_items.title` 拼入响应

### 评分分值：0–10 偶数制
- 5 颗星，每颗 2 分，分值只能为 0/2/4/6/8/10
- 点击同一颗星可取消（置为 0）
- 展示时 `r.rating / 2` 得到星数

### Admin 鉴权设计
- 管理后台独立鉴权：base64 编码的 `admin:<timestamp>` token
- 通过 `Authorization: Bearer` header 传递（非普通用户的 cookie）
- token 有效期 7 天
- 用户详情页调用 admin API 需显式传入 token（`useAdminAuth`）

## 快速检查清单

- [ ] NEXT_PUBLIC_API_BASE_URL 配置正确
- [ ] 后端服务正在运行
- [ ] 数据库连接正常
- [ ] 前端可以构建成功 (`npm run build`)
- [ ] 后端可以构建成功 (`npm run build`)
- [ ] API 路由文件存在且路径正确
- [ ] Admin 页面手动 fetch 都传了 `Authorization` header
- [ ] 字段名与 API 响应一致（grep 检查新旧字段名无遗漏）
- [ ] Drizzle 聚合查询用 JS Map 替代 sql + groupBy
- [ ] 管理后台 ID 展示附带对应名称/标题
