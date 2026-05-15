import { mysqlTable, int, varchar, tinyint, double } from 'drizzle-orm/mysql-core';

export const userFootprintSettings = mysqlTable('user_footprint_settings', {
  userId: int('user_id').primaryKey(),
  showPhotos: tinyint('show_photos').notNull().default(1),
  showLines: tinyint('show_lines').notNull().default(1),
  showLabels: tinyint('show_labels').notNull().default(1),
  showPoiLabels: tinyint('show_poi_labels').notNull().default(1),
  poiLabelColor: varchar('poi_label_color', { length: 16 }).notNull().default('#000000'),
  markerColor: varchar('marker_color', { length: 16 }).notNull().default('#ef4444'),
  markerShape: varchar('marker_shape', { length: 16 }).notNull().default('pin'),
  showTitle: tinyint('show_title').notNull().default(1),
  panelCollapsed: tinyint('panel_collapsed').notNull().default(0),
  backgroundColor: varchar('background_color', { length: 16 }).notNull().default('#0f172a'),
  lineColor: varchar('line_color', { length: 16 }).notNull().default('#a5b4fc'),
  lineWidth: double('line_width').notNull().default(2),
  lineDashed: tinyint('line_dashed').notNull().default(1),
});
