# 统一 DTO 方案 - 当前页面与云端资源桥接

## 目标

- 让当前 Footprint 页面不感知底层数据来源差异
- 将 `storage_files` 与 `cloud_assets + bindings + projections` 统一输出为同一种前端数据结构
- 为后续多形态 Footprint 预留稳定接口

## 核心原则

- 前端只消费统一 DTO，不直接知道底层来自本地上传还是云端挂载
- DTO 只暴露页面真正需要的字段
- 云端资源的 provider、同步状态、权限状态通过标准字段表达，不泄漏底层路径模型
- 具体布局字段进入 view projection，不反向污染资源主模型

## 当前页面实际依赖

基于现有 Footprint / OuterFrame 设计，当前页面至少需要：

- 图片唯一标识
- 图片访问 URL
- 缩略图 URL
- 图片所属地点
- 图片尺寸信息
- 图片布局坐标
- 分组归属
- 是否可访问
- 用于排序或展示的时间字段

因此统一 DTO 不应从表结构出发，而应从页面消费需求出发。

## 推荐 DTO 分层

### 1. Asset DTO

表示“单张图片资源”的统一对象。

```ts
type FootprintAssetDto = {
  id: string;
  sourceType: 'local' | 'cloud';
  sourceProvider?: 'alist' | 'webdav' | 'mount';
  ownerUserId: number;

  fileName: string;
  mimeType: string | null;
  size: number | null;
  width: number | null;
  height: number | null;

  originalUrl: string | null;
  thumbnailUrl: string | null;
  previewUrl: string | null;

  accessState: 'ok' | 'expired' | 'forbidden' | 'missing';
  syncState?: 'ready' | 'syncing' | 'error';

  capturedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};
```

说明：

- `id` 是页面唯一主键，不要求等于底层数据库自增 ID
- `sourceType` 用来区分本地上传和云端挂载
- URL 必须是前端可直接消费的受控地址

### 2. Binding DTO

表示“资源和 Footprint 业务语义”的绑定。

```ts
type FootprintBindingDto = {
  bindingId: string;
  assetId: string;
  ownerUserId: number;

  placeTitle: string | null;
  placeId: string | null;
  groupId: string | null;
  groupName: string | null;

  tags: string[];
  visibility: 'private' | 'friends' | 'public';
  isCoverCandidate: boolean;
  bindingSource: 'manual' | 'folder_rule' | 'filename_rule' | 'imported' | 'ai';
  confidence: number | null;
};
```

说明：

- 当前页面最关键的是 `placeTitle`
- 后续如果地点标准化，可逐步强化 `placeId`

### 3. Projection DTO

表示“资源在某一种视图中的投影结果”。

```ts
type FootprintProjectionDto = {
  projectionId: string;
  assetId: string;
  viewType: 'outer_frame' | 'timeline' | 'gallery_wall' | 'cluster_map' | 'story';

  x: number | null;
  y: number | null;
  z: number | null;
  width: number | null;
  height: number | null;
  angle: number | null;

  extra: Record<string, unknown> | null;
};
```

说明：

- 对当前 OuterFrame 来说，`x/y` 就是现有 `frame_x/frame_y` 的统一表示
- 别的视图可以复用该 DTO，只是 `extra` 含义不同

### 4. Page Item DTO

给当前页面用的聚合结果，避免前端自己 join。

```ts
type FootprintPageItemDto = {
  asset: FootprintAssetDto;
  binding: FootprintBindingDto | null;
  projection: FootprintProjectionDto | null;
};
```

说明：

- 当前页面应尽量只消费这一层
- 如果未来页面需要更粗颗粒接口，可继续往上包一层 group DTO

## 当前 OuterFrame 页面建议返回结构

### 方案 A：按照片列表返回

适用于当前画布和相册都需要逐图处理的情况。

```ts
type OuterFramePageResponse = {
  viewType: 'outer_frame';
  userId: number;
  items: FootprintPageItemDto[];
};
```

优点：

- 与当前照片画布思路接近
- 页面实现成本最低

缺点：

- POI 聚合、地点连线关系需要前端自行按 `placeTitle` 再聚合

### 方案 B：按地点聚合返回

更贴近当前连线与地点照片区逻辑。

```ts
type OuterFramePlaceDto = {
  placeTitle: string;
  placeId: string | null;
  groupId: string | null;
  groupName: string | null;

  photoAnchor: {
    x: number | null;
    y: number | null;
  } | null;

  assets: FootprintPageItemDto[];
};

type OuterFrameGroupedResponse = {
  viewType: 'outer_frame';
  userId: number;
  places: OuterFramePlaceDto[];
};
```

