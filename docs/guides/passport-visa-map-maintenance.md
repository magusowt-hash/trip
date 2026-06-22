# 中国护照签证地图维护文档

本文档对应测试页实现：

- `/Users/apple/Desktop/codex/trip/test/app/passport-visa/page.tsx`
- `/Users/apple/Desktop/codex/trip/test/app/passport-visa/page.module.css`
- `/Users/apple/Desktop/codex/trip/test/app/passport-visa-admin/page.tsx`
- `/Users/apple/Desktop/codex/trip/test/app/passport-visa-admin/page.module.css`
- `/Users/apple/Desktop/codex/trip/test/app/api/passport-visa/bootstrap/route.ts`
- `/Users/apple/Desktop/codex/trip/test/app/api/passport-visa-admin`
- `/Users/apple/Desktop/codex/trip/test/data/passport-visa/countries.json`
- `/Users/apple/Desktop/codex/trip/test/data/passport-visa/scenarios.json`
- `/Users/apple/Desktop/codex/trip/test/data/passport-visa/theme.json`
- `/Users/apple/Desktop/codex/trip/test/lib/passportVisaFlag.ts`
- `/Users/apple/Desktop/codex/trip/test/lib/passportVisaDetailInfo.ts`
- `/Users/apple/Desktop/codex/trip/test/lib/passportVisaLegendFilters.ts`
- `/Users/apple/Desktop/codex/trip/test/lib/passportVisaOverlay.ts`
- `/Users/apple/Desktop/codex/trip/test/lib/passportVisaScenarioDefinitions.ts`
- `/Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminRepository.ts`
- `/Users/apple/Desktop/codex/trip/test/lib/passportVisaAdminValidation.ts`
- `/Users/apple/Desktop/codex/trip/test/lib/passportVisaRiskMark.ts`
- `/Users/apple/Desktop/codex/trip/test/lib/passportVisaRiskMark.tsx`
- `/Users/apple/Desktop/codex/trip/test/lib/passportVisaViewport.ts`
- `/Users/apple/Desktop/codex/trip/test/lib/passportVisaSvgStroke.ts`
- `/Users/apple/Desktop/codex/trip/test/lib/passportVisaRegionPolicy.ts`
- `/Users/apple/Desktop/codex/trip/test/lib/passportVisaSeed.ts`
- `/Users/apple/Desktop/codex/trip/scripts/mfaCountryScraper.mjs`
- `/Users/apple/Desktop/codex/trip/scripts/syncMfaCountrySections.mjs`
- `/Users/apple/Desktop/codex/trip/data/mfa-country-info.json`

## 目标

当前页面是中国护照签证地图的前台测试框架，核心目标有四个：

1. 用全屏 SVG 世界地图展示签证状态
2. 支持鼠标滚轮缩放和拖拽平移
3. 支持国家悬停、点击、渐隐遮罩反馈
4. 支持右侧详情抽屉、底部搜索、右下角图例筛选

## 当前结构

页面入口在 `page.tsx`，主要分成五层：

1. 地图数据层
2. SVG 装配层
3. 缩放平移层
4. 黑色遮罩交互层
5. 搜索、图例、详情抽屉 UI 层

### 1. 地图数据层

`src/modules/maps/packages/china-passport-visa-map/data/passportVisaCountries.ts`

- 是国家详情与基础颜色分组的真实持久化数据源
- `/passport-visa-admin` 保存国家资料时，默认直接改这份前台数据文件
- `test/data/passport-visa/countries.json` 仍可用于测试脚本和种子数据参考，但不再是后台保存落点
- 包含中文名、英文名、签证标签、详情字段、颜色分组
- 风险字段当前使用：
  - `riskLevel`
  - `highRiskNote`
- 领事补充字段当前还包括：
  - `entryResidence`
  - `travelRiskSafety`
  - `safetyPrecautions`
  - `religiousLawRestrictions`
