ALTER TABLE `footprint_group_items`
  ADD COLUMN `album_scope_key` varchar(255) NULL AFTER `list_item_id`;

UPDATE `footprint_group_items`
SET `album_scope_key` = CONCAT('fpgi_', `id`)
WHERE `album_scope_key` IS NULL;
