# 好友搜索功能开发文档

## 功能概述
在消息页面添加好友搜索功能，用户可以搜索其他用户并发送好友请求。

## 前后端改动

### 后端 (trip-backend)

#### 1. 用户搜索 API
- **文件**: `src/user/user.service.ts`
- **新增方法**: `searchUsers(keyword, excludeId)`
- 使用 LIKE 查询搜索昵称和手机号
- 排除当前用户自己

```typescript
async searchUsers(keyword: string, excludeId: number): Promise<{ id: number; nickname: string; avatar: string | null }[]> {
  const users = await this.users.find({
    where: [
      { nickname: Like(`%${keyword}%`) },
      { phone: Like(`%${keyword}%`) },
    ],
    take: 20,
  });
  return users
    .filter((u) => u.id !== excludeId)
    .map((u) => ({
      id: u.id,
      nickname: u.nickname || `用户${u.id}`,
      avatar: u.avatar,
    }));
}
```

- **文件**: `src/user/user.controller.ts`
- **新增路由**: `GET /user/search?keyword=xxx`

#### 2. 好友关系模块
- **新增文件**: `src/friend/friend.entity.ts` - 好友关系表
- **新增文件**: `src/friend/friend.service.ts` - 好友服务
- **新增文件**: `src/friend/friend.controller.ts` - 好友 API
- **新增文件**: `src/friend/friend.module.ts` - 好友模块

#### 3. JWT 认证中间件
- **文件**: `src/main.ts`
- 添加 Express 中间件进行 JWT 验证

```typescript
function jwtAuthMiddleware(req: any, res: any, next: () => void) {
  const path = req.path;
  if (!path.startsWith('/user/') && !path.startsWith('/friend/')) {
    return next();
  }
  
  const token = req.cookies?.trip_auth;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const secret = process.env.AUTH_JWT_SECRET || 'dev-only-auth-jwt-secret-change-me';
    const payload = jwt.verify(token, secret) as any;
    req.user = { sub: String(payload.sub), phone: payload.phone };
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
```

### 前端 (trip-web)

#### 1. API 接口
- **文件**: `src/services/api.ts`
- 新增 `searchUsers` 和 `addFriend` 方法

#### 2. 前端 API 路由
- **新增文件**: `src/app/api/user/search/route.ts` - 搜索用户
- **新增文件**: `src/app/api/friend/add/route.ts` - 添加好友

#### 3. 消息页面
- **文件**: `src/app/(shell)/messages/MessagesClient.tsx`
- 添加好友搜索浮窗 UI
- 搜索输入框 + 放大镜按钮
- 搜索结果列表显示

#### 4. 样式
- **文件**: `src/app/(shell)/messages/messages.module.css`
- 添加浮窗样式、搜索框样式、用户列表样式

## 环境配置

### .env.local
```
NEXT_PUBLIC_API_BASE_URL=http://121.5.24.138:3002
```

注意：需要与后端实际运行端口一致。当前后端运行在 3002 端口。

## 数据库表

### friends 表
```sql
CREATE TABLE friends (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  friend_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_friendship (user_id, friend_id)
);
```

## 问题与解决

### 1. 404 错误
**问题**: 后端搜索接口返回 404  
**原因**: 前端 API 路由路径配置问题  
**解决**: 确认 NEXT_PUBLIC_API_BASE_URL 配置正确

### 2. 401 未授权错误
**问题**: 搜索请求返回 401  
**原因**: 后端 JWT 中间件配置问题  
**解决**: 使用 Express 中间件方式实现 JWT 验证

### 3. 端口冲突
**问题**: 后端启动失败，端口被占用  
**解决**: 使用 3002 端口，或确保端口配置与环境变量一致
