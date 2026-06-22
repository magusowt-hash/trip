# 中国护照签证地图后台设计

## 目标

为测试页 `test/app/passport-visa` 搭建一套可迁移的后台骨架，满足当前“页面与功能基础搭建”阶段的管理需求，同时为后期迁移到正式页和数据库存储保留清晰边界。

本阶段后台只覆盖三类核心数据：

1. 国家详情页显示内容
2. 持签场景分类数据
3. 地图与详情相关颜色配置

明确不纳入本阶段范围：

- 国旗资源管理
- 用户权限系统
- 审计日志
- 草稿/发布流
- 多人协作冲突处理

## 背景与约束

当前测试页已经具备：

- 世界地图 SVG 展示
- 国家详情抽屉
- 搜索与图例筛选
- 多个“持签场景”对地图颜色的叠加影响

当前数据状态：

- 国家详情数据存在于 `test/lib/passportVisaSeed.ts`
- 持签场景定义存在于 `test/lib/passportVisaScenarioDefinitions.ts`
- 页面主题颜色存在于 `test/app/passport-visa/page.tsx`

用户明确要求：

1. 当前后台更偏向测试页基础搭建
2. 后期会迁移到正式页
3. 后期正式实现将使用数据库
4. 当前阶段后台改动直接生效，不做草稿发布
5. 国旗对照不需要后台管理
6. 重点管理“详情页显示内容与颜色”以及“持签分类”

因此，本设计不能把后台写成一次性脚手架，也不能现在就引入数据库复杂度。

## 方案选择

### 方案 A：直接读写现有 TS 文件

优点：

- 实现快
- 不需要额外数据层

问题：

- 对源文件结构高度耦合
- 增删改查需要字符串级改写，脆弱
- 后期迁移数据库时后台页面和接口都要重写

结论：不采用。

### 方案 B：统一数据模型 + Repository 接口 + 文件存储实现

优点：

- 当前阶段仍然轻量
- 后台页面、接口和校验规则可复用
- 后期只替换底层存储实现即可迁移到数据库

问题：

- 需要补一层数据与逻辑分离

结论：采用。

### 方案 C：现在直接上数据库

优点：

- 最终形态最完整

问题：

- 当前测试阶段成本过高
- 会把大量工作耗在基础设施而不是后台能力本身

结论：暂不采用。

## 总体架构

后台拆成三层：

1. `Admin UI`
2. `Admin API`
3. `Repository`

### 1. Admin UI

新增测试后台页面：

- `test/app/passport-visa-admin/page.tsx`

职责：

- 列表、搜索、筛选、表单编辑
- 调用后台 API
- 展示即时保存结果与校验信息

### 2. Admin API

新增 route handlers，例如：

- `test/app/api/passport-visa-admin/countries/route.ts`
- `test/app/api/passport-visa-admin/countries/[code]/route.ts`
- `test/app/api/passport-visa-admin/scenarios/route.ts`
- `test/app/api/passport-visa-admin/scenarios/[id]/route.ts`
- `test/app/api/passport-visa-admin/theme/route.ts`

职责：

- 参数校验
- 调用 repository
- 返回统一 JSON 结果

API 不直接依赖文件格式或数据库实现。

### 3. Repository

新增统一存储接口，例如：

- `test/lib/passportVisaAdminRepository.ts`

接口职责：

- 读取国家详情数据
- 写入国家详情数据
- 读取场景数据
- 写入场景数据
- 读取主题颜色
- 写入主题颜色

当前实现：

- 文件存储实现

后期正式页实现：

- 数据库存储实现

迁移时 UI 和 API 形状保持不变。

## 数据源设计

本阶段将“后台可编辑数据”迁移到 `test/data/passport-visa/`。

目录建议：

- `test/data/passport-visa/countries.json`
- `test/data/passport-visa/scenarios.json`
- `test/data/passport-visa/theme.json`

`test/lib` 中只保留：

- 类型定义
- 校验逻辑
- 数据读取/映射逻辑
- 地图与页面使用逻辑

### countries.json

管理国家详情内容，单条结构对应当前详情页字段：

- `mapCountryCode`
- `englishName`
- `chineseName`
- `displayGroup`
- `rawLabel`
- `visaFee`
- `visaRequirement`
- `stayDuration`
- `officialVisaUrl`
- `embassyUrl`
- `isHighRisk`
- `highRiskNote`

说明：

- 这份数据是详情页内容的唯一编辑源
- 地图颜色基础分组 `displayGroup` 也从这里读取

### scenarios.json

管理“持签场景”：

- `id`
- `label`
- `countryCodes`

说明：

- 覆盖当前所有已确认场景：
  - `申根签`
  - `美签`
  - `英签`
  - `加签`
  - `日签`
  - `澳签`
