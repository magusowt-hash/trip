CREATE TABLE `local_map_roots` (
  `id` serial AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `root_name` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `local_map_roots_id` PRIMARY KEY(`id`),
  CONSTRAINT `local_map_roots_user_root_unique` UNIQUE(`user_id`,`root_name`)
);
--> statement-breakpoint
CREATE INDEX `local_map_roots_user_id_idx` ON `local_map_roots` (`user_id`);
--> statement-breakpoint
CREATE TABLE `local_map_assets` (
  `id` serial AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `root_id` int NOT NULL,
  `footprint_item_id` int NOT NULL,
  `relative_path` varchar(500) NOT NULL,
  `folder_name` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `size` int NOT NULL DEFAULT 0,
  `last_modified` bigint NOT NULL DEFAULT 0,
  `frame_x` double,
  `frame_y` double,
  `pixel_width` int,
  `pixel_height` int,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `local_map_assets_id` PRIMARY KEY(`id`),
  CONSTRAINT `local_map_assets_root_path_unique` UNIQUE(`root_id`,`relative_path`)
);
--> statement-breakpoint
CREATE INDEX `local_map_assets_user_item_idx` ON `local_map_assets` (`user_id`,`footprint_item_id`);
--> statement-breakpoint
CREATE INDEX `local_map_assets_root_id_idx` ON `local_map_assets` (`root_id`);
