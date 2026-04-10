# Trip Web UI 改动日志（2026-03-23）

## 1. 导航与信息架构调整

- 调整了底部导航顺序与文案，当前为：
  - 第 1 界面：`/explore`（首页）
  - 第 2 界面：`/`（留白）
  - 第 3 界面：`/placeholder`（计划）
  - 第 4 界面：`/user`（我的）
- 新增并保留中间悬浮主动作按钮：`/create`（发布社区内容或制定计划）

涉及文件：

- `src/components/layout/BottomBar.tsx`
- `src/components/layout/Header.tsx`
- `src/app/page.tsx`
- `src/app/placeholder/page.tsx`
- `src/app/create/page.tsx`

---

## 2. 页面结构重排与内容迁移

- 主页/探索/留白页面根据产品要求进行了多轮重排：
  - 计划内容从原首页迁移至第三界面（`/placeholder`）
  - 第一界面（`/explore`）作为首页风格内容流
  - 第二界面（`/`）暂时留白
- `search` 旧入口页改为重定向到 `explore`

涉及文件：

- `src/app/page.tsx`
- `src/app/explore/page.tsx`
- `src/app/placeholder/page.tsx`
- `src/app/search/page.tsx`

---

## 3. 卡片与内容流样式升级（小红书风格）

- 内容卡片升级为：封面图 + 主题标签 + 标题 + 内容摘要 + 作者
- 首页与探索页统一使用内容流卡片
- 增加卡片悬停动效（上浮 + 阴影增强）

涉及文件：

- `src/modules/post/PostCard.tsx`
- `src/app/page.tsx`
- `src/app/explore/page.tsx`
- `src/styles/base.css`

---

## 4. 响应式布局与网格规则

- 按需求实现横竖屏差异化布局：
  - 横屏优先 4 列展示
  - 竖屏优先 2 列展示
- 结合分辨率断点细化了卡片最小高度、容器宽度和间距
- 保留超窄屏单列兜底，避免严重挤压

涉及文件：

- `src/styles/base.css`

---

## 5. Header 与搜索栏重构

- Header 改为紧凑布局，降低顶部占比
- 将搜索栏融入 Header，并与 `logo / 消息` 放在同一水平线
- 搜索栏宽度按场景控制（此前版本要求：横屏 50%、竖屏 80%）
- 顶部视觉层级优化（标题、副标题、消息胶囊、间距）

涉及文件：

- `src/components/layout/Header.tsx`
- `src/styles/base.css`

---

## 6. 搜索交互与 UI 优化

- `SearchInput` 增加 `compact` 模式，用于 Header 内嵌搜索
- 将搜索按钮嵌入输入框右侧，改为放大镜图标
- 保留 Enter 搜索与空值校验提示

涉及文件：

- `src/modules/search/index.tsx`
- `src/styles/base.css`

---

## 7. 稳定性与构建问题修复

- 修复环境文件异常字符：
  - `build.env` 末尾错误字符已移除
- 修复 Next.js 构建边界问题：
  - `Button` 标记为 Client Component（含事件处理）
  - `global-error` 组件边界调整，消除构建期 RSC 报错
- 统一请求层异常处理入口，接入拦截器

涉及文件：

- `build.env`
- `src/components/ui/Button.tsx`
- `src/app/global-error.tsx`
- `src/services/request.ts`

---

## 8. 其他文案/细节修复

- 修复部分中文乱码与符号异常：
  - `PostCard` 作者文案
  - `User` 页中文文案
  - `Footer` 年份前符号异常
  - `Timeline` 文本分隔符异常

涉及文件：

- `src/modules/post/PostCard.tsx`
- `src/app/user/page.tsx`
- `src/components/layout/Footer.tsx`
- `src/modules/itinerary/components/Timeline.tsx`

---

## 9. 当前结果

- 项目已切换到新的 UI 信息架构与视觉样式
- 首页与探索体验已完成移动端/网页端基础适配
- Header 搜索交互和卡片交互可用
- 本轮改动后已通过 IDE 侧 linter 检查（无新增 lint 报错）
