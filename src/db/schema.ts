import { mysqlTable, serial, varchar, timestamp, uniqueIndex, tinyint, date, text } from 'drizzle-orm/mysql-core';

export const users = mysqlTable(
  'users',
  {
    id: serial('id').primaryKey(),
    phone: varchar('phone', { length: 32 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    nickname: varchar('nickname', { length: 64 }),
    avatar: text('avatar'),
    gender: tinyint('gender').default(0),
    birthday: date('birthday'),
    region: varchar('region', { length: 128 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    phoneUnique: uniqueIndex('users_phone_unique').on(t.phone),
  }),
);