优点：

- 与当前 POI 连线模型更一致
- 前端少做一轮地点归并

缺点：

- 单图级别更新时可能仍需保留 item 级能力

## 推荐选择

- 页面内部渲染层可继续使用“逐图数据”
- 对外接口优先返回“按地点聚合”

原因：

- 当前 OuterFrame 的核心不是孤立照片，而是“地点 -> 照片区 -> 连线”
- 如果继续只传平铺照片数组，前端会承担过多业务聚合逻辑

## 本地上传与云端挂载的映射规则

### `storage_files` → DTO

建议映射：

- `storage_files.id` → `asset.id`
- `storage_files.place_title` → `binding.placeTitle`
- `storage_files.frame_x/frame_y` → `projection.x/y`
- 文件访问接口 → `asset.originalUrl / thumbnailUrl / previewUrl`
- 上传时间、尺寸信息 → `asset.createdAt / size / width / height`

说明：

- 这允许当前数据不迁移也能接入统一 DTO 层

### `cloud_assets + bindings + projections` → DTO

建议映射：

- `cloud_assets.id` → `asset.id`
- `footprint_asset_bindings.place_title` → `binding.placeTitle`
- `footprint_view_projections.x/y` → `projection.x/y`
- 文件网关或短签名链接 → `asset.originalUrl / thumbnailUrl / previewUrl`

说明：

- 云端资源不需要伪装成 `storage_files`
- 只要输出同形 DTO 即可与现有页面对接

## DTO 中不应暴露的字段

- 真实挂载绝对路径
- AList 内部 token
- provider 原始授权信息
- 服务端根目录结构
- 未经裁剪的内部错误对象

说明：

- 页面不应知道这些信息
- 这既是安全要求，也是为了后续替换 provider 时不影响前端

## API 建议

### 当前页面短期接口

- `GET /api/footprints/views/outer_frame`

返回：

```ts
type OuterFrameGroupedResponse = {
  viewType: 'outer_frame';
  userId: number;
  places: OuterFramePlaceDto[];
};
```

### 单图更新接口

- `PATCH /api/footprints/views/outer_frame/projection`

请求：

```ts
type UpdateOuterFrameProjectionRequest = {
  assetId: string;
  x: number;
  y: number;
};
```

说明：

- 无论图片来自本地还是云端，拖动后都更新 projection，而不是直接分支更新不同表

### 批量保存接口

- `POST /api/footprints/views/outer_frame/projections/batch`

请求：

```ts
type BatchUpdateOuterFrameProjectionRequest = {
  items: Array<{
    assetId: string;
    x: number;
    y: number;
  }>;
};
```

说明：

- 这与当前“保存修改”按钮的交互更一致

## 兼容期策略

### Phase 1

- 页面仍用现有接口
- 服务端内部新增 DTO 转换函数

### Phase 2

- 新增统一 projection 接口
- 页面逐步切到新 DTO

### Phase 3

- 云端挂载资源接入同一 DTO 管道
- 页面不再关心资源来源

## DTO 构建位置建议

不要放在页面组件内部拼装，建议放在服务端应用层：

- `src/services/footprints/view-dto.ts`
- 或单独的 `src/modules/footprints/dto/`

职责：

- 从不同来源读取数据
- 组装统一 DTO
- 做路径安全处理和 URL 签发
- 屏蔽底层表结构差异

## 风险与注意点

### `placeTitle` 不稳定

- 当前许多聚合逻辑依赖地点标题字符串
- 长期应尽量增加 `placeId`

### URL 失效

- 云端签名链接可能过期
- DTO 层要么返回短期稳定网关地址，要么支持页面失效后刷新

### 双轨数据时的排序一致性

- 本地上传和云端同步的时间字段来源可能不同
- 需要在 DTO 层统一排序优先级

## 推荐决策

- 短期先定义统一 DTO，再谈页面重构
- DTO 优先解决“页面无感知数据来源”
- 当前 OuterFrame 页面建议走“按地点聚合返回 + 单图可更新 projection”的接口模型

## 下一步可继续细化

- `OuterFrameGroupedResponse` 的完整字段表
- `placeTitle` 向 `placeId` 演进的兼容规则
- projection 更新落到现有表和未来表时的写入分发逻辑
