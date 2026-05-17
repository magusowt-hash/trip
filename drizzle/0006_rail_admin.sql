CREATE TABLE `rail_map_settings` (
  `id` serial AUTO_INCREMENT NOT NULL,
  `local_major_show_zoom` decimal(2,1) NOT NULL DEFAULT 8.0,
  `local_major_fade_start` decimal(2,1) NOT NULL DEFAULT 7.0,
  `local_show_zoom` decimal(2,1) NOT NULL DEFAULT 9.0,
  `local_fade_start` decimal(2,1) NOT NULL DEFAULT 8.0,
  `cluster_r_z1` int NOT NULL DEFAULT 40,
  `cluster_r_z2` int NOT NULL DEFAULT 28,
  `cluster_r_z3` int NOT NULL DEFAULT 18,
  `cluster_r_z4` int NOT NULL DEFAULT 10,
  `major_cluster_ratio` decimal(2,2) NOT NULL DEFAULT 0.70,
  `dedup_z1` int NOT NULL DEFAULT 36,
  `dedup_z2` int NOT NULL DEFAULT 24,
  `dedup_z3` int NOT NULL DEFAULT 16,
  `dedup_z4` int NOT NULL DEFAULT 12,
  `hub_radius` int NOT NULL DEFAULT 5,
  `major_radius` int NOT NULL DEFAULT 4,
  `local_major_radius` decimal(2,1) NOT NULL DEFAULT 2.5,
  `local_radius` int NOT NULL DEFAULT 2,
  `hub_color` varchar(7) NOT NULL DEFAULT '#dc2626',
  `major_color` varchar(7) NOT NULL DEFAULT '#f59e0b',
  `local_major_color` varchar(7) NOT NULL DEFAULT '#10b981',
  `local_color` varchar(7) NOT NULL DEFAULT '#9ca3af',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `rail_map_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `station_overrides` (
  `id` serial AUTO_INCREMENT NOT NULL,
  `station_name` varchar(64) NOT NULL,
  `display_name` varchar(64),
  `level_override` enum('hub','major','local_major','local','deleted'),
  `display_level` enum('hub','major','local_major','local'),
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `station_overrides_id` PRIMARY KEY(`id`),
  CONSTRAINT `station_overrides_name_idx` UNIQUE(`station_name`)
);