- `riskLevel` 允许值固定为：
  - `低风险`
  - `中风险`
  - `高风险`
  - `请勿前往`
- 这些领事补充字段可直接在 `/passport-visa-admin` 的“地区编辑”中维护
- `visaRequirement` 和 `riskNote` 已删除，不应再加回类型、表单、展示或脚本样例
- 这些领事补充字段的推荐同步来源是中国领事服务网国家页抓取结果：
  - `data/mfa-country-info.json`

#### 领事数据抓取与回填

当前测试页的领事补充数据链路为：

1. `scripts/mfaCountryScraper.mjs`
2. `data/mfa-country-info.json`
3. `scripts/syncMfaCountrySections.mjs`
4. `test/data/passport-visa/countries.json`

国家编辑后台的真实持久化链路为：

1. `/passport-visa-admin`
2. `test/app/api/passport-visa-admin/*`
3. `test/lib/passportVisaAdminRepository.ts`
4. `src/modules/maps/packages/china-passport-visa-map/data/passportVisaCountries.ts`

职责说明：

- `mfaCountryScraper.mjs`
  - 从中国领事服务网国家页抓取三段文本
  - 输出标准化国家数据到 `data/mfa-country-info.json`
- `syncMfaCountrySections.mjs`
  - 将抓取结果按国家别名映射回填到 `countries.json`
  - 若某国无抓取结果，则保留空字符串
- `passportVisaAdminRepository.ts`
  - 默认从真实前台数据文件 `passportVisaCountries.ts` 读写国家记录
  - 场景和主题仍分别落到 `test/data/passport-visa/scenarios.json`、`test/data/passport-visa/theme.json`

当前领事字段映射关系固定为：

- `entryResidence` -> 入境居留
- `travelRiskSafety` -> 旅行风险等级和安全提醒
- `safetyPrecautions` -> 安全防范
- `religiousLawRestrictions` -> 教法约束

维护规则：

- 有数据就写入正文
- 无数据就留空字符串
- 不要用 `null`、`undefined` 或占位文案替代空值

当前已补过的别名覆盖包括但不限于：

- `阿联酋` -> `阿拉伯联合酋长国`
- `波黑` -> `波斯尼亚和黑塞哥维那`
- `蒙古` -> `蒙古国`
- `捷克` -> `捷克共和国`
- `中非` -> `中非共和国`
- `巴勒斯坦` -> `巴勒斯坦领土`
- `刚果(金)` / `刚果（金）`
- `刚果(布)` / `刚果（布）`

如果后续再出现领事数据缺失，优先检查：

1. 目标国家页是否抓取成功
2. 国家中文名是否需要补别名映射
3. `syncMfaCountrySections.mjs` 是否把目标记录覆盖回 `countries.json`

`passportVisaSeed.ts`

- 负责从 `countries.json` 读取国家主数据
- 前台测试逻辑继续消费统一结构，不再直接硬编码国家数组

`passportVisaRegionPolicy.ts`

- 负责 SVG 区域码到展示国家码的映射
- 处理属地并入主权国
- 处理 `CN/HK/MO/TW` 不可交互

这两层决定：

- 哪些 SVG path 可交互
- 哪些 path 共享同一个国家详情
- 图例统计按哪个口径计算
- 详情抽屉标题区显示哪面国旗

`passportVisaLegendFilters.ts`

- 负责右侧 `Visa Legend` 的三项筛选数据
- 当前只生成：
  - `免签`
  - `落地签 / 电子签`
  - `需签证`
- 不再生成：
  - `全部`
  - `高风险`
  - `无数据`

`passportVisaFlag.ts`

- 负责把 `mapCountryCode` 映射到国旗资源路径
- 当前测试页国旗资源通过：
  - `/svg/{country-code-lowercase}.svg`
  - 实际文件目录是 `test/svg`
- 公开目录入口是 `test/public/svg`

`test/data/passport-visa/scenarios.json`

