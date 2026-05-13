import { mysqlTable, serial, varchar, tinyint, timestamp } from 'drizzle-orm/mysql-core';

export const alistConfig = mysqlTable(
  'alist_config',
  {
    id: serial('id').primaryKey(),
    url: varchar('url', { length: 255 }).notNull(),
    username: varchar('username', { length: 64 }).notNull(),
    password: varchar('password', { length: 128 }).notNull(),
    rootPath: varchar('root_path', { length: 255 }).default('/'),
    enabled: tinyint('enabled').default(0),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
);
