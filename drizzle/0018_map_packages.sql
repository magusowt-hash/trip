CREATE TABLE `map_packages` (
  `id` serial AUTO_INCREMENT NOT NULL,
  `slug` varchar(64) NOT NULL,
  `name` varchar(128) NOT NULL,
  `description` varchar(255) NOT NULL,
  `is_enabled` tinyint NOT NULL DEFAULT 1,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `map_packages_id` PRIMARY KEY(`id`),
  CONSTRAINT `map_packages_slug_idx` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE INDEX `map_packages_sort_order_idx` ON `map_packages` (`sort_order`);
--> statement-breakpoint
INSERT INTO `map_packages` (`slug`, `name`, `description`, `is_enabled`, `sort_order`)
VALUES
  ('standard', '普通地图', '地点搜索、地图点击识别已有 POI、收藏与已去。', 1, 1),
  ('rail', '中国铁路地图', '站点显示参数、覆盖管理。', 1, 2)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`);
