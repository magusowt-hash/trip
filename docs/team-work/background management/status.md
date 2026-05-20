# background management 状态板

## 当前可用入口

- `/management`
- `/management/keys`
- `/management/maps`
- `/management/embed-logs`
- `/management/alist`
- `/management/users`
- `/management/posts`
- `/management/comments`
- `/management/plans`
- `/management/markers`
- `/management/lists`
- `/management/list_items`
- `/management/packing`
- `/management/footprints`

## 当前状态

- 后台主壳层已采用统一双栏结构，包含固定侧边导航、顶部标题区与主内容区。
- 后台侧边栏已支持独立滚动，且 `系统管理`、`用户管理` 可单独收起。
- 后台侧边栏已收敛为纯文字导航，并强化了两个分类分组的识别度。
- 后台首页已收敛为双列结构：左侧趋势图，右侧数据版列表。
- 后台首页趋势图区已改为双列布局。
- 通用表格后台页已开始收敛为统一视觉语言，`AdminTable` 已拆出独立 CSS Module。
- 地图管理首页已并入统一后台视觉体系。
- 后台页已屏蔽前台全局 Header。
- 后台主要页面已移除与顶栏重复的页内标题卡和说明文案。
- 后台退出入口已收敛为顶部栏单点出口。
- 后台已在 session 检查失败时自动清理本地 `admin_token`，避免脏 token 持续触发 `Invalid token`。

## 当前已知阻塞

- 本轮未完成真实页面联调与跨页面逐项人工验收。
- `npx tsc --noEmit` 未在本轮操作中获得明确完成结果，尚不能据此给出完整类型验证结论。
- 当前环境执行 `npm run build` 返回 `next: command not found`，构建链未恢复，无法完成全站 500 的编译级定位。

## 当前数据库 / 接口 / 文档差异

- 本轮未涉及数据库结构调整，无需更新 `docs/team-work/database/`。
- 本轮未修改后台接口协议，主要变更集中在后台布局与 CSS。
- `background management` 模块此前缺少 `status.md`，本轮已补齐。

## 当前是否允许 push

- 允许 push

## 当前是否完成联调

- 未完成

## 当前是否完成真实环境验证

- 未完成

## 当前验证结论

- 已完成代码级改造与文件自检。
- 已修复后台首页 loading 动画样式遗漏问题。
- 仍需在浏览器中验证后台首页、表格页、地图管理页和窄屏布局表现。
- 仍需确认后台侧边栏折叠、独立滚动与 Header 隐藏在真实环境下表现稳定。
- 仍需确认双列趋势图区、纯文字侧边栏和用户详情页标题收敛后的真实观感。
- 已对用户详情接口增加非核心查询降级兜底，但“所有页面都 500”的根因仍未完成最终定位。
- 已定位 `Invalid token` 的一项根因：本地残留 `admin_token` 持续被带入后台请求；现已增加自动清理。
