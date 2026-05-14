import { mysqlTable, serial, int, varchar, bigint, timestamp, uniqueIndex, index } from 'drizzle-orm/mysql-core';

export const storageFiles = mysqlTable(
  'storage_files',
  {
    id: serial('id').primaryKey(),
    userId: int('user_id').notNull(),
    placeTitle: varchar('place_title', { length: 255 }).notNull(),
    filename: varchar('filename', { length: 500 }).notNull(),
    size: bigint('size', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userFileUnique: uniqueIndex('sf_user_file_unique').on(t.userId, t.placeTitle, t.filename),
    userPlaceIdx: index('sf_user_place_idx').on(t.userId, t.placeTitle),
  }),
);
