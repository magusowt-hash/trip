# Trip 项目问题修复设计

## 问题诊断结果

### 诊断发现

| 测试 | 结果 |
|------|------|
| `http://121.5.24.138:3002/api/health` | 404 |
| `http://121.5.24.138:3002/api/posts` | 404 |
| `http://localhost:3000/api/health` | ✅ 正常工作 |
| `localhost:3000/api/upload` | ✅ 正常工作 |
| `http://121.5.24.138:3002/socket.io/` | 400 (服务在线) |

**结论:** 
- 外置后端 HTTP API 未部署
- Socket.io 服务在线但需要正确握手

### 已修复的问题

#### 1. 发帖功能 404 - 已修复 ✅

**文件:** `src/components/post-compose/PostComposeModal.tsx`

**修复内容:**
1. 修改上传路径为相对路径 `/api/upload`
2. 修复空 FormData - 现在正确添加文件

```typescript
// 修复后的代码
const blob = await fetch(img.url).then((r) => r.blob());
const file = new File([blob], img.id, { type: blob.type });
const formData = new FormData();
formData.append('file', file);

const response = await fetch('/api/upload', {
  method: 'POST',
  body: formData,
  credentials: 'include',
});
```

### 2. 聊天功能 (消息发不出去) - 待排查

**现状:** 
- WebSocket 服务在线 (返回 400 而非 404)
- 代码逻辑正确，但可能后端响应格式不匹配

**可能原因:**
1. 后端 `send_message` 事件返回格式与前端期望不符
2. WebSocket 认证问题

**待确认:**
- 后端 Socket.io 的 `send_message` 事件返回什么格式？
- 是否需要查看后端代码来确认事件名和响应格式？

---

## 修复状态

| 问题 | 状态 | 说明 |
|------|------|------|
| 发帖404 | ✅ 已修复 | 空FormData + 错误URL |
| 聊天消息发不出去 | 🔍 待排查 | 需要后端配合确认 |