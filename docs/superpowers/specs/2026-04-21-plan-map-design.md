# 计划页地图组件设计

## 概述

在计划页左侧区域嵌入高德地图，支持显示行程标记点，为未来地图拓展功能奠定基础。

## API Key

- 高德地图 Web JS API Key: `0733c564f9c057d7c34d61bf35655e2a`

## 组件设计

### PlanMap 组件

**文件位置**: `src/components/PlanMap.tsx`

```typescript
export interface MapMarker {
  position: [number, number]; // [经度, 纬度]
  title?: string;
}

export interface PlanMapProps {
  markers?: MapMarker[];
  routes?: any[];
  overlays?: any[];
  onMarkerClick?: (marker: MapMarker) => void;
  onMapLoad?: (map: any) => void;
}
```

**功能**:

1. 加载高德地图 JS API (2.0 版本)
2. 初始化地图容器
3. 根据 markers 自动添加标记点并调整视野
4. 暴露扩展接口：routes、overlays、onMarkerClick、onMapLoad

## 页面集成

### 修改 PlanDraftPanel

**文件**: `src/app/(shell)/plan/page.tsx`

- 引入 PlanMap 组件
- 替换 `.draftBlank` 为 `<PlanMap markers={markers} />`
- 从 transportList 提取位置信息作为 markers

### 样式调整

**文件**: `src/app/(shell)/plan/plan-page.module.css`

- 移除 `.draftBlank` 样式
- 添加 `.mapContainer` 样式，占满左侧区域

## 扩展接口

未来可扩展功能：

| 功能 | 接口 | 说明 |
|------|------|------|
| 路线规划 | `routes` | 传入路线数据，显示出行路线 |
| 自定义覆盖物 | `overlays` | 圆形、多边形等覆盖物 |
| 点击事件 | `onMarkerClick` | 标记点点击回调 |
| 地图加载完成 | `onMapLoad` | 地图加载完成回调，可用于手动操作地图 |

## 实现步骤

1. 创建 PlanMap 组件，封装高德地图加载和初始化
2. 修改 CSS 样式，添加地图容器样式
3. 在 PlanDraftPanel 中集成 PlanMap 组件
4. 从 transportList 提取标记点数据传递给地图
