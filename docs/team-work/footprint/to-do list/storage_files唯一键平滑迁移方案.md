# storage_files 唯一键平滑迁移方案

## 目标

- 为 `storage_files` 从“仅本地上传模型”过渡到“本地上传 + 云端同步共存模型”提供平滑迁移路径
- 避免第一阶段直接重构现有图片主表导致风险过高
- 保证当前 Footprint 展示仍然只依赖一套正式图片真相源

## 当前现状

`storage_files` 当前唯一键为：

- `(user_id, place_title, filename)`

对应 schema：

- `sf_user_file_unique`

## 当前唯一键的问题

这个唯一键对“本地上传到某地点”是可理解的，但在接入云端同步后会暴露出 3 类问题。

### 1. 地点不是稳定主键

`place_title` 会变化：

- 用户重命名地点
- 目录重新匹配到别的地点
- 同一张图从“未匹配”变成“已匹配”

因此把 `place_title` 放进唯一键，会让资源幂等依赖业务结果，而不是依赖资源本身。

### 2. 文件名不是稳定主键

云端目录中经常出现同名图片：

- `IMG_0001.jpg`
- `封面.jpg`
- `1.jpg`

同一用户不同地点下也可能反复出现相同文件名。

### 3. 云端幂等应依赖来源引用

对云端图来说，更稳定的唯一锚点应是：

- 来源路径
- 或 provider 文件 ID

而不是：

- 地点名 + 文件名

## 迁移原则

### 原则 1

第一阶段不直接删除旧唯一键，避免影响现有本地上传逻辑。

### 原则 2

为云端记录新增独立唯一锚点，让新逻辑先可落地。

### 原则 3

过渡期允许“旧唯一键 + 新唯一键”并存，但实现层必须明确优先级。

### 原则 4

只有在代码路径全部切换完成后，才考虑废除旧唯一键。

## 推荐最终方向

对 `storage_files`，长期更合理的资源唯一性应分来源处理：

### 本地上传

可继续允许基于：

- 用户
- 地点
- 文件名

的弱唯一逻辑存在

### 云端同步

应基于：

- `user_id`
- `source_type`
- `source_ref`

建立稳定唯一性

## 第一阶段推荐方案

## Phase 1：双唯一策略并存

第一阶段保留旧唯一键：

- `sf_user_file_unique (user_id, place_title, filename)`

同时新增新唯一键：

```sql
CREATE UNIQUE INDEX sf_user_source_ref_unique
ON storage_files (user_id, source_type, source_ref);
```

并新增字段：

```sql
ALTER TABLE storage_files
  ADD COLUMN source_type varchar(16) NOT NULL DEFAULT 'local',
  ADD COLUMN source_ref varchar(1024) NULL,
  ADD COLUMN source_folder varchar(255) NULL;
```

## 为什么这一步可行

### 对旧数据安全

旧本地数据：

- `source_type = 'local'`
- `source_ref = NULL`

MySQL 唯一索引允许多个 `NULL`，因此不会因为新增唯一键而冲突。

### 对新云端数据可收敛

新云端数据要求：

- `source_type = 'cloud'`
- `source_ref != NULL`

这样可稳定通过 `source_ref` 做 upsert。

## 实现层优先级

### 本地上传逻辑

继续按原逻辑工作：

- 主要依赖旧唯一键

### 云端同步逻辑

必须改为优先按以下条件找记录：

- `user_id`
- `source_type = 'cloud'`
- `source_ref`

而不能按：

- `place_title + filename`

## 云端同步推荐 upsert 逻辑

伪逻辑：

```ts
1. 计算 sourceRef
2. 先查 storage_files where user_id=? and source_type='cloud' and source_ref=?
3. 若存在：
   - update place_title / filename / size / source_folder
4. 若不存在：
   - insert 新记录
```

说明：

- `place_title` 在这里是可变业务属性
- `source_ref` 才是资源锚点

## 过渡期风险

## 风险 1：旧唯一键仍可能拦住云端插入

场景：

- 某用户已有本地图片：
  - `place_title = 故宫`
  - `filename = IMG_0001.jpg`
- 云端同步又来一张：
  - `place_title = 故宫`
  - `filename = IMG_0001.jpg`

此时即使 `source_ref` 不同，旧唯一键仍可能报冲突。

## 解决方案

