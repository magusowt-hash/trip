ALTER TABLE `user_map_footprints`
  DROP INDEX `user_map_footprints_user_poi_unique`,
  ADD UNIQUE INDEX `user_map_footprints_user_group_poi_unique` (`user_id`, `group_id`, `poi_id`);
