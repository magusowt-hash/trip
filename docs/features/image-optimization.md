# 图片优化功能开发文档

**日期**: 2026-04-13

## 概述

实现图片优化功能，包括缩略图生成、图片数量第一时间获取、缩略图组不等待加载。

## 实现细节

### 1. 后端缩略图生成 (`src/app/api/upload/route.ts`)

- 上传时生成 200x200 缩略图
- 缩略图命名格式: `{id}_thumb.{ext}`
- 返回 `thumbnailUrl` 字段

```typescript
const THUMBNAIL_SIZE = 200;

async function createThumbnail(inputBuffer: Buffer, mimeType: string): Promise<Buffer> {
  let transformer = sharp(inputBuffer);
  transformer = transformer.resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
    fit: 'cover',
    position: 'center',
  });
  // 输出质量 75
}
```

### 2. 数据结构变更

- `UploadedFile` 增加 `thumbnailUrl` 字段
- `ImageRecord` 增加 `thumbnailUrl` 字段
- `PostRecord` 增加 `imagesCount` 字段
- `FeedPostDTO` 增加 `imagesCount` 字段
- `DetailImageDTO` 增加 `thumbnailUrl` 字段
- `UploadResponse` 增加 `thumbnailUrl` 字段

### 3. 前端缩略图使用

- `PostCard`: 获取详情时同时获取缩略图
- `PostDetailModal`: 缩略图轨使用独立 `thumbnails` 数据
- `MediaColumnTranslateX`: 缩略图轨使用 `thumbnails` prop，`loading="lazy"`

### 4. 移除占位图

- 删除 `createLocalGallery` 函数
- `sanitizeGalleryImages` 无有效图片时返回空数组
- `FALLBACK_IMAGE` 使用纯白背景

## 文件变更

| 文件 | 变更 |
|------|------|
| `src/app/api/upload/route.ts` | 生成缩略图 |
| `src/lib/shared-data.ts` | 数据结构新增字段 |
| `src/types/post.ts` | DTO 新增字段 |
| `src/app/api/posts/route.ts` | 返回缩略图和图片数量 |
| `src/app/api/posts/[id]/route.ts` | 返回缩略图 |
| `src/app/api/users/[userId]/posts/route.ts` | 返回缩略图和图片数量 |
| `src/components/post-compose/PostComposeModal.tsx` | ImageItem 类型添加 thumbnailUrl |
| `src/modules/post/PostCard.tsx` | 获取并传递缩略图 |
| `src/modules/post/PostDetailModal/index.tsx` | 处理缩略图数据 |
| `src/modules/post/PostDetailModal/components/MediaColumnTranslateX.tsx` | 使用缩略图 |
| `src/modules/post/PostDetailModal/types.ts` | Props 新增 thumbnails |
| `src/modules/post/PostDetailModal/utils/galleryUtils.ts` | 移除占位图生成 |

## 相关文档

- 设计 spec: `docs/superpowers/specs/2026-04-13-upload-compression-design.md`
- 上传压缩 plan: `docs/superpowers/plans/2026-04-13-upload-compression-plan.md`