- 是“申根签 / 美签 / 英签 / 加签 / 日签 / 澳签”等持签场景的唯一可编辑数据源

`passportVisaScenarioDefinitions.ts`

- 负责从 `scenarios.json` 读取签证场景
- 每个场景只维护三项：
  - `id`
  - `label`
  - `countryCodes`

`test/data/passport-visa/theme.json`

- 是地图与详情抽屉主题色的唯一可编辑数据源

`passportVisaTheme.ts`

- 负责从 `theme.json` 读取主题

`passportVisaAdminRepository.ts`

- 负责文件型读写
- 当前后台 API 和测试页 bootstrap 都通过它访问数据
- 默认国家数据源是 `src/modules/maps/packages/china-passport-visa-map/data/passportVisaCountries.ts`
- 默认场景与主题数据源仍是 `test/data/passport-visa/scenarios.json` 和 `test/data/passport-visa/theme.json`

`passportVisaAdminValidation.ts`

- 负责后台保存前的基础校验
- 当前也负责约束领事补充字段必须为字符串

#### 风险等级推导

当前测试页风险分组的来源不再完全手填，推导规则优先参考 `travelRiskSafety` 文本：

- 命中 `极高风险` -> `请勿前往`
- 命中 `高风险` -> `高风险`
- 命中 `中风险` -> `中风险`
- 否则 -> `低风险`

这意味着：

- `riskLevel` 是前台展示与图标映射字段
- `travelRiskSafety` 是更长的原始提醒正文
- 两者允许并存，不要把长文本裁成短标签直接替代 `riskLevel`

`/api/passport-visa/bootstrap`

- 前台测试页首次进入时通过该接口获取 `countries + scenarios + theme`

`/passport-visa-admin`

- 测试后台入口
- 当前用于直接增删改查 JSON 数据

### 2. SVG 装配层

`page.tsx` 在 `useEffect` 中加载：

- `/maps/passport-visa/world.svg`

然后做以下处理：

1. 解析原始 SVG
2. 遍历每个 `path[id]`
3. 根据国家数据决定填色、交互属性、属地归属
4. 为可交互国家额外克隆一层黑色 overlay path
5. 最后只保存 `svg.innerHTML` 到 `svgInnerMarkup`

这里有一个关键原则：

- React 只保存 SVG 内部内容
- 根 `<svg>` 由 React 自己渲染
- `viewBox` 由 React state 直接控制

这是为了避免早期出现的“双 viewBox 源”问题：

- 原始 innerHTML 带初始 viewBox
- effect 再去修改 live DOM 的 viewBox

这种写法会在 rerender 时出现“瞬间回到初始视图再恢复”的闪现。当前实现已经移除这个问题。

### 3. 缩放平移层

缩放和平移逻辑集中在：

- `passportVisaViewport.ts`

当前使用的是真矢量方案，不是 CSS transform 放大。

#### 关键状态

`page.tsx` 中：

- `viewBox`
- `baseViewBoxRef`

说明：

- `baseViewBoxRef` 保存地图初始视口
- `viewBox` 保存当前实际视口
- 根 SVG 直接渲染：
  - `viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}`

#### 缩放

滚轮缩放流程：

1. `handleWheel`
2. `zoomPassportVisaViewBoxAtPoint(...)`
3. `clampPassportVisaZoomViewBoxAtPoint(...)`
4. `setViewBox(...)`

当前限制：

- `PASSPORT_VISA_MIN_ZOOM_SCALE = 0.8`
- `PASSPORT_VISA_MAX_ZOOM_SCALE = 12`

`clampPassportVisaZoomViewBoxAtPoint(...)` 的职责：

- 命中最大/最小缩放边界时重新按鼠标锚点计算视口
- 避免继续滚轮时出现“视图滑动”

#### 平移

拖拽平移流程：

1. `handlePointerDown` 记录起点和 `originViewBox`
2. `handlePointerMove` 计算拖拽位移
3. `panPassportVisaViewBox(...)`
4. `setViewBox(...)`

