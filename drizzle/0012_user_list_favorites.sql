CREATE TABLE `user_list_favorites` (
  `id` serial AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `list_item_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `user_list_favorites_id` PRIMARY KEY(`id`),
  CONSTRAINT `user_list_favorites_user_item_unique` UNIQUE(`user_id`,`list_item_id`)
);
--> statement-breakpoint
CREATE INDEX `user_list_favorites_user_id_idx` ON `user_list_favorites` (`user_id`);
--> statement-breakpoint
CREATE INDEX `user_list_favorites_list_item_id_idx` ON `user_list_favorites` (`list_item_id`);
