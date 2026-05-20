# 地图与 POI

## markers 地标/POI 表

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | SERIAL | NO | 自增 | 主键 |
| name | VARCHAR(255) | NO | - | 地标名称 |
| lng | VARCHAR(20) | YES | NULL | 经度 |
| lat | VARCHAR(20) | YES | NULL | 纬度 |
| address | VARCHAR(500) | YES | NULL | 地址 |
| description | TEXT | YES | NULL | 描述 |
| cover_image | TEXT | YES | NULL | 封面图 URL |
| type | VARCHAR(32) | YES | 'other' | 类型分类 |
| status | TINYINT | YES | 1 | 状态：1=启用，0=禁用 |
| created_at | TIMESTAMP | NO | NOW() | 创建时间 |
| updated_at | TIMESTAMP | NO | NOW() | 更新时间 |

**索引：**
- 无显式索引

**说明：** 地图上的自定义地标/POI 点，可附加封面图和描述。

---

## marker_images 地标图片表

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | SERIAL | NO | 自增 | 主键 |
| marker_id | INT | NO | - | 关联地标 ID（关联 markers.id） |
| url | TEXT | NO | - | 图片 URL |
| thumbnail_url | TEXT | YES | NULL | 缩略图 URL |
| caption | TEXT | YES | NULL | 图片说明 |
| sort_order | INT | YES | 0 | 排序顺序 |
| created_at | TIMESTAMP | NO | NOW() | 创建时间 |

**索引：**
- `marker_images_marker_id_idx`：marker_id

**说明：** 一个地标可有多张图片。

---

## map_pois 地图 POI 表

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | SERIAL | NO | 自增 | 主键 |
| amap_poi_id | VARCHAR(128) | YES | NULL | 高德地图 POI ID |
| name | VARCHAR(255) | NO | - | POI 名称 |
| lng | VARCHAR(20) | NO | - | 经度 |
| lat | VARCHAR(20) | NO | - | 纬度 |
| address | VARCHAR(500) | YES | NULL | 地址 |
| city | VARCHAR(128) | YES | NULL | 城市 |
| district | VARCHAR(128) | YES | NULL | 行政区 |
| type | VARCHAR(255) | YES | NULL | POI 类型 |
| source | VARCHAR(32) | NO | 'amap' | 数据来源 |
| created_at | TIMESTAMP | NO | NOW() | 创建时间 |
| updated_at | TIMESTAMP | NO | NOW() | 更新时间 |

**索引：**
- `map_pois_amap_poi_id_idx`：amap_poi_id
- `map_pois_lng_lat_idx`：lng, lat

**说明：** 存储从高德地图等来源导入的 POI 数据，包含城市和行政区信息。

---

## user_map_favorites 用户地图收藏表

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | SERIAL | NO | 自增 | 主键 |
| user_id | INT | NO | - | 用户 ID（关联 users.id） |
| poi_id | INT | NO | - | POI ID（关联 map_pois.id） |
| created_at | TIMESTAMP | NO | NOW() | 收藏时间 |

**索引：**
- `user_map_favorites_user_poi_unique`（UNIQUE）：user_id, poi_id
- `user_map_favorites_user_id_idx`：user_id

**说明：** 用户收藏的地图 POI 点。

---

## user_map_footprints 用户地图足迹表

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | SERIAL | NO | 自增 | 主键 |
| user_id | INT | NO | - | 用户 ID（关联 users.id） |
| group_id | INT | YES | NULL | 分组 ID |
| poi_id | INT | NO | - | POI ID（关联 map_pois.id） |
| created_at | TIMESTAMP | NO | NOW() | 添加时间 |

**索引：**
- `user_map_footprints_user_poi_unique`（UNIQUE）：user_id, poi_id
- `user_map_footprints_user_id_idx`：user_id
- `user_map_footprints_group_id_idx`：group_id

**说明：** 用户在地图上访问过的地点记录（打卡/足迹）。

---

## footprint_groups 用户足迹分组表

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | SERIAL | NO | 自增 | 主键 |
| user_id | INT | NO | - | 用户 ID（关联 users.id） |
| name | VARCHAR(64) | NO | - | 分组名称 |
| is_default | TINYINT | YES | 0 | 是否默认分组（1=是） |
| sort_order | INT | YES | 0 | 排序顺序 |
| created_at | TIMESTAMP | NO | NOW() | 创建时间 |
| updated_at | TIMESTAMP | NO | NOW() | 更新时间 |

**索引：**
- `fp_groups_user_id_idx`：user_id
- `fp_groups_user_default_idx`：user_id, is_default

**说明：** 用户用于管理足迹的分组成员（如"2024川西行"）。

---

## footprint_group_items 足迹分组项表

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | SERIAL | NO | 自增 | 主键 |
| group_id | INT | NO | - | 分组 ID（关联 footprint_groups.id） |
| list_item_id | INT | NO | - | 榜单项 ID（关联 list_items.id） |
| cloud_folder | VARCHAR(255) | YES | NULL | 云端文件夹路径 |
| cloud_cover | VARCHAR(500) | YES | NULL | 云端封面图 |
| added_at | TIMESTAMP | NO | NOW() | 添加时间 |

**索引：**
- `fp_group_items_unique`（UNIQUE）：group_id, list_item_id
- `fp_group_items_group_id_idx`：group_id

**说明：** 足迹分组中的具体地点项，关联榜单项(list_items)。

---

## storage_files 用户存储文件表

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | SERIAL | NO | 自增 | 主键 |
| user_id | INT | NO | - | 用户 ID（关联 users.id） |
| place_title | VARCHAR(255) | NO | - | 地点标题（存储位置标识） |
| filename | VARCHAR(500) | NO | - | 文件名 |
| size | BIGINT | NO | 0 | 文件大小（字节） |
| frame_x | DOUBLE | YES | NULL | 帧坐标 X |
| frame_y | DOUBLE | YES | NULL | 帧坐标 Y |
| source_type | VARCHAR(32) | NO | 'local' | 来源类型：local, oss, cloud |
| source_ref | VARCHAR(191) | YES | NULL | 来源引用（如 OSS key） |
| source_folder | VARCHAR(500) | YES | NULL | 来源文件夹 |
| created_at | TIMESTAMP | NO | NOW() | 创建时间 |

**索引：**
- `sf_user_file_unique`（UNIQUE）：user_id, place_title, filename
- `sf_user_place_idx`：user_id, place_title
- `sf_user_source_idx`：user_id, source_type
- `sf_user_source_ref_unique`（UNIQUE）：user_id, source_type, source_ref

**说明：** 存储用户上传到各地点的文件（如照片、视频），支持多来源。

---

## uploaded_files 已上传文件表

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | VARCHAR(64) | NO | - | 主键（文件 ID） |
| user_id | INT | NO | - | 上传用户 ID（关联 users.id） |
| url | TEXT | NO | - | 文件访问 URL |
| thumbnail_url | TEXT | YES | NULL | 缩略图 URL |
| created_at | TIMESTAMP | NO | NOW() | 上传时间 |

**索引：**
- 主键：id

**说明：** 通用文件上传记录表，存储用户上传的图片等文件。