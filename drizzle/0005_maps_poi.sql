CREATE TABLE `map_pois` (
  `id` serial AUTO_INCREMENT NOT NULL,
  `amap_poi_id` varchar(128),
  `name` varchar(255) NOT NULL,
  `lng` varchar(20) NOT NULL,
  `lat` varchar(20) NOT NULL,
  `address` varchar(500),
  `city` varchar(128),
  `district` varchar(128),
  `type` varchar(255),
  `source` varchar(32) NOT NULL DEFAULT 'amap',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `map_pois_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `map_pois_amap_poi_id_idx` ON `map_pois` (`amap_poi_id`);
--> statement-breakpoint
CREATE INDEX `map_pois_lng_lat_idx` ON `map_pois` (`lng`,`lat`);
--> statement-breakpoint
CREATE TABLE `user_map_favorites` (
  `id` serial AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `poi_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `user_map_favorites_id` PRIMARY KEY(`id`),
  CONSTRAINT `user_map_favorites_user_poi_unique` UNIQUE(`user_id`,`poi_id`)
);
--> statement-breakpoint
CREATE INDEX `user_map_favorites_user_id_idx` ON `user_map_favorites` (`user_id`);
--> statement-breakpoint
CREATE TABLE `user_map_footprints` (
  `id` serial AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `group_id` int,
  `poi_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `user_map_footprints_id` PRIMARY KEY(`id`),
  CONSTRAINT `user_map_footprints_user_poi_unique` UNIQUE(`user_id`,`poi_id`)
);
--> statement-breakpoint
CREATE INDEX `user_map_footprints_user_id_idx` ON `user_map_footprints` (`user_id`);
--> statement-breakpoint
CREATE INDEX `user_map_footprints_group_id_idx` ON `user_map_footprints` (`group_id`);
