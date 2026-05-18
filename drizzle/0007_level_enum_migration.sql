-- 修改站级枚举为五级体系
ALTER TABLE `station_overrides` MODIFY COLUMN `level_override` enum('CH','RK','GI','AS','MT','deleted');
ALTER TABLE `station_overrides` MODIFY COLUMN `display_level` enum('CH','RK','GI','AS','MT');