第一阶段必须在实现层做一层保护。

### 方案 A：云端写入时调整 `filename`

例如落库时将云端 `filename` 规范化为：

- 原文件名
- 或加稳定后缀

如：

- `IMG_0001.jpg`
- `IMG_0001__cloud.jpg`

或：

- `IMG_0001__a1b2c3.jpg`

优点：

- 最快规避旧唯一键冲突

缺点：

- `filename` 不再等于原始文件名

### 方案 B：插入前先做冲突检查，必要时重命名保存名

逻辑：

1. 按 `source_ref` 查是否已有云端记录
2. 若没有，再检查 `(user_id, place_title, filename)` 是否会撞现有记录
3. 若会撞，生成一个“展示仍可接受”的安全文件名

推荐示例：

- `IMG_0001 [cloud].jpg`
- `IMG_0001 [cloud-2].jpg`

优点：

- 不会直接炸库
- 对现有逻辑侵入较小

缺点：

- 需要一层命名策略

### 方案 C：第一阶段就废除旧唯一键

不推荐。

原因：

- 风险最大
- 会影响当前本地上传逻辑
- 需要全面审查现有 API/业务代码

## 推荐选择

第一阶段推荐：

- 保留旧唯一键
- 新增 `source_ref` 唯一键
- 云端同步实现层增加冲突规避命名策略

也就是：

- 数据库先稳
- 行为先可控
- 等后续验证完成，再考虑废除旧唯一键

## 推荐命名策略

### 新增一个“存储文件名”和“展示文件名”会不会更合理？

从设计上讲更合理，但第一阶段会扩大改动面。

因此第一阶段建议不再拆字段，而是：

- 继续把 `filename` 当展示与存储复用字段
- 对云端冲突场景做安全改写

### 推荐改写规则

若发生旧唯一键冲突：

- 保留扩展名前主体
- 追加稳定云端标识

示例：

- `IMG_0001.jpg` -> `IMG_0001 [cloud].jpg`
- 再冲突 -> `IMG_0001 [cloud-2].jpg`

更稳的做法：

- `IMG_0001 [c_a1b2].jpg`

说明：

- 后缀可来自 `source_ref` 哈希短串
- 稳定且可重复计算

## Phase 2：代码切换完成后的收敛

当以下条件都满足后，再考虑改库：

1. 本地上传逻辑已不再依赖旧唯一键报错行为
2. 云端同步稳定运行一段时间
3. 已验证 `source_ref` 对云端资源足够稳定

此时可评估：

- 删除旧唯一键 `sf_user_file_unique`
- 将 `(user_id, place_title, filename)` 降为普通索引

## Phase 3：长期理想状态

长期如果要彻底正规化，理想结构应是：

- `resource identity` 由来源字段定义
- `place_title` 纯属业务属性
- `filename` 纯属展示属性

但第一阶段不需要一步到位。

## 推荐 migration 顺序

### Step 1

增加：

- `source_type`
- `source_ref`
- `source_folder`

### Step 2

增加：

- `sf_user_source_ref_unique`
- `sf_user_source_idx`

### Step 3

代码上线：

- 本地上传继续旧逻辑
- 云端同步走 `source_ref` 逻辑

### Step 4

观察一段时间后，再评估是否移除旧唯一键

## 第一阶段不建议做的事

- 直接 drop `sf_user_file_unique`
- 为了规避冲突立刻重构现有上传链路
- 让前端同时感知“原始文件名”和“安全存储文件名”两套概念

## 实现前检查项

上线前应确认：

1. 当前是否有 API 通过捕获唯一键冲突来判断“重复上传”
2. 当前页面是否强依赖 `filename` 必须等于真实原始文件名
3. 云端同步是否总能产出稳定 `source_ref`
4. 云端图片重命名后，是否接受它被当成新资源

## 结论

`storage_files` 的平滑迁移最稳方案是：

- 第一阶段保留旧唯一键
- 新增云端专用唯一键 `(user_id, source_type, source_ref)`
- 云端写入通过 `source_ref` 幂等
- 对旧唯一键冲突通过实现层安全重命名兜底

这样既能接入云端，又不会把当前库和现有逻辑一次性推翻。

## 下一步建议

- 基于这份方案补“云端同步写入 `storage_files` 的 upsert 规则示例”
- 或直接开始写 migration SQL / service 实现草案
