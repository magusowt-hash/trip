# Footprint Layout Performance Design

## Goal
在保持当前重叠控制效果的前提下，缩短 footprints 排布“准备阶段”的计算时间，避免在高密度数据下出现长时间卡顿。

## Problem
当前主要耗时来自 `src/components/footprintLayoutSolver.ts` 中新增的 `improveCorridorRisk()`：
- 对全部 groups 做多轮扫描
- 每个 group 扫描几乎完整 candidate 池
- 每次 candidate 评估都重建全局 geometry，并重复执行硬冲突、corridor risk、envelope 计算

这使得后置优化阶段的复杂度被放大，真实页面中 group 数量和高密扇区越多，准备时间越容易失控。

## Preferred Approach
把“避免挤入危险走廊”前移到前两个阶段，而不是依赖重型全局收敛：

1. 候选池分层与剪枝
- 生成候选时保留基础安全候选
- 对高密扇区只保留少量定向外扩候选
- 让候选顺序更早偏向远离拥堵、避免同走廊堆积的位置

2. 初始分配前置拥堵意识
- 组排序不只按半径/面积，还要优先放置“高密扇区且候选可选面窄”的组
- 候选评分强化 sector crowding / corridor pressure，使坏布局更早被拒绝

3. 缩小后置兜底范围
- `improveCorridorRisk()` 不再处理所有组和所有候选
- 仅在已有 corridor risk 时触发
- 仅处理参与风险最多的一小部分组
- 每组只看 candidate 池前几名
- 若整轮没有收益立即停止

## Success Criteria
- 现有 corridor risk 回归测试继续通过
- 现有 spacing / solver / heuristics 测试继续通过
- 求解器逻辑上从“全量后置修正”转为“前置避免 + 轻量兜底”
- 为后续真实页面埋点或进一步 profiling 保留清晰入口
