ALTER TABLE `storage_files`
  ADD COLUMN `pixel_width` int NULL AFTER `size`,
  ADD COLUMN `pixel_height` int NULL AFTER `pixel_width`;
