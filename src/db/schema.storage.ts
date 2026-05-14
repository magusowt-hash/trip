import { mysqlTable, serial, int, varchar, bigint, timestamp, index } from 'drizzle-orm/mysql-core';

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
    userIdx: index('sf_user_idx').on(t.userId),
  }),
);
