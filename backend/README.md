# Backend (独立文件夹)

本目录用于放置你部署的后端服务代码（独立于前端）。

当前前端在 `src/app/login` / `src/app/register` 中会通过 `NEXT_PUBLIC_API_BASE_URL` 请求以下接口（路径约定）：

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET  /api/auth/me`
- `POST /api/auth/logout`

建议后端对外提供与当前前端一致的响应结构与状态码规则（至少包含 `{ error: string }` 的错误体，成功时返回用户简表）。

