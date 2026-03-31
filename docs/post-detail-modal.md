# 帖子详情浮窗（Post Detail Modal）开发文档

本文档描述「小红书风格」帖子详情浮窗的**模块划分、数据流、交互实现与扩展方式**，并与当前代码实现保持一致。

## 1. 目标与范围

- **目标**：点击信息流卡片后，以居中浮窗展示帖子详情：主图查看（可拖拽/滚轮切图）、作者区、正文与标签、评论列表、底部互动与评论输入。
- **范围**：仅前端展示与本地状态；评论、关注、点赞等为占位交互，可对接后端后替换。
- **非目标**：不依赖旧版 `base.css` 的 `.post-modal-*` / `.post-thumb-*` 布局（浮窗主体样式在 `modalStyles.ts` + 组件内实现）。

## 2. 文件与职责

| 路径 | 职责 |
|------|------|
| `src/modules/post/PostCard.tsx` | 卡片 UI（可访问性：使用 `button` 触发打开）+ `open` 状态；将业务 props 透传给 `PostDetailModal`。 |
| `src/modules/post/PostDetailModal/index.tsx` | 浮窗入口：`open` 时锁定 `body` 滚动、`Escape` 关闭；`createPortal` 访问 `document` 做防护；根据 `gallery` 计算 `images` 与 `mainSrc`，并持有 `activeImageIndex`。 |
| `src/modules/post/PostDetailModal/components/MediaColumnTranslateX.tsx` | 左栏媒体交互：显示 `mainSrc` 主图；点击打开全屏查看器；查看器内渲染**全部图片容器**并支持拖拽/滚轮切图（非无限边界）。 |
| `src/modules/post/PostDetailModal/components/InfoColumn.tsx` | 右栏信息与评论输入区（`aria-labelledby` 关联标题）。 |
| `src/modules/post/PostDetailModal/utils/galleryUtils.ts` | 图库常量与纯函数：`sanitizeGalleryImages`、`resolveMainImageSrc` 等。 |
| `src/modules/post/PostDetailModal/styles/modalStyles.ts` | 浮窗遮罩/框架等内联样式对象。 |
| `src/modules/post/PostDetailModal/types.ts` | `PostDetailModalProps`、`CommentItem`。 |

备注：
- 当前版本不再使用 `PostDetailModal/hooks/useThumbnailRail.ts` 的“缩略图轨道”方案；所有切图逻辑由 `MediaColumnTranslateX.tsx` 的媒体引擎负责。

## 3. 组件 API

### 3.1 `PostDetailModalProps`

`src/modules/post/PostDetailModal/types.ts`：

- `open: boolean`：`false` 时不渲染 DOM。
- `onClose: () => void`：遮罩点击/关闭按钮/键盘 Esc 触发。
- `cover: string`：封面图（主图回退之一）。
- `title/topic/content/author/avatar`：展示用字段。
- `gallery?: string[]`：图库 URL 列表，`sanitizeGalleryImages` 最多取 20 张；无有效图库则返回本地 SVG 占位。

### 3.2 `PostCardProps`

`src/modules/post/PostCard.tsx`：

- `Omit<PostDetailModalProps, 'open' | 'onClose'>`，由卡片统一传入。

## 4. 媒体交互（`MediaColumnTranslateX.tsx`）

### 4.1 布局与视觉规则

- **线性索引边界**：媒体索引固定在 `0 .. lastIndex`，不做无限循环。
- **双层容器模型**（避免“圆角作用在动画容器”）：
  - 外层：负责 `translate/scale/rotateY/perspective` 等动画
  - 内层（第二层）：负责图片比例自适应与圆角裁切（`borderRadius + overflow + clipPath`）
- **侧图位移与角度**：
  - 侧图横向偏移已向中心收 10%
  - 侧图倾斜角为 `30deg`（静止达峰值，动画过程连续插值）
- **景深与视差**：
  - 模糊与视差作用在 `img` 本身（`translate3d + filter`），避免高速时容器与图片错位感

### 4.2 查看器挂载与加载策略

- 打开查看器时一次性渲染全部 slide 容器（`images.map`）。
- 按距中心图 `dist` 控制加载优先级：
  - 中心邻近图 `loading="eager"`
  - 其余图 `loading="lazy"`
- 进入查看器后，右上角显示 `now/last`，并按可视中心图实时更新。

### 4.3 切图输入模型

