# 站点分级体系

## 五级分类

| 代码 | 名称 | 含义 | 当前数量 |
|------|------|------|----------|
| CH | 核心枢纽 | 省会/直辖市主站，同城 ≥5 站 | 96 |
| RK | 区域重点 | 大城市多站群 / 省会次站 | 1,359 |
| GI | 一般客运 | 中等城市站群 | 1,587 |
| AS | 辅助站 | 小城市站群 | 238 |
| MT | 待定 | 单站（时刻表数据后调整） | 71 |

## 分级依据

### 维度一：同城站点密度（当前）

数据源：12306 官方 `station_name.js`，统计每个城市/地区的客运站数量。

规则：
```
CH: 站名匹配省会名 + 同城 ≥5 站
RK: 同城 ≥15 站 或 省会次站(同城 ≥3)
GI: 同城 ≥5 站
AS: 同城 ≥2 站
MT: 同城 1 站
```

### 维度二：手动配置（优先）

`public/data/promoted_stations.json` 可覆盖任意级别，当前配置：

| 站名 | 级别 | 原因 |
|------|------|------|
| 大理 | RK | 旅游重镇、滇西枢纽 |
| 上饶 | RK | 沪昆/合福十字交叉 |
| 丽江 | RK | 旅游终点站 |
| 敦煌 | RK | 旅游终点站 |
| 婺源 | GI | 旅游站 |
| 阳朔 | GI | 旅游站 |
| 凤凰 | GI | 旅游站 |
| 稻城 | GI | 旅游站 |
| 香格里拉 | GI | 旅游站 |

### 维度三：时刻表车次密度（规划中）

抓取脚本 `scripts/fetch_schedule.py` 已就绪，接口链路验证通过。突破反爬后可按经停车次数自动重新分级。

## 数据流程

```
station_name.js (12306官方, 3365站)
    ↓ 白名单匹配
OSM china-stations.geojson (17,382 原始点)
    ↓ 过滤 + GCJ-02转换 + 分级
stations.json (3,351站, 5字段)
    ↓ 前端加载
RailCanvas 渲染
```

## 站点数据字段

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 站名（去"站"字） |
| lng | float | GCJ-02 经度 |
| lat | float | GCJ-02 纬度 |
| level | string | CH/RK/GI/AS/MT |

## 维护脚本

| 脚本 | 用途 |
|------|------|
| `scripts/process-railways.py` | 生成 stations.json + railways.json |
| `scripts/fetch_schedule.py` | 抓取 12306 时刻表（分步） |
| `scripts/station_name.js` | 12306 官方站点列表 |

## 数据库迁移

`drizzle/0007_level_enum_migration.sql`：将 `station_overrides` 表枚举改为五级。
