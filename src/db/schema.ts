import { pgTable, serial, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    phone: varchar('phone', { length: 32 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    phoneUnique: uniqueIndex('users_phone_unique').on(t.phone),
  }),
);

