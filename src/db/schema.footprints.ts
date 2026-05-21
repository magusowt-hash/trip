import { mysqlTable, serial, int, varchar, tinyint, timestamp, uniqueIndex, index } from 'drizzle-orm/mysql-core';

export const footprintGroups = mysqlTable(
  'footprint_groups',
  {
    id: serial('id').primaryKey(),
    userId: int('user_id').notNull(),
    name: varchar('name', { length: 64 }).notNull(),
    isDefault: tinyint('is_default').default(0),
    sortOrder: int('sort_order').default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index('fp_groups_user_id_idx').on(t.userId),
    userDefaultIdx: index('fp_groups_user_default_idx').on(t.userId, t.isDefault),
  }),
);

export const footprintGroupItems = mysqlTable(
  'footprint_group_items',
  {
    id: serial('id').primaryKey(),
    groupId: int('group_id').notNull(),
    listItemId: int('list_item_id').notNull(),
    albumScopeKey: varchar('album_scope_key', { length: 255 }),
    addedAt: timestamp('added_at').notNull().defaultNow(),
  },
  (t) => ({
    groupItemUnique: uniqueIndex('fp_group_items_unique').on(t.groupId, t.listItemId),
    groupIdIdx: index('fp_group_items_group_id_idx').on(t.groupId),
  }),
);
