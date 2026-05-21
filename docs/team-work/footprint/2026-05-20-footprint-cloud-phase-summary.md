# Footprint 挂载网盘阶段性完成说明

## 状态

- 本文档仅保留为 2026-05-20 这轮挂载网盘实现的阶段记录。
- 自 2026-05-21 起，该方案已被判定为不继续推进，相关代码已从当前主代码路径中移除。

## 当前说明

- 文中涉及的用户端挂载弹窗、管理端挂载提示、`/api/footprints/cloud/*`、`src/services/footprint-cloud.ts`、`src/db/schema.cloud.ts` 均已不再作为当前实现生效。
- 文中涉及的数据库扩展与 migration 历史文件仍在仓库，用于回溯本轮方案；后续数据库清理与回退动作统一记录在：
  - `docs/team-work/footprint/to-do list/挂载网盘移除后的数据库待办.md`

## 使用方式

- 不再将本文档视为当前方案说明。
- 当前模块真相以 `docs/team-work/footprint/status.md` 为准。
