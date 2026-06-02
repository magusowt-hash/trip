ALTER TABLE `local_map_roots`
  ADD COLUMN `group_id` int NULL AFTER `user_id`;
--> statement-breakpoint
INSERT INTO `footprint_groups` (`user_id`, `name`, `is_default`, `sort_order`)
SELECT DISTINCT r.`user_id`, '我的足迹', 1, 0
FROM `local_map_roots` r
LEFT JOIN `footprint_groups` g ON g.`user_id` = r.`user_id`
WHERE g.`id` IS NULL;
--> statement-breakpoint
CREATE TEMPORARY TABLE `tmp_local_map_root_groups` (
  `root_id` bigint unsigned NOT NULL,
  `group_id` int NOT NULL,
  PRIMARY KEY (`root_id`, `group_id`)
);
--> statement-breakpoint
INSERT IGNORE INTO `tmp_local_map_root_groups` (`root_id`, `group_id`)
SELECT DISTINCT r.`id`, fgi.`group_id`
FROM `local_map_roots` r
INNER JOIN `local_map_assets` a ON a.`root_id` = r.`id` AND a.`user_id` = r.`user_id`
INNER JOIN `footprint_group_items` fgi ON fgi.`id` = a.`footprint_item_id`
INNER JOIN `footprint_groups` fg ON fg.`id` = fgi.`group_id` AND fg.`user_id` = r.`user_id`;
--> statement-breakpoint
INSERT IGNORE INTO `tmp_local_map_root_groups` (`root_id`, `group_id`)
SELECT DISTINCT r.`id`, umf.`group_id`
FROM `local_map_roots` r
INNER JOIN `local_map_assets` a ON a.`root_id` = r.`id` AND a.`user_id` = r.`user_id`
INNER JOIN `user_map_footprints` umf ON umf.`id` = a.`footprint_item_id` AND umf.`user_id` = r.`user_id`
INNER JOIN `footprint_groups` fg ON fg.`id` = umf.`group_id` AND fg.`user_id` = r.`user_id`
WHERE umf.`group_id` IS NOT NULL;
--> statement-breakpoint
UPDATE `local_map_roots` r
SET r.`group_id` = (
  SELECT MIN(t.`group_id`)
  FROM `tmp_local_map_root_groups` t
  WHERE t.`root_id` = r.`id`
);
--> statement-breakpoint
UPDATE `local_map_roots` r
SET r.`group_id` = (
  SELECT fg.`id`
  FROM `footprint_groups` fg
  WHERE fg.`user_id` = r.`user_id`
  ORDER BY fg.`is_default` DESC, fg.`sort_order` ASC, fg.`id` ASC
  LIMIT 1
)
WHERE r.`group_id` IS NULL;
--> statement-breakpoint
ALTER TABLE `local_map_roots`
  DROP INDEX `local_map_roots_user_root_unique`;
--> statement-breakpoint
INSERT INTO `local_map_roots` (
  `user_id`,
  `group_id`,
  `root_name`,
  `layout_mode`,
  `layout_gap_x`,
  `layout_gap_y`,
  `layout_stagger_axis`,
  `created_at`,
  `updated_at`
)
SELECT
  r.`user_id`,
  t.`group_id`,
  r.`root_name`,
  r.`layout_mode`,
  r.`layout_gap_x`,
  r.`layout_gap_y`,
  r.`layout_stagger_axis`,
  r.`created_at`,
  r.`updated_at`
FROM `local_map_roots` r
INNER JOIN `tmp_local_map_root_groups` t ON t.`root_id` = r.`id`
WHERE t.`group_id` <> r.`group_id`;
--> statement-breakpoint
INSERT IGNORE INTO `local_map_assets` (
  `user_id`,
  `root_id`,
  `footprint_item_id`,
  `relative_path`,
  `folder_name`,
  `name`,
  `size`,
  `last_modified`,
  `frame_x`,
  `frame_y`,
  `pixel_width`,
  `pixel_height`,
  `created_at`,
  `updated_at`
)
SELECT
  a.`user_id`,
  nr.`id`,
  a.`footprint_item_id`,
  a.`relative_path`,
  a.`folder_name`,
  a.`name`,
  a.`size`,
  a.`last_modified`,
  a.`frame_x`,
  a.`frame_y`,
  a.`pixel_width`,
  a.`pixel_height`,
  a.`created_at`,
  a.`updated_at`
FROM `local_map_assets` a
INNER JOIN `local_map_roots` oldr ON oldr.`id` = a.`root_id`
INNER JOIN `footprint_group_items` fgi ON fgi.`id` = a.`footprint_item_id`
INNER JOIN `footprint_groups` fg ON fg.`id` = fgi.`group_id` AND fg.`user_id` = oldr.`user_id`
INNER JOIN `local_map_roots` nr
  ON nr.`user_id` = oldr.`user_id`
  AND nr.`group_id` = fgi.`group_id`
  AND nr.`root_name` = oldr.`root_name`
WHERE oldr.`group_id` <> fgi.`group_id`;
--> statement-breakpoint
INSERT IGNORE INTO `local_map_assets` (
  `user_id`,
  `root_id`,
  `footprint_item_id`,
  `relative_path`,
  `folder_name`,
  `name`,
  `size`,
  `last_modified`,
  `frame_x`,
  `frame_y`,
  `pixel_width`,
  `pixel_height`,
  `created_at`,
  `updated_at`
)
SELECT
  a.`user_id`,
  nr.`id`,
  a.`footprint_item_id`,
  a.`relative_path`,
  a.`folder_name`,
  a.`name`,
  a.`size`,
  a.`last_modified`,
  a.`frame_x`,
  a.`frame_y`,
  a.`pixel_width`,
  a.`pixel_height`,
  a.`created_at`,
  a.`updated_at`
FROM `local_map_assets` a
INNER JOIN `local_map_roots` oldr ON oldr.`id` = a.`root_id`
INNER JOIN `user_map_footprints` umf ON umf.`id` = a.`footprint_item_id` AND umf.`user_id` = oldr.`user_id`
INNER JOIN `footprint_groups` fg ON fg.`id` = umf.`group_id` AND fg.`user_id` = oldr.`user_id`
INNER JOIN `local_map_roots` nr
  ON nr.`user_id` = oldr.`user_id`
  AND nr.`group_id` = umf.`group_id`
  AND nr.`root_name` = oldr.`root_name`
WHERE umf.`group_id` IS NOT NULL
  AND oldr.`group_id` <> umf.`group_id`;
--> statement-breakpoint
DELETE a
FROM `local_map_assets` a
INNER JOIN `local_map_roots` r ON r.`id` = a.`root_id`
LEFT JOIN `footprint_group_items` fgi
  ON fgi.`id` = a.`footprint_item_id`
  AND fgi.`group_id` = r.`group_id`
LEFT JOIN `user_map_footprints` umf
  ON umf.`id` = a.`footprint_item_id`
  AND umf.`user_id` = r.`user_id`
  AND umf.`group_id` = r.`group_id`
WHERE fgi.`id` IS NULL
  AND umf.`id` IS NULL;
--> statement-breakpoint
DROP TEMPORARY TABLE `tmp_local_map_root_groups`;
--> statement-breakpoint
ALTER TABLE `local_map_roots`
  MODIFY COLUMN `group_id` int NOT NULL,
  ADD UNIQUE INDEX `local_map_roots_user_group_root_unique` (`user_id`, `group_id`, `root_name`);
--> statement-breakpoint
CREATE INDEX `local_map_roots_group_id_idx` ON `local_map_roots` (`group_id`);
