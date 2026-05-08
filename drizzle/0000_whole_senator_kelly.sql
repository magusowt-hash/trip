CREATE TABLE `admin_keys` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`key_hash` varchar(255) NOT NULL,
	`name` varchar(64) NOT NULL,
	`is_master` tinyint DEFAULT 0,
	`is_active` tinyint DEFAULT 1,
	`expires_at` timestamp,
	`last_used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_keys_key_hash_idx` UNIQUE(`key_hash`)
);
--> statement-breakpoint
CREATE TABLE `comment_likes` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`comment_id` int NOT NULL,
	`user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `comment_likes_id` PRIMARY KEY(`id`),
	CONSTRAINT `comment_likes_comment_user_unique` UNIQUE(`comment_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`post_id` int NOT NULL,
	`user_id` int NOT NULL,
	`content` text NOT NULL,
	`parent_id` int,
	`status` varchar(16) DEFAULT 'normal',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `embed_access_logs` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`ip` varchar(45) NOT NULL,
	`action` varchar(32) NOT NULL,
	`list_id` int,
	`item_id` int,
	`user_agent` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `embed_access_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `favorites` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`post_id` int NOT NULL,
	`user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `favorites_id` PRIMARY KEY(`id`),
	CONSTRAINT `favorites_post_user_unique` UNIQUE(`post_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `friendships` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`friend_user_id` int NOT NULL,
	`status` varchar(16) DEFAULT 'pending',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `friendships_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `list_images` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`list_id` int NOT NULL,
	`url` text NOT NULL,
	`thumbnail_url` text,
	`caption` text,
	`sort_order` int DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `list_images_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `list_items` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`list_id` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`cover_image` text,
	`description` text,
	`intro` text,
	`image_url` text,
	`lng` varchar(20),
	`lat` varchar(20),
	`address` varchar(500),
	`transport_plane` varchar(500),
	`transport_train` varchar(500),
	`transport_bus` varchar(500),
	`rating_type` varchar(16) DEFAULT 'system',
	`custom_rating` varchar(100),
	`order_num` int DEFAULT 0,
	`status` tinyint DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `list_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lists` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`cover_image` text,
	`description` text,
	`position` int,
	`intro` text,
	`lng` varchar(20),
	`lat` varchar(20),
	`status` tinyint DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `marker_images` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`marker_id` int NOT NULL,
	`url` text NOT NULL,
	`thumbnail_url` text,
	`caption` text,
	`sort_order` int DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `marker_images_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `markers` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`lng` varchar(20),
	`lat` varchar(20),
	`address` varchar(500),
	`description` text,
	`cover_image` text,
	`type` varchar(32) DEFAULT 'other',
	`status` tinyint DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `markers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `packing_categories` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`order_num` int DEFAULT 0,
	`status` tinyint DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `packing_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `packing_templates` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`category_id` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`order_num` int DEFAULT 0,
	`status` tinyint DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `packing_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`status` varchar(16) DEFAULT 'active',
	`active_tab` int DEFAULT 0,
	`start_date` date,
	`end_date` date,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `plans_user_id_idx` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `post_images` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`post_id` int NOT NULL,
	`url` text NOT NULL,
	`thumbnail_url` text,
	`caption` text,
	`sort_order` int DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `post_images_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`title` varchar(120) NOT NULL,
	`content` text,
	`cover_image_url` text,
	`privacy` varchar(16) DEFAULT 'public',
	`topic` varchar(64),
	`comments_cnt` int DEFAULT 0,
	`favorites_cnt` int DEFAULT 0,
	`status` varchar(16) DEFAULT 'normal',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rating_aggregates` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`target_type` varchar(32) NOT NULL,
	`target_id` int NOT NULL,
	`average_rating` varchar(10) DEFAULT '0',
	`rating_count` int DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `rating_aggregates_id` PRIMARY KEY(`id`),
	CONSTRAINT `rating_aggregates_target_unique` UNIQUE(`target_type`,`target_id`)
);
--> statement-breakpoint
CREATE TABLE `ratings` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`target_type` varchar(32) NOT NULL,
	`target_id` int NOT NULL,
	`rating` tinyint NOT NULL,
	`comment` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ratings_id` PRIMARY KEY(`id`),
	CONSTRAINT `ratings_user_target_unique` UNIQUE(`user_id`,`target_type`,`target_id`)
);
--> statement-breakpoint
CREATE TABLE `transport_items` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`plan_id` int NOT NULL,
	`from` varchar(255),
	`to` varchar(255),
	`note` text,
	`note_expanded` tinyint DEFAULT 0,
	`sort_order` int DEFAULT 0,
	`start_date` date,
	`end_date` date,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transport_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `transport_items_plan_id_idx` UNIQUE(`plan_id`,`sort_order`)
);
--> statement-breakpoint
CREATE TABLE `uploaded_files` (
	`id` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`url` text NOT NULL,
	`thumbnail_url` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `uploaded_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`phone` varchar(32) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`nickname` varchar(64),
	`avatar` text,
	`gender` tinyint DEFAULT 0,
	`birthday` date,
	`region` varchar(128),
	`favorite_lists` json,
	`visited_places` json,
	`ratings` json,
	`status` varchar(16) DEFAULT 'normal',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `list_images_list_id_idx` ON `list_images` (`list_id`);--> statement-breakpoint
CREATE INDEX `marker_images_marker_id_idx` ON `marker_images` (`marker_id`);--> statement-breakpoint
CREATE INDEX `category_idx` ON `packing_templates` (`category_id`);