注意：

- 当前平移依赖 `dragStateRef.current.originViewBox`
- 不再依赖 CSS `translate(...)`

### 4. 黑色遮罩交互层

遮罩逻辑集中在：

- `passportVisaOverlay.ts`
- `page.tsx` 的 overlay state 和 `useLayoutEffect`

#### overlay 结构

每个可交互国家会额外生成一层 overlay path：

- `data-overlay-code`
- `fill: #111111`
- `opacity: 0`
- `pointer-events: none`

overlay 只负责黑色反馈，不负责命中。

#### 当前交互目标

1. 悬停立即变黑
2. 悬停移出直接渐隐，无驻留
3. 点击继承黑色
4. 点击保持 `150ms`
5. 然后渐隐
6. 整个链路不闪烁

#### 关键常量

`passportVisaOverlay.ts`

- `PASSPORT_VISA_OVERLAY_HOLD_DURATION_MS = 150`
- `PASSPORT_VISA_OVERLAY_FADE_DURATION_MS = 1100`

#### 关键状态

`page.tsx`

- `hoveredOverlayCode`
- `suppressedHoverCode`
- `animatedOverlayCode`
- `animatedOverlayState`

含义：

- `hoveredOverlayCode`：当前鼠标下的国家
- `suppressedHoverCode`：点击同一国家时暂时屏蔽 hover
- `animatedOverlayCode`：当前执行 click 或 hover fade 的国家
- `animatedOverlayState`：`visible` 或 `fading`

#### 统一渲染入口

所有 overlay 的最终样式都在一个 `useLayoutEffect` 里落到 DOM：

1. `getPassportVisaRenderedOverlayStates(...)`
2. `getPassportVisaOverlayTransitionPlan(...)`
3. `getPassportVisaOverlayPresentationStyle(...)`
4. 写入每个 overlay path 的 `opacity` 和 `transition`

不要再新增第二条直接操作 overlay 节点的旁路，否则很容易重新引入闪烁。

#### 渐隐触发细节

`visible -> fading` 不是直接一步切。

当前实现会先保持 `visible`，再下一帧切到 `fading`。原因是：

- 如果同一轮里同时改 `transition` 和 `opacity`
- 浏览器可能直接跳到终态
- 视觉上看起来像闪一下，而不是渐隐

### 5. 搜索、图例和详情抽屉 UI 层

#### 搜索

当前底部只保留左侧搜索入口：

- 底部左侧 `Search`
- 输入后左侧浮出搜索结果卡片
- 点击结果卡片直接打开详情抽屉

当前已经删除独立 `Filter` 区，不要再按旧文档恢复。

#### 地图悬停提示

当前地图 hover 除了黑色 overlay 反馈，还会显示一个独立的鼠标跟随提示卡。

内容规则：

- 只显示国旗 + 中文国名
- 不显示英文名
- 仍只对可交互国家显示

定位规则：

- 提示卡跟随鼠标，默认出现在鼠标右下方
- 靠近视口右边时，需要自动收进视口内
- 靠近视口底边时，需要翻转到鼠标上方
- 位置计算集中在 `test/lib/passportVisaHoverCard.ts`

宽度规则：

- 宽度按内容自适应，不再固定为 220px
- 仍有最大宽度限制，避免长国名把提示卡推出屏幕
- 当前最大宽度优先值为 `320px`

视觉规则：

- 使用横向卡片布局
- 背景当前为白色 `50%` 透明度
- 保留模糊和阴影
- `pointer-events: none`，不能截断地图 hover / click 链路

相关实现：

- `test/app/passport-visa/page.tsx`
- `test/app/passport-visa/page.module.css`
- `test/lib/passportVisaHoverCard.ts`
- `test/lib/passportVisaHoverCard.test.mjs`

#### Visa Legend

当前 `Visa Legend` 位于右下角，只承担两件事：

