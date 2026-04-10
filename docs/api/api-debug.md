# 开发问题排查与解决 Skill

## 使用场景
当前端与后端 API 通信失败时，使用此 Skill 进行排查。

## 排查步骤

### 1. 检查服务状态
```bash
# 查看端口监听
netstat -tlnp | grep -E "3000|3001|3002"

# 查看运行中的进程
ps aux | grep -E "next|nest" | grep -v grep
```

### 2. 检查前端配置
- 确认 `.env.local` 中 `NEXT_PUBLIC_API_BASE_URL` 正确
- 确认前端 API 路由文件存在

### 3. 测试后端 API
```bash
# 健康检查
curl http://121.5.24.138:3002/api/health

# 带 cookie 测试认证接口
curl "http://121.5.24.138:3002/api/user/search?keyword=test" \
  -H "Cookie: trip_auth=<token>"
```

### 4. 检查后端日志
- 启动后端时查看控制台输出
- 检查错误信息

### 5. 常见问题与解决

| 问题 | 原因 | 解决 |
|------|------|------|
| 404 | 后端服务未启动 | 启动后端服务 |
| 401 | JWT 认证失败 | 检查 token 有效性 |
| 连接被拒绝 | 端口配置错误 | 确认端口一致 |
| 500 | 代码错误 | 查看后端日志 |

## 关键配置

### .env.local
```
NEXT_PUBLIC_API_BASE_URL=http://121.5.24.138:3002
```

### 端口说明
- 3000: 旧前端端口 (可能)
- 3001: 开发前端端口
- 3002: 后端服务端口

## 快速重启

### 后端
```bash
cd /root/trip/trip-backend
pkill -f "node dist/main.js"
npm run build
node dist/main.js
```

### 前端
```bash
cd /root/trip
pkill -f "next dev"
npm run dev
```

## 验证清单

- [ ] `curl http://<IP>:3002/api/health` 返回正常
- [ ] 前端 `npm run build` 成功
- [ ] 后端 `npm run build` 成功
- [ ] 登录后可正常调用搜索 API
