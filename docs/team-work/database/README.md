# 数据库结构文档

本文档根据 `src/db/schema.ts` 及相关分片文件生成，描述所有数据表的字段、类型、索引和用途。

## 目录

| 编号 | 文档 | 包含表 |
|------|------|--------|
| 01 | [用户与认证](./01-用户与认证.md) | users, admin_keys, user_footprint_settings |
| 02 | [帖子与互动](./02-帖子与互动.md) | posts, post_images, comments, favorites, comment_likes, ratings |
| 03 | [地图与POI](./03-地图与POI.md) | markers, marker_images, map_pois, user_map_favorites, user_map_footprints, footprint_groups, footprint_group_items, storage_files, uploaded_files |
| 04 | [榜单与评分](./04-榜单与评分.md) | lists, list_images, list_items |
| 05 | [行程计划](./05-行程计划.md) | plans, transport_items |
| 06 | [社交关系](./06-社交关系.md) | friendships |
| 07 | [云端同步与存储](./07-云端同步与存储.md) | cloud_mounts, cloud_sync_logs, cloud_assets, alist_config, packing_categories, packing_templates |
| 08 | [铁路地图](./08-铁路地图.md) | rail_map_settings, station_overrides |
| 09 | [系统与日志](./09-系统与日志.md) | embed_access_logs |

## 表总览

| 表名 | 主键 | 主要外键 | 用途 |
|------|------|----------|------|
| users | id | - | 用户基本信息 |
| admin_keys | id | - | 后台管理员密钥 |
| user_footprint_settings | user_id | user_id | 足迹地图显示设置 |
| posts | id | user_id | 帖子主表 |
| post_images | id | post_id | 帖子图片 |
| comments | id | post_id, user_id | 评论/回复 |
| favorites | id | post_id, user_id | 帖子收藏/点赞 |
| comment_likes | id | comment_id, user_id | 评论点赞 |
| ratings | id | user_id | 通用评分 |
| markers | id | - | 自定义地标 POI |
| marker_images | id | marker_id | 地标图片 |
| map_pois | id | - | 地图 POI 数据 |
| user_map_favorites | id | user_id, poi_id | 用户 POI 收藏 |
| user_map_footprints | id | user_id, poi_id | 用户打卡足迹 |
| footprint_groups | id | user_id | 足迹分组 |
| footprint_group_items | id | group_id, list_item_id | 足迹分组中的地点 |
| storage_files | id | user_id | 用户存储文件记录，足迹相册按 `footprint_group_items.id` 作用域隔离 |
| uploaded_files | id | user_id | 上传文件记录 |
| lists | id | - | 榜单主表 |
| list_images | id | list_id | 榜单图片 |
| list_items | id | list_id | 榜单项 |
| plans | id | user_id | 行程计划 |
| transport_items | id | plan_id | 交通项 |
| friendships | id | user_id, friend_user_id | 好友关系 |
| cloud_mounts | id | user_id, footprint_item_id | 云端挂载 |
| cloud_sync_logs | id | mount_id | 同步日志 |
| cloud_assets | id | mount_id | 云端资源 |
| alist_config | id | - | Alist 配置 |
| packing_categories | id | - | 行李分类 |
| packing_templates | id | category_id | 行李物品模板 |
| rail_map_settings | id | - | 铁路地图全局配置 |
| station_overrides | id | - | 站点覆盖配置 |
| embed_access_logs | id | list_id, item_id | 嵌入页访问日志 |

## 关联图

```
users
├── posts (1:N)
│   ├── post_images (1:N)
│   ├── comments (1:N)
│   │   └── comment_likes (1:N)
│   └── favorites (1:N)
├── ratings (1:N)
├── friendships (1:N) → users
├── plans (1:N)
│   └── transport_items (1:N)
├── uploaded_files (1:N)
├── storage_files (1:N)
├── footprint_groups (1:N)
│   └── footprint_group_items (1:N)
│       └── cloud_mounts (1:N)
│           ├── cloud_sync_logs (1:N)
│           └── cloud_assets (1:N)
├── user_map_favorites (1:N)
├── user_map_footprints (1:N)
└── user_footprint_settings (1:1)

lists
├── list_images (1:N)
└── list_items (1:N)

markers
└── marker_images (1:N)

map_pois
├── user_map_favorites (1:N)
└── user_map_footprints (1:N)
```