1. 展示三类签证状态和数量
2. 提供三类签证状态筛选入口

当前规则：

- 只显示：
  - `免签`
  - `落地签 / 电子签`
  - `需签证`
- 不显示：
  - `全部`
  - `高风险`
  - `无数据`
- 点击某一项：
  - 进入该类筛选
- 再次点击同一项：
  - 取消筛选
  - 回到 `all`

当前布局约束：

- `Visa Legend` 在底部右侧
- `Visa Legend` 的底边与左侧 `Search` 整个块的底边对齐
- 底部标题 `中国护照签证地图` 独立绝对定位
- 标题中心线与 `Search` 块中心线对齐

当前视觉约束：

- `Visa Legend` 的可点击项有 hover 效果
- hover 仅做轻量背景和位移反馈
- active 状态使用更深的底色

#### 详情抽屉

详情抽屉标题区当前为：

- 左侧国旗
- 右侧中文名与英文名
- 标题区右侧风险图标
- 国旗无圆角、无边框
- 国旗尺寸固定，避免被各国 SVG 原始宽高拉爆

抽屉背景当前规则：

- 与地图页底色同源
- 当前使用 80% 不透明渐变背景
- 保留轻微模糊

#### 详情抽屉中的领事信息交互

当前详情抽屉有四处“悬停提示 + 点击弹窗”交互：

1. 签证类型标签
2. 教法约束标签
3. 风险分组标签
4. 标题区风险图标

字段映射固定为：

- 签证类型标签 -> `entryResidence`
- 教法约束标签 -> `religiousLawRestrictions`
- 风险分组标签 -> `travelRiskSafety`
- 风险图标 -> `safetyPrecautions`

交互规则：

- 悬停显示简短提示框
- 鼠标移出触发器后，悬停提示框立即消失
- 点击打开一个独立的展开悬浮窗
- 展开悬浮窗与悬停提示框在视觉上保持同源，只是展示更多正文
- 展开悬浮窗不并入下方详情内容流，不推动 `drawerScroll` 内部卡片
- 鼠标进入展开悬浮窗范围，视为仍处于有效命中区域
- 鼠标移出展开悬浮窗范围，展开悬浮窗自动关闭
- 若字段为空，弹窗与提示框显示对应的“暂无信息”文案

提示框定位规则：

- 标签提示框与展开窗都固定从标签下方向下展开
- 图标提示框与展开窗都固定从图标下方向下展开
- 横向宽度统一对齐下方详情信息卡，以抽屉内部左右边界为准
- 图标只负责箭头落点，不再单独做右侧自适应漂移逻辑
- 标签提示框垂直位置要严格贴合标签，不要再上移到标题区
- 图标提示框可以更贴近图标，但也必须保持在抽屉内边界以内

相关实现：

- `test/lib/passportVisaDetailInfo.ts`
- `test/lib/passportVisaAdminTypes.ts`
- `test/app/passport-visa/page.tsx`
- `test/app/passport-visa/page.module.css`
- `test/app/passport-visa-admin/page.tsx`

#### 教法约束字段

`religiousLawRestrictions` 是本轮新增的国家详情字段，用于承接外籍游客在宗教法、着装、禁酒禁食、拍摄、礼拜、传教等方面的约束信息。

当前规则：

- 后台“地区编辑”中提供独立长文本输入框
- 前台详情页在签证类型标签同一行增加 `教法约束` 标签
- 标签交互与现有签证类型标签、风险分组标签保持一致：
  - 悬停显示预览
  - 点击展开独立悬浮窗
  - 无数据时显示 `暂无教法约束信息`

#### Excel 导入规则（外籍游客教法约束）

数据源：

- `/Users/apple/Downloads/外籍游客教法约束国家清单.xlsx`

本轮已按国家名全量写入 `test/data/passport-visa/countries.json` 的 `religiousLawRestrictions` 字段。

别名合并规则：

