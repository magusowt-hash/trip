# API 错误码矩阵与返回规范

## 目标

- 统一第一阶段云端挂载相关 API 的返回结构
- 统一错误码命名和语义
- 让前端能够稳定处理菜单状态、弹窗状态、同步结果和未匹配提示

## 适用接口

- `GET /api/footprints/cloud/mount/status`
- `POST /api/footprints/cloud/mount/connect`
- `POST /api/footprints/cloud/sync`
- `GET /api/footprints/cloud/outer-frame`
- `GET /api/footprints/cloud/hints`
- 对应的 admin 变体接口

## 统一返回结构

### 成功返回

```json
{
  "ok": true,
  "data": {}
}
```

### 失败返回

```json
{
  "ok": false,
  "error": {
    "code": "CLOUD_SYNC_FAILED",
    "message": "网盘同步失败，请稍后重试"
  }
}
```

## 字段规范

### `ok`

- `true` 表示接口已成功完成主要业务动作
- `false` 表示接口失败，前端应进入错误处理

### `data`

- 仅在 `ok=true` 时出现
- 结构由具体接口定义

### `error.code`

- 稳定错误码，前端逻辑判断应优先依赖它

### `error.message`

- 面向用户的简短错误文案

## HTTP 状态码建议

- `200`：读取成功、同步成功、连接成功
- `400`：请求参数非法
- `401`：未登录或登录失效
- `403`：无权限访问
- `404`：足迹项、挂载配置、资源不存在
- `409`：状态冲突，如足迹项已绑定其他网盘
- `422`：业务校验失败
- `500`：服务端内部错误
- `502`：provider 访问异常

## 错误码矩阵

### 通用鉴权

| 错误码 | HTTP | 含义 | 前端处理建议 |
|------|------|------|------|
| `UNAUTHORIZED` | 401 | 用户未登录或会话失效 | 跳登录或提示重新登录 |
| `FORBIDDEN` | 403 | 当前用户无权访问该足迹项或网盘资源 | toast 提示无权限 |
| `ADMIN_FORBIDDEN` | 403 | 管理端权限不足 | 后台提示无权限 |

### 挂载状态

| 错误码 | HTTP | 含义 | 前端处理建议 |
|------|------|------|------|
| `FOOTPRINT_ITEM_NOT_FOUND` | 404 | 足迹项不存在 | 关闭弹窗并提示 |
| `CLOUD_ROOT_NOT_FOUND` | 404 | 绑定的网盘根不存在 | 菜单改为异常态 |
| `CLOUD_ALREADY_MOUNTED` | 409 | 当前足迹项已挂载其他网盘 | 提示先解除旧挂载 |
| `CLOUD_MOUNT_CONFLICT` | 409 | 当前网盘已被其他足迹项占用 | 提示冲突 |
| `CLOUD_NOT_MOUNTED` | 422 | 当前足迹项尚未挂载网盘 | 引导先挂载 |

### 连接与配置

| 错误码 | HTTP | 含义 | 前端处理建议 |
|------|------|------|------|
| `CLOUD_NOT_ENABLED` | 422 | 云端功能未启用 | 弹窗提示不可用 |
| `CLOUD_CONFIG_INVALID` | 422 | 网盘配置不完整或非法 | 提示检查配置 |
| `CLOUD_AUTH_INVALID` | 502 | provider 鉴权失败 | 显示连接异常 |
| `CLOUD_CONNECT_FAILED` | 502 | provider 连接失败 | 显示连接异常，可重试 |

### 同步

| 错误码 | HTTP | 含义 | 前端处理建议 |
|------|------|------|------|
| `CLOUD_SYNC_FAILED` | 502/500 | 同步执行失败 | 结果区提示失败 |
| `CLOUD_SYNC_IN_PROGRESS` | 409 | 当前已在同步中 | 禁止重复点击 |
| `CLOUD_ROOT_LIST_FAILED` | 502 | 获取根目录失败 | 提示连接异常 |
| `CLOUD_FOLDER_SCAN_FAILED` | 502 | 某目录扫描失败 | 返回部分成功摘要或失败 |
| `FOOTPRINT_PLACE_LIST_EMPTY` | 422 | 当前足迹地点列表为空 | 提示无法匹配 |

### 资源与视图

| 错误码 | HTTP | 含义 | 前端处理建议 |
|------|------|------|------|
| `CLOUD_ASSET_NOT_FOUND` | 404 | 云端资源不存在 | 刷新数据 |
| `CLOUD_ASSET_ACCESS_FORBIDDEN` | 403 | 资源不可访问 | 不展示该图片 |
| `CLOUD_ASSET_MISSING` | 410 | 远端文件已缺失 | 过滤展示并提示刷新 |
| `PROJECTION_NOT_FOUND` | 404 | projection 不存在 | 允许前端按首次布局处理 |
| `PROJECTION_UPDATE_FAILED` | 500 | projection 更新失败 | 提示保存失败 |

