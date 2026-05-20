import { mysqlTable, serial, int, varchar, text, timestamp, index, uniqueIndex } from 'drizzle-orm/mysql-core';

export const cloudMounts = mysqlTable(
  'cloud_mounts',
  {
    id: serial('id').primaryKey(),
    userId: int('user_id').notNull(),
    footprintItemId: int('footprint_item_id').notNull(),
    provider: varchar('provider', { length: 32 }).notNull().default('alist'),
    rootPath: varchar('root_path', { length: 500 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('mounted'),
    connectionStatus: varchar('connection_status', { length: 32 }).notNull().default('unknown'),
    lastConnectedAt: timestamp('last_connected_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    userItemIdx: index('cloud_mounts_user_item_idx').on(t.userId, t.footprintItemId),
    userUnique: uniqueIndex('cloud_mounts_user_unique').on(t.userId),
    statusIdx: index('cloud_mounts_status_idx').on(t.status, t.connectionStatus),
  }),
);

export const cloudSyncLogs = mysqlTable(
  'cloud_sync_logs',
  {
    id: serial('id').primaryKey(),
    mountId: int('mount_id').notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    summaryJson: text('summary_json'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    mountCreatedIdx: index('cloud_sync_logs_mount_created_idx').on(t.mountId, t.createdAt),
  }),
);

export const cloudAssets = mysqlTable(
  'cloud_assets',
  {
    id: serial('id').primaryKey(),
    mountId: int('mount_id').notNull(),
    folderId: varchar('folder_id', { length: 191 }).notNull(),
    folderName: varchar('folder_name', { length: 255 }).notNull(),
    assetCount: int('asset_count').notNull().default(0),
    sampleThumbnailUrl: text('sample_thumbnail_url'),
    status: varchar('status', { length: 32 }).notNull().default('unbound'),
    reason: varchar('reason', { length: 64 }).notNull().default('no_place_match'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    mountFolderIdx: index('cloud_assets_mount_folder_idx').on(t.mountId, t.folderId),
  }),
);