- `文莱达鲁萨兰国` -> `文莱`
- `卡塔尔国` -> `卡塔尔`
- `阿拉伯联合酋长国（阿联酋）` -> `阿拉伯联合酋长国`
- `阿曼苏丹国` -> `阿曼`
- `科威特国` -> `科威特`
- `巴林王国` -> `巴林`
- `约旦哈希姆王国` -> `约旦`

区域合并规则：

- `也门（胡塞武装控制区）` -> 写入 `也门`
- `印度尼西亚共和国（亚齐特别行政区）` -> 写入 `印度尼西亚`
- `马来西亚（吉兰丹州、登嘉楼州、吉打州、玻璃市州）` -> 写入 `马来西亚`

对上述 3 个区域合并项，字段正文首行固定补：

- `适用范围：胡塞武装控制区`
- `适用范围：亚齐特别行政区`
- `适用范围：吉兰丹州、登嘉楼州、吉打州、玻璃市州`

当前状态拆分：

- `previewDetailInfoState`：管理悬停预览
- `expandedDetailInfoState`：管理点击展开
- `previewPanelLayout` / `expandedPanelLayout`：分别管理两种窗体的宽度、左侧位置、箭头位置、顶部位置
- `previewPanelMaxHeight` / `expandedPanelMaxHeight`：分别限制悬停窗与展开窗的最大外层高度

高度规则：

- 高度限制作用于整个悬浮窗外框，不只作用于正文文本区
- 最大高度以下方抽屉内容区域的内部底边为准
- 标签悬浮窗最大高度低于图标悬浮窗
- 展开悬浮窗允许内部滚动，但滚动容器只存在于展开态正文，不应让整个详情页跟着一起滚

视觉规则：

- 悬浮窗无边框
- 通过 `::before` 保留箭头
- 由于箭头存在，外层容器需要允许 `overflow: visible`
- 标签与图标本身不要再加 hover 微动效

#### 风险图标

详情抽屉标题区右侧的风险图标由：

- `test/lib/passportVisaRiskMark.ts`
- `test/lib/passportVisaRiskMark.tsx`

负责映射与渲染。

当前图标语义固定为：

- `低风险` -> 绿色盾牌对号
- `中风险` -> 明黄警示三角
- `高风险` -> 亮红警示三角
- `请勿前往` -> 红色禁行图标

尺寸与位置规则：

- 图标整体统一尺寸
- `请勿前往` 图标相对其他图标缩小 10%
- 图标放在国旗到英文名区域右侧的视觉中心位置
- 图标按钮本身不做 hover 位移或轻微抬升
- 图标悬浮窗宽度与下方详情卡片宽度对齐，只通过箭头指向图标位置

#### 风险分组标签显示规则

当前详情抽屉中的“风险分组标签”不是总显示：

- `低风险`：不显示标签
- `中风险`：显示标签
- `高风险`：显示标签
- `请勿前往`：显示标签

相关 helper：

- `shouldRenderPassportVisaRiskBadge(...)`

如果后续看到“低风险标签又出现”或“中高风险标签消失”，优先检查这里。

### 6. 详情抽屉和关闭逻辑

详情抽屉相关状态：

- `selectedCountryCode`
- `isDrawerOpen`

#### 打开

由 `activateCountry(code)` 负责：

1. 设置选中国家
2. 打开抽屉
3. 启动点击遮罩保持和渐隐

#### 关闭

当前关闭方式有两种：

1. 右上角关闭按钮
2. 独立透明 `drawerBackdrop`

`drawerBackdrop` 是后期修复的关键：

- 它位于地图之上、抽屉之下
- 点击它只关闭抽屉
- 不再把关闭点击穿透给地图

如果后续又把“点空白关闭”改回地图层处理，很容易重新引入：

- hover 瞬时变化
- 关闭详情时地图误响应

## 描边逻辑

描边相关逻辑集中在：

- `passportVisaSvgStroke.ts`

当前地图采用：

