# 中国铁路地图后台管理 — 服务器操作清单

> commit `4f5e3b4`，全部改动在 Next.js 前端，后端无变更。

## 1. 数据库 Migration

```bash
cd /path/to/trip
mysql -u <user> -p <database> < drizzle/0006_rail_admin.sql
```

验证：

```sql
DESC rail_map_settings;
DESC station_overrides;
```

## 2. Nginx 配置更新

在 `location /api {` 之前插入四条规则：

```nginx
location /api/public/rail-settings {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}
location /api/public/station-overrides {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}
location /api/admin/maps {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}
location /api/admin/station-overrides {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}
```

> 完整配置参考 `deploy/nginx/trip.conf.example`（已更新）。

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 3. 前端构建 + 重启

```bash
cd /path/to/trip
git pull
npm run build
pm2 restart trip-web
```

## 4. 验证

```bash
curl -s http://localhost:3001/api/public/rail-settings
# → {"settings":{...}} 或 {"settings":null}

curl -s http://localhost:3001/api/public/station-overrides
# → []
```

浏览器访问 `/management/maps` → 中国铁路地图 → 调整参数保存。
