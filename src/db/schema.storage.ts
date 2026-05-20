import { mysqlTable, serial, int, varchar, bigint, timestamp, double, uniqueIndex, index } from 'drizzle-orm/mysql-core';

export const storageFiles = mysqlTable(
  'storage_files',
  {
    id: serial('id').primaryKey(),
    userId: int('user_id').notNull(),
    placeTitle: varchar('place_title', { length: 255 }).notNull(),
    filename: varchar('filename', { length: 500 }).notNull(),
    size: bigint('size', { mode: 'number' }).notNull().default(0),
    frameX: double('frame_x'),
    frameY: double('frame_y'),
    sourceType: varchar('source_type', { length: 32 }).notNull().default('local'),
    sourceRef: varchar('source_ref', { length: 191 }),
    sourceFolder: varchar('source_folder', { length: 500 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userFileUnique: uniqueIndex('sf_user_file_unique').on(t.userId, t.placeTitle, t.filename),
    userPlaceIdx: index('sf_user_place_idx').on(t.userId, t.placeTitle),
    userSourceIdx: index('sf_user_source_idx').on(t.userId, t.sourceType),
    userSourceRefUnique: uniqueIndex('sf_user_source_ref_unique').on(t.userId, t.sourceType, t.sourceRef),
  }),
);