- `vector-effect="non-scaling-stroke"`

目标是：

- 地图通过 `viewBox` 放大时
- 描边不跟着一起变粗
- 视觉上会显得更细、更干净

如果后续觉得描边仍然太粗，优先调这里：

- 路径基础 `stroke-width`
- hover 时的 `stroke-width`

而不是重新改回缩放描边。

## 常见问题与定位方式

### 1. 关闭详情页时地图瞬间回到初始视图

优先检查：

- 是否又把根 SVG 改回完整 innerHTML 注入
- 是否又在 effect 中单独 `setAttribute('viewBox', ...)`

正确原则：

- 根 SVG 必须由 React 直接渲染
- `viewBox` 必须只有一个真源：`viewBox state`

### 2. 放大后地图发虚

优先检查：

- 是否又把缩放改回 CSS `transform: scale(...)`

正确原则：

- 缩放必须通过 SVG `viewBox`
- 不能通过外层 div transform 放大

### 3. 放大到极限时继续滑动

优先检查：

- 是否绕过了 `clampPassportVisaZoomViewBoxAtPoint(...)`
- 是否缩放上限写死在页面里而不是 helper 里

### 4. 悬停或点击出现闪烁

优先检查：

- 是否新增第二条 overlay 写样式路径
- 是否跳过了 `getPassportVisaOverlayTransitionPlan(...)`
- 是否在同一帧直接从 `visible` 写到 `fading`

### 5. hover 移出不渐隐

优先检查：

- `startHoverFade(code)` 是否还在
- `handlePointerMove` 和 `handlePointerLeave` 是否还会把旧 hover 国家送入 `fading`

### 6. 关闭详情页影响地图

优先检查：

- `drawerBackdrop` 是否还存在
- 关闭抽屉点击是否又落回地图层

### 7. 本轮交互收敛记录（2026-06-17）

本轮主要收敛的是详情抽屉内三类领事信息入口的浮层行为：

1. 风险图标、签证类型标签、风险分组标签统一接入同一套 detail info helper
2. 悬停态与点击展开态拆为两套独立 state，避免互相覆盖
3. 浮层宽度改为和下方详情信息卡左右边界对齐，不再做“靠左/靠右自适应漂移”
4. 箭头位置改为固定窗体下的独立计算，只负责指向触发器中心
5. 整个浮层外框高度限制在详情抽屉内边界之内，而不是只裁正文
6. 浮层边框已移除，但箭头仍保留
7. 低风险仍显示标题区绿色盾牌图标，但不显示“风险分组”标签
8. 点击展开后，浮层应作为独立悬浮层存在；鼠标离开展开层时自动关闭

## 推荐调试顺序

以后如果要继续调这个页面，建议按顺序排查：

1. 先判断问题属于哪一层
2. 不要一上来同时改事件、overlay、viewBox

推荐归类：

- 视图缩放问题：查 `passportVisaViewport.ts`
- 轮廓/描边问题：查 `passportVisaSvgStroke.ts`
- 黑色反馈问题：查 `passportVisaOverlay.ts`
- 图例筛选问题：查 `passportVisaLegendFilters.ts`
- 国旗路径或详情标题问题：查 `passportVisaFlag.ts`、抽屉 header 和对应样式
- 关闭详情影响地图：查 `drawerBackdrop` 和抽屉层级
- 国家映射错误：查 `passportVisaRegionPolicy.ts`
- 国家文案或字段错误：优先查 `src/modules/maps/packages/china-passport-visa-map/data/passportVisaCountries.ts`
- 场景国家集合错误：优先查 `test/data/passport-visa/scenarios.json`
- 主题配色错误：优先查 `test/data/passport-visa/theme.json`
- 后台保存失败：查 `passportVisaAdminRepository.ts`、`passportVisaAdminValidation.ts`、`/api/passport-visa-admin/*`
- 风险等级或高风险备注显示错误：查 `passportVisaCountries.ts` 的 `riskLevel` / `highRiskNote`，以及前台详情面板
- 领事三段文本缺失：查 `data/mfa-country-info.json`、`scripts/mfaCountryScraper.mjs`、`scripts/syncMfaCountrySections.mjs`
- 详情抽屉悬停提示框位置异常：查 `page.tsx` 中的 `getDetailPanelLayout(...)` 与 `page.module.css` 的 `detailInfoPanel*`
- 详情抽屉悬停/展开逻辑混乱：优先查 `previewDetailInfoState`、`expandedDetailInfoState` 和 `getDetailInfoInteractiveProps(...)`
- 详情抽屉风险图标或风险标签异常：查 `passportVisaRiskMark.ts[x]`、`passportVisaDetailInfo.ts`

