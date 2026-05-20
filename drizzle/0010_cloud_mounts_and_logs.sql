CREATE TABLE `cloud_mounts` (
  `id` serial AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `footprint_item_id` int NOT NULL,
  `provider` varchar(32) NOT NULL DEFAULT 'alist',
  `root_path` varchar(500) NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'mounted',
  `connection_status` varchar(32) NOT NULL DEFAULT 'unknown',
  `last_connected_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `cloud_mounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `cloud_mounts_user_item_idx` ON `cloud_mounts` (`user_id`,`footprint_item_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `cloud_mounts_user_unique` ON `cloud_mounts` (`user_id`);
--> statement-breakpoint
CREATE INDEX `cloud_mounts_status_idx` ON `cloud_mounts` (`status`,`connection_status`);
--> statement-breakpoint
CREATE TABLE `cloud_sync_logs` (
  `id` serial AUTO_INCREMENT NOT NULL,
  `mount_id` int NOT NULL,
  `status` varchar(32) NOT NULL,
  `summary_json` text,
  `error_message` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `cloud_sync_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `cloud_sync_logs_mount_created_idx` ON `cloud_sync_logs` (`mount_id`,`created_at`);
