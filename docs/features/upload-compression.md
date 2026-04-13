# 上传压缩功能开发文档

**日期**: 2026-04-13

## 概述

实现前端 + 后端双重图片压缩功能，在省流和保持较好视觉质量之间取得平衡。

## 技术方案

### 架构

```
用户选择文件 → 前端压缩 (browser-image-compression) → 上传 → 后端压缩 (Sharp) → 存储
```

### 技术栈

- `browser-image-compression` ^2.0.2 - 前端图片压缩
- `sharp` - 后端图片压缩

## 实现细节

### 1. 前端压缩 (`src/lib/image-compressor.ts`)

```typescript
const IMAGE_COMPRESSION_OPTIONS = {
  maxWidthOrHeight: 2048,
  useWebWorker: true,
  maxSizeMB: 1,
};
```

- WebP 文件跳过压缩（已是压缩格式）
- 非图片文件跳过压缩
- 使用 Web Worker 保证性能
- 最大尺寸限制 2048px
- 最大文件大小 1MB
- 压缩失败时回退原文件

### 2. 后端压缩 (`src/app/api/upload/route.ts`)

压缩策略:

| 格式 | 质量 | 其他 |
|------|------|------|
| JPEG | quality: 85 | - |
| PNG | quality: 85, compressionLevel: 9 | - |
| WebP | quality: 85 | - |
| GIF | - | 保持原样 |

- 图片尺寸超过 2048px 时等比缩放
- 压缩失败时回退原文件
- 保持原文件扩展名逻辑

### 3. PostComposeModal 集成

在 `doPublish` 函数中，上传图片前调用 `compressImage` 进行前端压缩。

## 文件变更

| 操作 | 文件 |
|------|------|
| 新增 | `src/lib/image-compressor.ts` |
| 修改 | `package.json` |
| 修改 | `src/app/api/upload/route.ts` |
| 修改 | `src/components/post-compose/PostComposeModal.tsx` |

## 测试验证

- 构建检查通过 (npm run build)
- 开发服务器运行正常 (npm run dev)
- 图片上传压缩功能正常工作

## 相关文档

- 设计 spec: `docs/superpowers/specs/2026-04-13-upload-compression-design.md`
- 实现 plan: `docs/superpowers/plans/2026-04-13-upload-compression-plan.md`
