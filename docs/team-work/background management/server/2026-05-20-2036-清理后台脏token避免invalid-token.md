# 2026-05-20-2036 - 清理后台脏 token 避免 invalid token

## 改动范围

- `src/app/management/layout.tsx`

## 改动目标

本次要解决后台登录态失效后，本地残留的 `admin_token` 继续污染请求，导致后台接口持续返回 `Invalid token` 的问题。

## 改动思路

在后台壳层统一的 session 检查逻辑中增加本地 token 清理，只要服务端明确判定未登录或 session 检查异常，就主动移除浏览器中的旧 token，避免后续请求继续带上脏值。

## 改动内容

- 在 `checkSession()` 中，当 `/api/admin/auth/session` 返回未认证时，自动清理 `localStorage.admin_token`。
- 在 session 检查请求异常时，同样自动清理 `localStorage.admin_token`。
- 将退出登录逻辑改为统一复用本地 token 清理函数。
