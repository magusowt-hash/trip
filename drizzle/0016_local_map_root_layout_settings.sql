ALTER TABLE `local_map_roots`
  ADD COLUMN `layout_mode` varchar(32),
  ADD COLUMN `layout_gap_x` int,
  ADD COLUMN `layout_gap_y` int,
  ADD COLUMN `layout_stagger_axis` varchar(32);
