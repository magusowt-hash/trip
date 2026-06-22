# 中国护照签证测试后台地区编辑补充领事信息设计

## 目标

在测试后台 `test/app/passport-visa-admin/page.tsx` 的“地区编辑”中新增 3 个可编辑字段：

1. 入境居留
2. 旅行风险等级和安全提醒
3. 安全防范

要求：

- 这 3 个字段直接并入现有国家记录模型
- 已抓取到的领事信息批量回填到国家数据文件
- 没有抓取到的数据保持空字符串
- 保存逻辑继续沿用现有国家保存接口
- 不修改正式地图包后台

## 范围

仅修改测试后台链路：

- `test/lib/passportVisaAdminTypes.ts`
- `test/lib/passportVisaAdminValidation.ts`
- `test/lib/passportVisaAdminRepository.ts`
- `test/app/passport-visa-admin/page.tsx`
- `test/data/passport-visa/countries.json`
- 与本次变更直接相关的测试文件
- 一次性数据同步脚本

明确不在本次范围内：

- 正式地图包后台 `src/modules/maps/packages/china-passport-visa-map/admin`
- 数据库存储
- 领事信息来源站点的在线实时抓取
- 单独的富文本编辑器
- 额外的发布审核流程

## 现状

当前测试后台国家记录 `PassportVisaCountryRecord` 已包含：

- 基础国家信息
- 签证展示字段
- 风险等级与简短风险备注

但尚未包含中国领事服务网国家页中的三段长文本内容。

当前本地已生成抓取结果文件：

- `data/mfa-country-info.json`

该文件对每个国家已提取：

- `entryResidence`
- `travelRiskSafety`
- `safetyPrecautions`

每个字段下同时包含：

- `heading`
- `text`
- `html`

测试后台现有国家数据源为：

- `test/data/passport-visa/countries.json`

因此，最佳接法不是在运行时叠加第二份数据源，而是把需要展示和编辑的正文直接并入国家记录。

## 方案选择

### 方案 A：后台表单直接读取 `data/mfa-country-info.json`

优点：

- 初始实现快
- 不需要修改国家数据文件结构

问题：

- 运行时会出现两份国家数据源
- 编辑保存时需要决定写回哪一份文件
- 后续迁移数据库时要同时搬运两套逻辑

结论：不采用。

### 方案 B：把 3 个字段正式并入国家记录，并一次性回填抓取结果

优点：

- 国家数据保持单一来源
- 后台编辑和保存路径不变
- 后续迁移数据库只需迁移统一模型
- 没抓到的数据天然可为空

问题：

- 需要对已有 `countries.json` 做一次全量补字段

结论：采用。

### 方案 C：只加空字段，不做历史数据回填

优点：

- 改动最小

问题：

- 已抓取数据无法复用
- 195 个国家需要大量重复手填

结论：不采用。

## 数据模型设计

在 `PassportVisaCountryRecord` 中新增 3 个字符串字段：

- `entryResidence`
- `travelRiskSafety`
- `safetyPrecautions`

设计约束：

- 类型均为 `string`
- 默认值为空字符串 `''`
- 存纯文本，不存抓取 HTML

采用纯文本的原因：

- 当前后台表单是普通 `textarea`
- 前台测试页现阶段并未消费这 3 个字段的富文本结构
- 纯文本更稳定，避免把站点样式残留写进可编辑源

`data/mfa-country-info.json` 中的 `heading` 和 `html` 只作为一次性同步参考，不进入 `countries.json`。

## 数据同步设计

新增一个一次性同步脚本，职责是：

1. 读取 `test/data/passport-visa/countries.json`
2. 读取 `data/mfa-country-info.json`
3. 以抓取结果中的 `countryName` 对应国家记录中的 `chineseName`
4. 将以下字段写入国家记录：
   - `entryResidence = scraped.entryResidence.text || ''`
   - `travelRiskSafety = scraped.travelRiskSafety.text || ''`
   - `safetyPrecautions = scraped.safetyPrecautions.text || ''`
5. 若没有匹配到抓取结果，则将这 3 个字段写为 `''`
6. 保留国家记录中其它字段不变

映射策略选中文名一对一匹配，原因是：

- 当前测试国家数据和抓取结果都使用中文国家名
- 比 `mapCountryCode` 更容易在现有抓取结果里直接对应
- 本次目标是快速并入现有后台，而不是重新建立复杂映射表

风险控制：

- 同步脚本应输出匹配数量与未匹配国家名单，便于人工复核
- 对于中文名不一致的个别国家，允许本轮先留空，后续后台手工补齐

## 后台 UI 设计

修改页面：

- `test/app/passport-visa-admin/page.tsx`

在“地区编辑”表单中新增 3 个多行文本字段，放在现有签证要求和链接字段之后：

1. `入境居留`
2. `旅行风险等级和安全提醒`
3. `安全防范`

交互规则：

- 打开已有国家时，表单显示当前字符串内容
- 新增国家时，这 3 个字段默认空字符串
- 编辑时允许为空
- 保存时与其它国家字段一起提交

不引入富文本编辑器，理由：

- 当前测试后台重心是字段闭环，不是排版
- 站点原文已经被整理成纯文本
- 富文本会显著扩大本次范围

## 校验设计

修改 `test/lib/passportVisaAdminValidation.ts`：

- 继续保留现有必填和 URL 校验
- 不为这 3 个新字段增加必填要求
- 只要求它们在运行时是字符串

这样可以满足“无数据留空”的要求。

## 前台数据读取影响

`/api/passport-visa/bootstrap` 与 repository 仍返回完整国家记录数组。

即使前台测试页当前未展示这 3 个字段，也应保持 bootstrap 能无损带出，原因是：

- 后台保存后数据结构必须完整一致
- 后续右侧详情或正式页迁移时可直接复用

本次不要求修改前台测试页展示逻辑。

## 测试设计

先写失败测试，再实现。

测试覆盖：

1. `PassportVisaCountryRecord` 校验允许 3 个新字段为空字符串
2. 同步脚本可将样本国家的抓取正文写入国家记录
3. 同步后 `countries.json` 中每条记录都存在这 3 个字段
4. 后台国家保存接口继续接受包含这 3 个字段的记录

验证命令至少包括：

- `node --test test/lib/passportVisaAdminValidation.test.mjs`
- 新增的同步脚本测试

如有现成 API 或 repository 测试覆盖国家记录结构，也应一并运行。

## 实施顺序

1. 先补测试，锁定新字段行为
2. 扩展类型与默认空对象
3. 扩展校验与可能受影响的测试样例
4. 编写并运行一次性同步脚本，回填 `countries.json`
5. 修改后台“地区编辑”表单，加入 3 个 `textarea`
6. 运行测试并抽样检查已回填国家

## 风险与取舍

### 中文名不一致导致个别国家无法自动匹配

处理方式：

- 自动同步时保留空字符串
- 输出未匹配名单
- 由后台手工补录

### 抓取文本较长，后台表单变得更重

处理方式：

- 继续使用 `textarea`
- 不在本轮做折叠、字数统计、自动摘要

### 与现有风险字段语义重叠

说明：

- `riskLevel` 和 `riskNote` 仍服务地图风险分组与简短说明
- `travelRiskSafety` 是完整正文，不替代前两者

## 结论

本次采用“统一国家模型 + 一次性回填抓取结果 + 后台直接编辑纯文本字段”的方案。

这样能以最小改动把三段领事信息并入现有测试后台，保持单一数据源，并为后续前台详情扩展和数据库迁移保留清晰边界。
