# 0010_footprint_album_scope 迁移待办

## 目标

- 跟踪 `drizzle/0010_footprint_album_scope.sql` 的数据库落地状态
- 确保 `footprint_group_items.album_scope_key` 的新增与历史数据回填真正执行
- 为“共享相册”能力提供数据库层前置条件

## 对应文件

- [0010_footprint_album_scope.sql](/Users/apple/Desktop/codex/trip/drizzle/0010_footprint_album_scope.sql)

## 当前待办

- 确认本地数据库是否已执行该 migration
- 确认测试环境是否已执行该 migration
- 确认 `footprint_group_items` 表中 `album_scope_key` 是否已成功回填
- 确认共享相册相关接口与前端联调是否基于该字段稳定工作

## 完成后处理

- 本事项完成后，从 `to-do list/` 迁入 `done list/`
