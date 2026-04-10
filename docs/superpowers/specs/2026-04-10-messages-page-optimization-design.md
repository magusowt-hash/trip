# 消息页面优化设计

**Date:** 2026-04-10  
**Status:** Approved

## 一、问题分析

1. **消息列表为空** - getRecentChats API 调用正常，但后端 SQL 查询逻辑问题导致返回空数据
2. **通知 tab 空** - 尚未实现通知功能
3. **UI 问题** - 有"私信"标题和 tab 分割线需要删除

---

## 二、前端改动

### 2.1 修复消息列表不显示
- 添加加载状态（loading spinner）
- 添加错误处理和重试机制
- 调试 API 返回数据格式

### 2.2 UI 优化
- 删除消息列表顶部的"私信"文字标题
- 删除 tab 下方的分割线（border-bottom）
- 简化 tab 样式

### 2.3 合并通知功能
- 移除"通知"tab（删除 tab 切换 UI）
- 新增 getNotices API 调用获取通知数据
- 将通知数据与消息列表合并，统一渲染
- 通知使用"通知消息"作为名称，头像使用系统图标
- 通知项使用特殊样式（如浅黄色背景或图标标记）

---

## 三、后端改动

### 3.1 优化 getRecentChats SQL
```sql
-- 优化：使用子查询获取每个对话的最新一条消息
SELECT 
  other_user_id as userId,
  u.nickname,
  u.avatar,
  m.content as lastMessage,
  m.created_at,
  (SELECT COUNT(*) FROM messages WHERE sender_id = other_user_id AND receiver_id = :userId AND is_read = 0) as unreadCount
FROM (
  SELECT 
    CASE WHEN sender_id = :userId THEN receiver_id ELSE sender_id END as other_user_id,
    MAX(id) as last_msg_id
  FROM messages
  WHERE sender_id = :userId OR receiver_id = :userId
  GROUP BY other_user_id
) sub
JOIN messages m ON m.id = sub.last_msg_id
LEFT JOIN users u ON u.id = sub.other_user_id
ORDER BY m.created_at DESC
```

### 3.2 新增通知 API
- 在 message 模块新增 getNotices 接口
- 使用 message 表，sender_id = 0 表示系统通知
- 返回字段：id, content, createdAt, type（通知类型）

### 3.3 优化存储
- 消息表增加索引：(sender_id, receiver_id, created_at)
- 可选：超过30天的已读消息归档或删除（后续迭代）

---

## 四、数据流

```
前端页面加载
    ↓
并行请求: getUserProfile + getFriends + getRecentChats + getNotices
    ↓
数据合并:
  - 消息列表: recentChats.map
  - 通知列表: notices.map + 标记 type = 'system'
  - 按时间排序混合
    ↓
渲染统一列表
```