1. **拖拽（Pointer）**
   - 使用拖拽阈值（`DRAG_THRESHOLD_PX`）区分“点击”和“拖拽”
   - 仅当超过阈值后才进入拖拽并捕获指针，避免“单击被当滑动”

2. **滚轮（Wheel）**
   - 使用 burst 窗口（`140ms`）累计事件数
   - `1~5` 次：执行 `animateByStep`（有过渡）
   - `>5` 次：进入惯性模式

3. **单击 / 双击**
   - 单击不立即触发，使用延时阈值（`SINGLE_CLICK_DELAY_MS`）打开气泡
   - 若期间发生双击，取消单击动作（避免“双击必有单击副作用”）
   - 双击用于进入/退出系统真全屏

### 4.4 惯性吸附与“无回弹”策略

- 惯性尾段会**提前锁定落点**（`settleTargetRef`），避免在两图中线附近反复改判。
- 锁定后只向目标单向收敛，不会出现“先滑到中间再回弹”的视觉。
- 当前参数已做“放缓优化”：
  - 降低收敛力度（更柔和）
  - 增加单帧步进上限（防突跳）
  - 微调结束阈值（完成切换更自然）

### 4.5 气泡菜单（收藏 / 下载 / 举报）

- 单击图片弹出气泡菜单，包含：
  - 收藏（复制图片 URL）
  - 下载（触发下载）
  - 举报（打开邮件上报）
- 菜单可被以下行为自动关闭：
  - 任意新交互开始（点击、拖拽、滚轮、双击、按键等）
  - 点击空白遮罩
  - 菜单自身动作完成
- 针对“再次点击图片不关闭”已做保护：当本次点击用于关闭菜单时，不会在同次 click 再次重开。

### 4.6 关闭语义与全屏联动

- 查看器左上角 `×` 为“关闭全屏层”按钮，语义如下：
  - **半全屏（查看器层）**：关闭查看器，回到帖子页
  - **真全屏（系统 fullscreen）**：仅退出真全屏，保留查看器
- `Escape` 优先关闭图片查看器，再关闭帖子浮窗（由 `PostDetailModal/index.tsx` 协调）。
- 为避免按钮重叠，查看器打开时会隐藏“帖子关闭键”（`aria-label="关闭帖子详情"`），关闭查看器后自动恢复。

### 4.7 背景点击行为

- 点击遮罩空白（`e.target === e.currentTarget`）：
  - 真全屏：退出真全屏
  - 半全屏：关闭查看器
- 交互层使用捕获阶段拦截，避免事件穿透导致底层帖子误关闭。

## 5. 页面滚动与键盘

- `PostDetailModal/index.tsx`：`open === true` 时锁定 `document.body.style.overflow = 'hidden'`，关闭后恢复。
- `Escape` 关闭：由 `useEffect` 监听 `keydown` 实现，且与“查看器优先关闭”的逻辑联动。

## 6. 无障碍（a11y）

- `PostCard` 使用 `button` 触发打开浮窗（可键盘聚焦/可 Enter/Space 操作）。
- 对话框容器使用 `role="dialog"` 与 `aria-modal="true"`；标题通过 `aria-labelledby` 关联。

## 7. 调试与排错

- **主图空白**：检查 `resolveMainImageSrc` 是否返回有效 URL；必要时确认 `gallery` 是否为空或包含空串。
- **切图不生效**：
  - 检查索引是否被夹紧在 `0..lastIndex`
  - 如果是滚轮 burst，重点观察 `140ms` burst 窗口内的事件数量是否被触控板手势拆分
- **双击触发了单击菜单**：
  - 检查 `SINGLE_CLICK_DELAY_MS` 是否被意外移除
  - 检查 `onDoubleClick` 是否清理了 `singleClickTimerRef`
- **气泡无法稳定关闭/重复弹出**：
  - 检查 `closeMenuByImageTapRef` 的“只关不重开”短路逻辑
  - 检查遮罩层 `onPointerDownCapture` 是否仍保留“任意交互先关闭菜单”
- **关闭键重叠**：
  - 检查查看器打开时是否成功隐藏 `button[aria-label="关闭帖子详情"]`
  - 检查退出查看器时是否恢复原 `display`

## 8. 相关文档

- 项目总览：[development-summary.md](./development-summary.md)
- UI 变更记录：[ui-change-log-2026-03-23.md](./ui-change-log-2026-03-23.md)