- 后台重点是管理“场景 -> 国家列表”的增删改查

### theme.json

管理颜色配置：

- `visaFree`
- `arrivalOrEVisa`
- `visaRequired`
- `noData`
- `stroke`
- `accentStrong`

说明：

- 测试页地图用色和详情页强调色从这里读取
- 后台直接编辑后立即生效

## 页面设计

后台页面建议采用三栏或“导航 + 列表 + 编辑抽屉”结构。

### 顶层模块

后台分成三个主模块：

1. `Countries`
2. `Scenarios`
3. `Theme`

### Countries 模块

职责：

- 管理详情页内容

布局：

- 左侧搜索与筛选
- 中间国家列表
- 右侧编辑抽屉

支持操作：

- 新增国家
- 编辑国家
- 删除国家
- 按 `displayGroup` 筛选
- 按高风险筛选
- 按国家中英文搜索

右侧编辑字段：

- 中文名
- 英文名
- 签证分组
- 标签文案
- 停留信息
- 签证费
- 签证要求
- 官网链接
- 使馆链接
- 高风险标记
- 高风险备注

### Scenarios 模块

职责：

- 管理“持签场景 -> 国家列表”

布局：

- 左侧场景列表
- 中间场景信息
- 右侧国家选择器

推荐交互：

- 场景列表显示：
  - 名称
  - `id`
  - 国家数量
- 右侧使用双栏穿梭框或可搜索多选列表

支持操作：

- 新增场景
- 修改场景名称
- 修改场景 `id`
- 删除场景
- 增加国家
- 移除国家
- 批量搜索国家并加入

### Theme 模块

职责：

- 管理颜色配置

布局：

- 左侧字段列表
- 右侧颜色输入与预览块

支持操作：

- 编辑颜色值
- 即时预览当前色板

## 即时生效策略

用户要求本阶段后台“直接改数据并立即影响前台测试页”。

本阶段采用：

1. 后台保存时直接写入 JSON 文件
2. 前台测试页数据读取层统一从 JSON 读取
3. 成功保存后触发页面数据刷新

测试阶段可接受的实现方式：

- 后台页保存成功后提示“已保存”
- 前台测试页通过刷新、重新读取或 `revalidatePath('/passport-visa')` 获取新数据

这里的“立即生效”是面向当前测试流程，不要求正式生产级实时同步。

## 校验规则

后台必须具备基础数据校验，否则地图和详情页会被改坏。

### Countries 校验

- `mapCountryCode` 必填且唯一
- `englishName` 必填
- `chineseName` 必填
- `displayGroup` 必须属于允许值
- URL 字段必须为合法 URL 或空

### Scenarios 校验

- `id` 必填且唯一
- `label` 必填
- `countryCodes` 中每个值必须存在于国家表
- 删除国家前需检查是否被场景引用

### Theme 校验

- 颜色值必须是合法 hex
- 所有必填主题键都必须存在

## 迁移边界

本设计的关键目标是“后期可迁移到正式页 + 数据库”。

因此要严格控制迁移边界：

### 当前阶段可复用部分

- 后台页面结构
- API 契约
- 表单与校验逻辑
- 场景管理交互
- 国家详情管理交互
- 主题颜色管理交互

### 后期替换部分

- 文件 repository
- JSON 数据文件
- 路由层内部的存储调用

### 迁移目标形态

后期数据库模型可自然映射为：

- `countries`
- `visa_scenarios`
- `visa_scenario_countries`
- `passport_visa_theme`

当前文件结构应尽量贴近这个目标模型，避免二次清洗。

## 实施顺序

建议按以下顺序实现：

1. 新增 `test/data/passport-visa/*.json`
2. 新增 repository 与读取映射层
3. 让前台测试页改为从新数据层读取
4. 新增后台 API
5. 完成 `Countries` 模块
6. 完成 `Scenarios` 模块
7. 完成 `Theme` 模块
8. 增加基础错误提示与保存反馈

## 风险与控制

### 风险 1：测试页和后台编辑逻辑耦合过深

控制：

- 后台只读写数据层
- 前台只消费映射后的领域对象

### 风险 2：后期数据库迁移时重复返工

控制：

- 现在就建立 repository 边界
- API 契约不直接暴露文件结构细节

### 风险 3：数据被后台误改导致地图异常

控制：

- 保存前校验
- 删除前引用检查
- 颜色与 URL 做格式约束

## 推荐结论

本阶段后台应被定义为：

“正式后台的数据模型与交互骨架，当前使用文件存储实现的测试版”

这样做可以同时满足：

- 当前测试页快速搭建
- 立即生效的数据编辑体验
- 后期迁移正式页和数据库时最大复用

不建议把当前后台做成一次性文件编辑器，也不建议在这个阶段直接引入数据库复杂度。