## 接口级返回建议

### 1. `GET /api/footprints/cloud/mount/status`

成功：

```json
{
  "ok": true,
  "data": {
    "itemId": "12",
    "itemName": "默认足迹",
    "mountState": "mounted",
    "connectionState": "connected",
    "syncState": "idle",
    "unboundFolderCount": 2,
    "unboundAssetCount": 17,
    "lastSyncAt": "2026-05-20T10:00:03.000Z",
    "lastSyncStatus": "success",
    "lastSyncSummary": {
      "importedAssetCount": 184,
      "skippedAssetCount": 36,
      "matchedFolderCount": 8,
      "unboundFolderCount": 2
    }
  }
}
```

失败常见错误码：

- `UNAUTHORIZED`
- `FOOTPRINT_ITEM_NOT_FOUND`
- `CLOUD_ROOT_NOT_FOUND`

### 2. `POST /api/footprints/cloud/mount/connect`

用途：

- 将当前足迹项绑定到指定网盘 root

成功：

```json
{
  "ok": true,
  "data": {
    "itemId": "12",
    "mountState": "mounted",
    "connectionState": "connected"
  }
}
```

失败常见错误码：

- `CLOUD_NOT_ENABLED`
- `CLOUD_ROOT_NOT_FOUND`
- `CLOUD_ALREADY_MOUNTED`
- `CLOUD_MOUNT_CONFLICT`

### 3. `POST /api/footprints/cloud/sync`

成功：

```json
{
  "ok": true,
  "data": {
    "rootId": "root_xxx",
    "scannedFolderCount": 12,
    "importedAssetCount": 184,
    "skippedAssetCount": 36,
    "matchedFolderCount": 8,
    "unboundFolderCount": 2,
    "startedAt": "2026-05-20T10:00:00.000Z",
    "finishedAt": "2026-05-20T10:00:03.000Z"
  }
}
```

失败常见错误码：

- `CLOUD_NOT_MOUNTED`
- `CLOUD_SYNC_IN_PROGRESS`
- `CLOUD_AUTH_INVALID`
- `CLOUD_ROOT_LIST_FAILED`
- `CLOUD_SYNC_FAILED`
- `FOOTPRINT_PLACE_LIST_EMPTY`

### 4. `GET /api/footprints/cloud/outer-frame`

成功：

```json
{
  "ok": true,
  "data": {
    "viewType": "outer_frame",
    "userId": 1,
    "places": []
  }
}
```

失败常见错误码：

- `UNAUTHORIZED`
- `CLOUD_NOT_MOUNTED`

说明：

- 若已挂载但暂无已绑定图片，返回空数组即可，不算错误

### 5. `GET /api/footprints/cloud/hints`

成功：

```json
{
  "ok": true,
  "data": {
    "userId": 1,
    "totalFolders": 2,
    "totalAssets": 17,
    "hints": []
  }
}
```

失败常见错误码：

- `UNAUTHORIZED`
- `CLOUD_NOT_MOUNTED`

## 前端错误处理建议

### 菜单状态

- `mount/status` 失败时，不要直接假设未挂载
- 推荐显示保守异常态，点击后进入弹窗看详情

### 弹窗连接异常

- `CLOUD_AUTH_INVALID`
- `CLOUD_CONNECT_FAILED`
- `CLOUD_ROOT_LIST_FAILED`

这些都应统一归入：

- `已挂载未连接`

### 同步结果区

- `CLOUD_SYNC_IN_PROGRESS`
  - 提示“正在同步，请稍候”
- `FOOTPRINT_PLACE_LIST_EMPTY`
  - 提示“当前足迹地点为空，无法匹配目录”
- `CLOUD_SYNC_FAILED`
  - 提示“同步失败，请稍后重试”

## 推荐返回风格

### 不推荐

- 同一类接口有的直接返回对象，有的返回 `{ success: true }`
- 错误时返回纯字符串

### 推荐

- 全部统一 `ok/data/error`
- 同步摘要和状态摘要字段尽量复用

## Admin 接口补充

管理端接口建议继续沿用相同返回结构，只放宽查询对象：

- `GET /api/admin/footprints/cloud/hints?userId=123`
- `POST /api/admin/footprints/cloud/sync`

错误码可额外增加：

- `TARGET_USER_NOT_FOUND`

## 下一步可继续细化

- 各接口请求参数 schema
- 前端 toast / 面板 / 常驻提示的错误展示文案表
