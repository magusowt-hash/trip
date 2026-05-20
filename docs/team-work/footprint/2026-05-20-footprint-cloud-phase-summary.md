# Footprint 挂载网盘阶段性完成说明

## 日期

- 2026-05-20

## 本阶段目标

- 基于现有 Footprint 数据库结构，完成“挂载网盘”第一阶段的代码闭环
- 不执行数据库 migration
- 不做联调、运行环境验证、真实数据库推送

## 已完成范围

### 1. 数据结构与 migration

- 已扩展 `storage_files`
  - `source_type`
  - `source_ref`
  - `source_folder`
- 已新增：
  - `cloud_mounts`
  - `cloud_sync_logs`
  - `cloud_assets`
- 已补 migration：
  - `drizzle/0009_cloud_storage_extension.sql`
  - `drizzle/0010_cloud_mounts_and_logs.sql`
  - `drizzle/0011_cloud_assets.sql`

对应文件：

- `src/db/schema.storage.ts`
- `src/db/schema.cloud.ts`
- `src/db/schema.ts`
- `drizzle/meta/_journal.json`

### 2. 用户端挂载网盘闭环

- 足迹项右键菜单已增加 `挂载网盘`
- 已实现挂载网盘弹窗
- 已实现挂载状态查询
- 已实现候选目录查询
- 已实现挂载 / 更换 / 解除挂载
- 已实现同步挂载网盘
- 已实现未匹配目录提示
- 已实现未匹配目录手动绑定到当前足迹项
- 已实现回退已绑定图片，恢复未匹配提示

对应文件：

- `src/components/FootprintGroupPanel.tsx`
- `src/components/FootprintCloudMountModal.tsx`
- `src/components/FootprintCloudMountModal.module.css`
- `src/app/(shell)/user/footprints/page.tsx`
- `src/app/(shell)/user/footprints/footprints.module.css`
- `src/app/api/footprints/cloud/*`
- `src/services/footprint-cloud.ts`

### 3. 管理端挂载网盘提示与操作

- 管理页已支持查看某用户的挂载网盘提示
- 已支持查看：
  - 当前挂载网盘目录
  - 连接状态
  - 未匹配目录数
  - 未匹配目录样例图
- 已支持管理端操作：
  - 重试同步挂载网盘
  - 将未匹配目录绑定到当前足迹项
  - 回退已绑定图片

对应文件：

- `src/app/management/footprints/page.tsx`
- `src/app/api/admin/footprints/route.ts`

### 4. AList 与展示链路桥接

- 已补按完整路径读取 AList 目录图片能力
- 已补 cloud 图片写入 `storage_files` 记录能力
- 当前页面继续复用原有 `/api/storage/photos` 展示链路
- 云端图片不会单独开新展示接口，先通过 `storage_files` 收敛

对应文件：

- `src/services/alist.ts`
- `src/services/storage.ts`

## 当前生效的业务规则

### 1. 对外语义

- 对外统一展示为 `挂载网盘`

### 2. 实际挂载模型

- 每个用户仅允许存在一条挂载网盘记录
- 该挂载网盘记录只服务一个足迹项
- 挂载网盘本质上对应一个目录

### 3. 替换规则

- 若用户将挂载网盘切换到别的足迹项：
  - 自动清理旧足迹项的挂载数据
  - 删除旧挂载目录导入的 cloud 图片记录
  - 删除旧挂载的同步日志与未匹配提示
  - 将挂载关系切换到新的足迹项

### 4. 同步规则

- 当前只同步“当前挂载网盘目录”
- 不再扫描同用户下多个目录
- 目录名与当前足迹项名精确匹配时：
  - 图片写入 `storage_files`
- 不匹配时：
  - 写入 `cloud_assets`
  - 只做提示，不进入正式展示

### 5. 人工处理规则

- 用户端和管理端都可以：
  - 把未匹配目录绑定到当前足迹项
  - 回退当前挂载网盘已绑定图片，恢复未匹配提示

## 当前已形成的闭环

1. 打开足迹项菜单，进入 `挂载网盘`
2. 选择候选目录并建立挂载关系
3. 手动同步当前挂载网盘
4. 命中地点则进入正式 Footprint 图片展示
5. 未命中则进入未匹配提示
6. 可人工绑定到当前足迹项
7. 可人工回退到未匹配状态

## 本阶段未完成项

### 1. 数据库执行与验证

- 未执行 migration
- 未验证线上/测试库差异
- 未生成 drizzle snapshot

### 2. 联调与运行验证

- 未做真实 AList 联调验证
- 未做页面行为回归验证
- 未跑完整类型检查 / lint 通过确认

### 3. 能力边界

- 当前未匹配资源仍是目录级摘要，不是单图资源管理
- 当前回退是“按当前挂载网盘整批回退”，不是按子目录或单图回退
- 当前没有独立的云端资源视图 DTO 接口
- 当前内部仍保留部分 `rootPath` / `cloudFolder` 命名，属于实现细节，未影响对外语义

## 建议的下一步

### 优先级高

- 执行 migration 前的 schema 差异检查
- 跑一次真实数据库 migration 验证
- 跑一次用户端/管理端手动验证

### 优先级中

- 补完整 lint / tsc 校验
- 补“按子目录粒度回退”而不是整批回退
- 评估是否需要真正独立的 cloud 视图 DTO 输出

## 备注

- 本阶段代码实现严格按“对外展示为挂载网盘，但服务端只支持一个用户级挂载目录”的规则收口。
