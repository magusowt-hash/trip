-- 0008: Zoom 显示精细化 — 6档聚类/去重 + RK/MT渐显 + 线路过滤 + 缩放系数
ALTER TABLE `rail_map_settings`
  ADD COLUMN `major_show_zoom` decimal(2,1) NOT NULL DEFAULT '5.0' AFTER `local_fade_start`,
  ADD COLUMN `major_fade_start` decimal(2,1) NOT NULL DEFAULT '4.0' AFTER `major_show_zoom`,
  ADD COLUMN `mt_show_zoom` decimal(2,1) NOT NULL DEFAULT '11.0' AFTER `major_fade_start`,
  ADD COLUMN `mt_fade_start` decimal(2,1) NOT NULL DEFAULT '10.0' AFTER `mt_show_zoom`,
  ADD COLUMN `route_min_points_z1` int NOT NULL DEFAULT 5 AFTER `mt_fade_start`,
  ADD COLUMN `route_min_points_z2` int NOT NULL DEFAULT 3 AFTER `route_min_points_z1`,
  ADD COLUMN `line_width_scale` decimal(2,1) NOT NULL DEFAULT '0.8' AFTER `route_min_points_z2`,
  ADD COLUMN `dot_scale_per_zoom` decimal(2,2) NOT NULL DEFAULT '0.06' AFTER `line_width_scale`,
  ADD COLUMN `cluster_r_z5` int NOT NULL DEFAULT 8 AFTER `cluster_r_z4`,
  ADD COLUMN `cluster_r_z6` int NOT NULL DEFAULT 4 AFTER `cluster_r_z5`,
  ADD COLUMN `dedup_z5` int NOT NULL DEFAULT 10 AFTER `dedup_z4`,
  ADD COLUMN `dedup_z6` int NOT NULL DEFAULT 6 AFTER `dedup_z5`,
  ADD COLUMN `mt_radius` decimal(2,1) NOT NULL DEFAULT '1.5' AFTER `local_radius`,
  ADD COLUMN `mt_color` varchar(7) NOT NULL DEFAULT '#d1d5db' AFTER `local_color`;

-- 更新已有默认行的 Z1-Z4 默认值到新标准
UPDATE `rail_map_settings`
  SET `cluster_r_z1` = 44, `cluster_r_z2` = 32, `cluster_r_z3` = 22, `cluster_r_z4` = 14,
      `dedup_z1` = 40, `dedup_z2` = 28, `dedup_z3` = 20, `dedup_z4` = 14
  WHERE `id` = 1;
