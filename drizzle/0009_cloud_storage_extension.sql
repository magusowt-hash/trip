ALTER TABLE `storage_files`
  ADD COLUMN `source_type` varchar(32) NOT NULL DEFAULT 'local' AFTER `frame_y`,
  ADD COLUMN `source_ref` varchar(191) AFTER `source_type`,
  ADD COLUMN `source_folder` varchar(500) AFTER `source_ref`;

CREATE INDEX `sf_user_source_idx` ON `storage_files` (`user_id`, `source_type`);
CREATE UNIQUE INDEX `sf_user_source_ref_unique` ON `storage_files` (`user_id`, `source_type`, `source_ref`);
