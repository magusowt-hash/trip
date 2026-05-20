import mysql from 'mysql2/promise';

async function query(conn: mysql.PoolConnection, sql: string): Promise<any> {
  const [rows] = await conn.execute(sql);
  return rows;
}

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'magus',
    password: '3W.xh.com',
    database: 'trip',
    multipleStatements: false,
  });

  const [dbTables] = await conn.execute('SHOW TABLES');
  const tableNames = (dbTables as any[]).map(r => Object.values(r)[0] as string);

  const expectedTables = [
    'users', 'posts', 'post_images', 'comments', 'favorites', 'comment_likes',
    'friendships', 'uploaded_files', 'plans', 'transport_items', 'admin_keys',
    'markers', 'marker_images', 'map_pois', 'user_map_favorites',
    'user_map_footprints', 'lists', 'list_images', 'list_items',
    'embed_access_logs', 'ratings', 'packing_categories', 'packing_templates',
    'rail_map_settings', 'station_overrides',
    'footprint_groups', 'footprint_group_items',
    'cloud_mounts', 'cloud_sync_logs', 'cloud_assets',
    'alist_config', 'storage_files',
    'user_footprint_settings'
  ];

  const missing = expectedTables.filter(t => !tableNames.includes(t));
  const extra = tableNames.filter(t => !expectedTables.includes(t));

  console.log(`数据库表数量: ${tableNames.length} | 预期表数量: ${expectedTables.length}`);
  console.log('数据库中的表:', tableNames.sort().join(', '));

  if (missing.length) {
    console.log('\n❌ 数据库缺失的表:');
    missing.forEach(t => console.log(`  - ${t}`));
  } else {
    console.log('✅ 所有预期表都存在于数据库中');
  }

  if (extra.length) {
    console.log('\n📋 数据库中未在 schema 定义的表:');
    extra.forEach(t => console.log(`  - ${t}`));
  }

  console.log('\n--- 逐表字段校验 ---');
  const schemaFields: Record<string, string[]> = {
    users: ['id','phone','password_hash','nickname','avatar','gender','birthday','region','favorite_lists','ratings','status','created_at','updated_at'],
    posts: ['id','user_id','title','content','cover_image_url','privacy','topic','comments_cnt','favorites_cnt','status','created_at','updated_at'],
    post_images: ['id','post_id','url','thumbnail_url','caption','sort_order','created_at'],
    comments: ['id','post_id','user_id','content','parent_id','status','created_at'],
    favorites: ['id','post_id','user_id','created_at'],
    comment_likes: ['id','comment_id','user_id','created_at'],
    friendships: ['id','user_id','friend_user_id','status','created_at'],
    uploaded_files: ['id','user_id','url','thumbnail_url','created_at'],
    plans: ['id','user_id','name','status','active_tab','start_date','end_date','created_at','updated_at'],
    transport_items: ['id','plan_id','from','to','note','note_expanded','sort_order','start_date','end_date','created_at'],
    admin_keys: ['id','key_hash','name','is_master','is_active','expires_at','last_used_at','created_at'],
    markers: ['id','name','lng','lat','address','description','cover_image','type','status','created_at','updated_at'],
    marker_images: ['id','marker_id','url','thumbnail_url','caption','sort_order','created_at'],
    map_pois: ['id','amap_poi_id','name','lng','lat','address','city','district','type','source','created_at','updated_at'],
    user_map_favorites: ['id','user_id','poi_id','created_at'],
    user_map_footprints: ['id','user_id','group_id','poi_id','created_at'],
    lists: ['id','name','cover_image','description','position','intro','lng','lat','status','created_at','updated_at'],
    list_images: ['id','list_id','url','thumbnail_url','caption','sort_order','created_at'],
    list_items: ['id','list_id','title','cover_image','description','intro','image_url','lng','lat','address','order_num','status','created_at','updated_at'],
    embed_access_logs: ['id','ip','action','list_id','item_id','user_agent','created_at'],
    ratings: ['id','user_id','target_type','target_id','rating','comment','created_at','updated_at'],
    packing_categories: ['id','name','order_num','status','created_at','updated_at'],
    packing_templates: ['id','category_id','name','order_num','status','created_at','updated_at'],
    rail_map_settings: ['id','local_major_show_zoom','local_major_fade_start','local_show_zoom','local_fade_start','major_show_zoom','major_fade_start','mt_show_zoom','mt_fade_start','route_min_points_z1','route_min_points_z2','line_width_scale','dot_scale_per_zoom','cluster_r_z1','cluster_r_z2','cluster_r_z3','cluster_r_z4','cluster_r_z5','cluster_r_z6','major_cluster_ratio','dedup_z1','dedup_z2','dedup_z3','dedup_z4','dedup_z5','dedup_z6','hub_radius','major_radius','local_major_radius','local_radius','mt_radius','hub_color','major_color','local_major_color','local_color','mt_color','updated_at'],
    station_overrides: ['id','station_name','display_name','level_override','display_level','created_at','updated_at'],
    footprint_groups: ['id','user_id','name','is_default','sort_order','created_at','updated_at'],
    footprint_group_items: ['id','group_id','list_item_id','cloud_folder','cloud_cover','added_at'],
    cloud_mounts: ['id','user_id','footprint_item_id','provider','root_path','status','connection_status','last_connected_at','created_at','updated_at'],
    cloud_sync_logs: ['id','mount_id','status','summary_json','error_message','created_at'],
    cloud_assets: ['id','mount_id','folder_id','folder_name','asset_count','sample_thumbnail_url','status','reason','created_at','updated_at'],
    alist_config: ['id','url','username','password','root_path','enabled','updated_at'],
    storage_files: ['id','user_id','place_title','filename','size','frame_x','frame_y','source_type','source_ref','source_folder','created_at'],
    user_footprint_settings: ['user_id','show_photos','show_lines','show_labels','show_poi_labels','poi_label_color','marker_color','marker_shape','show_title','panel_collapsed','background_color','line_color','line_width','line_dashed'],
  };

  let allMatch = true;
  for (const t of expectedTables) {
    const cols = await query(conn, `DESCRIBE \`${t}\``) as any[];
    const dbFields = cols.map(c => c.Field as string);
    const expected = schemaFields[t] || [];

    if (dbFields.length !== expected.length) {
      console.log(`\n❌ ${t}: 字段数量不匹配 (DB=${dbFields.length}, schema=${expected.length})`);
      allMatch = false;
    }

    const missingFields = expected.filter(f => !dbFields.includes(f));
    const extraFields = dbFields.filter(f => !expected.includes(f));

    if (missingFields.length) {
      console.log(`  DB 缺失字段: ${missingFields.join(', ')}`);
      allMatch = false;
    }
    if (extraFields.length) {
      console.log(`  DB 多余字段: ${extraFields.join(', ')}`);
      allMatch = false;
    }

    if (!missingFields.length && !extraFields.length) {
      console.log(`✅ ${t}: 字段匹配`);
    }
  }

  console.log(`\n${allMatch ? '✅ 所有表字段与 schema 完全匹配' : '❌ 部分表字段存在差异'}`);

  await conn.end();
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});