## 当前验证命令

缩放、图例筛选、详情国旗路径测试：

```bash
node --test \
  /Users/apple/Desktop/codex/trip/test/lib/passportVisaLegendFilters.test.mjs \
  /Users/apple/Desktop/codex/trip/test/lib/passportVisaFlag.test.mjs \
  /Users/apple/Desktop/codex/trip/test/lib/passportVisaViewport.test.mjs \
  /Users/apple/Desktop/codex/trip/test/lib/passportVisaSvgStroke.test.mjs \
  /Users/apple/Desktop/codex/trip/test/lib/passportVisaOverlay.test.mjs
```

页面构建 / 类型验证：

```bash
cd /Users/apple/Desktop/codex/trip/test && ./node_modules/.bin/tsc --noEmit
```

领事抓取 / 同步验证：

```bash
node --test /Users/apple/Desktop/codex/trip/scripts/mfaCountryScraper.test.mjs
node --test /Users/apple/Desktop/codex/trip/scripts/syncMfaCountrySections.test.mjs
node /Users/apple/Desktop/codex/trip/scripts/syncMfaCountrySections.mjs
```

风险图标 / 详情交互 helper 验证：

```bash
node --test \
  /Users/apple/Desktop/codex/trip/test/lib/passportVisaRiskMark.test.mjs \
  /Users/apple/Desktop/codex/trip/test/lib/passportVisaDetailInfo.test.mjs
```

后台与前台测试页构建：

```bash
cd /Users/apple/Desktop/codex/trip/test && npm run build
```

## 后续维护建议

1. 不要把地图根 SVG 再改回整块字符串注入
2. 不要新增第二套 overlay DOM 更新机制
3. 缩放相关计算尽量继续收口在 `passportVisaViewport.ts`
4. 任何关闭详情页的点击逻辑都不要穿透到地图层
5. `Visa Legend` 当前只保留三类签证项，除非有明确设计变更，不要把 `全部 / 高风险 / 无数据` 再塞回图例
6. 国旗资源路径依赖 `test/public/svg -> ../svg`，如果迁移资源目录，必须同步改 `passportVisaFlag.ts`
7. 现在不要再直接改 `passportVisaSeed.ts` 或 `passportVisaScenarioDefinitions.ts` 里的内容来源，国家、场景、主题的维护入口已经切到 `test/data/passport-visa/*.json`
8. 如果继续扩后台能力，优先保持 `bootstrap API -> 前台页面` 这条读取链稳定，不要把 `fs` 读取重新放回客户端组件
9. 领事补充数据优先通过 `mfaCountryScraper.mjs -> mfa-country-info.json -> syncMfaCountrySections.mjs` 这条链同步；如果要改线上实际持久化结果，最终要同步到 `passportVisaCountries.ts`
10. 调整详情抽屉 hover 提示框时，优先从下方展开，避免被抽屉滚动容器裁切
11. 不要重新引入标签或图标的“自适应左右漂移”逻辑，当前改为固定宽度 + 箭头定位
12. 如果要继续调浮层高度，先改 `passportVisaDetailInfo.ts` 里的 max-height helper，再改样式，不要只改 CSS
