CREATE TABLE `cloud_assets` (
  `id` serial AUTO_INCREMENT NOT NULL,
  `mount_id` int NOT NULL,
  `folder_id` varchar(191) NOT NULL,
  `folder_name` varchar(255) NOT NULL,
  `asset_count` int NOT NULL DEFAULT 0,
  `sample_thumbnail_url` text,
  `status` varchar(32) NOT NULL DEFAULT 'unbound',
  `reason` varchar(64) NOT NULL DEFAULT 'no_place_match',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `cloud_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `cloud_assets_mount_folder_idx` ON `cloud_assets` (`mount_id`,`folder_id`);
