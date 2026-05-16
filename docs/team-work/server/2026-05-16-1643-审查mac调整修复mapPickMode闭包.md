# 2026-05-16 16:43 - 审查mac调整并修复mapPickMode闭包过期

## 改动范围

| 文件 | 改动 |
|------|------|
| `src/components/PlanMap.tsx` | `mapPickMode` 改用 ref 持有，避免闭包过期 |

## 改动说明

pull 了 mac 成员的提交 `2026-05-16-1639-调整地图页搜索与选点交互`，审查后确认改动方向正确：

- 搜索框从左侧地图上方移到右侧列表顶部，删除城市输入框 ✅
- 搜索结果缩为 8 条，多结果时自动适配地图范围 ✅
- 新增「地图选点」按钮 + 说明弹窗 ✅
- 地图点击 POI 不再进右侧列表，改为地图弹窗卡片内直接收藏/足迹 ✅

### 发现的问题：`mapPickMode` 闭包过期

`map.on('click')` 在 `initMap` 中注册，依赖数组为 `[mapPickMode]`。但 `initMap` 内 `mapInstanceRef.current` 已存在时直接 return，不会重新注册 click handler，导致 `mapPickMode` 始终为初始值 `false`，切换后地图点击无法触发 POI 选取。

### 修复方式

将 `mapPickMode` 同样改为 `useRef` 持有最新值，click handler 内改为 `mapPickModeRef.current` 判断。effect 依赖数组改为 `[]`。

## 验证方式

- search / selection 两个 API 仍正常返回结果
- 前端需在浏览器验证「地图选点」按钮切换后点击地图能否触发逆地理

## 注意事项

- PlanMap 内所有动态回调/状态现在统一使用 ref 持有，避免 stale closure
- 注意 PlanMap `onMapPoiSelect` 现在只在 `mapPickMode` 为 true 时触发
