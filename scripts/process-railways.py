#!/usr/bin/env python3
"""
处理 OSM 铁路 GeoJSON：
1. 过滤 LineString
2. WGS-84 → GCJ-02 坐标转换
3. Douglas-Peucker 精简 (tolerance=0.001 度 ~100m)
4. 按铁路类型着色分类
5. 输出精简 JSON
"""
import json
import math
import sys

# 加载12306官方客运站白名单 + 同城站点密度（从 station_name.js 解析）
import re as _re
with open('scripts/station_name.js', encoding='utf-8') as _f:
    _text = _f.read()
_match = _re.search(r"var station_names ='(.+)'", _text, _re.DOTALL)
WHITELIST = set()
NAME_TO_CITY = {}       # 站名 → 城市名
CITY_STATION_COUNT = {}  # 城市名 → 站点数
MAJOR_CITIES = {
    '北京','上海','广州','深圳','成都','重庆','杭州','武汉','西安','郑州',
    '南京','天津','长沙','福州','厦门','合肥','南昌','沈阳','大连','昆明',
    '贵阳','南宁','海口','乌鲁木齐','拉萨','西宁','兰州','银川','太原',
    '石家庄','济南','青岛','哈尔滨','长春','呼和浩特',
}
if _match:
    for _e in _match.group(1).split('@'):
        _p = _e.split('|')
        if len(_p) >= 2:
            _name = _p[1]
            WHITELIST.add(_name)
            _city = _p[7].strip() if (len(_p) >= 8 and _p[7].strip()) else _name
            NAME_TO_CITY[_name] = _city
            CITY_STATION_COUNT[_city] = CITY_STATION_COUNT.get(_city, 0) + 1
del _re, _f, _text, _match, _e, _p, _name, _city

# ─── GCJ-02 转换 ───────────────────────────────────────────
PI = math.pi
A = 6378245.0
EE = 0.00669342162296594323

def _transform_lat(x, y):
    ret = -100.0 + 2.0*x + 3.0*y + 0.2*y*y + 0.1*x*y + 0.2*math.sqrt(abs(x))
    ret += (20.0*math.sin(6.0*x*PI) + 20.0*math.sin(2.0*x*PI)) * 2.0/3.0
    ret += (20.0*math.sin(y*PI) + 40.0*math.sin(y/3.0*PI)) * 2.0/3.0
    ret += (160.0*math.sin(y/12.0*PI) + 320*math.sin(y*PI/30.0)) * 2.0/3.0
    return ret

def _transform_lng(x, y):
    ret = 300.0 + x + 2.0*y + 0.1*x*x + 0.1*x*y + 0.1*math.sqrt(abs(x))
    ret += (20.0*math.sin(6.0*x*PI) + 20.0*math.sin(2.0*x*PI)) * 2.0/3.0
    ret += (20.0*math.sin(x*PI) + 40.0*math.sin(x/3.0*PI)) * 2.0/3.0
    ret += (150.0*math.sin(x/12.0*PI) + 300.0*math.sin(x/30.0*PI)) * 2.0/3.0
    return ret

def wgs84_to_gcj02(lng, lat):
    dlat = _transform_lat(lng - 105.0, lat - 35.0)
    dlng = _transform_lng(lng - 105.0, lat - 35.0)
    radlat = lat / 180.0 * PI
    magic = math.sin(radlat)
    magic = 1 - EE * magic * magic
    sqrtmagic = math.sqrt(magic)
    dlat = (dlat * 180.0) / ((A * (1 - EE)) / (magic * sqrtmagic) * PI)
    dlng = (dlng * 180.0) / (A / sqrtmagic * math.cos(radlat) * PI)
    return [lng + dlng, lat + dlat]

# ─── Douglas-Peucker 精简 ──────────────────────────────────
def _perpendicular_distance(point, line_start, line_end):
    x, y = point
    x1, y1 = line_start
    x2, y2 = line_end
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.sqrt((x-x1)**2 + (y-y1)**2)
    t = max(0, min(1, ((x-x1)*dx + (y-y1)*dy) / (dx*dx + dy*dy)))
    proj_x = x1 + t*dx
    proj_y = y1 + t*dy
    return math.sqrt((x-proj_x)**2 + (y-proj_y)**2)

def simplify_dp(points, tolerance):
    """Douglas-Peucker simplification."""
    if len(points) <= 2:
        return points[:]
    max_dist = 0
    max_idx = 0
    for i in range(1, len(points)-1):
        d = _perpendicular_distance(points[i], points[0], points[-1])
        if d > max_dist:
            max_dist = d
            max_idx = i
    if max_dist > tolerance:
        left = simplify_dp(points[:max_idx+1], tolerance)
        right = simplify_dp(points[max_idx:], tolerance)
        return left[:-1] + right
    else:
        return [points[0], points[-1]]

# ─── 着色分类 ──────────────────────────────────────────────
def classify_railway(props):
    usage = props.get('usage', '')
    service = props.get('service', '')
    high_speed = props.get('highspeed', '')
    maxspeed = props.get('maxspeed', '')
    traffic = props.get('railway:traffic_mode', '')
    ctcs = props.get('railway:ctcs', '')
    name = props.get('name', '')
    passenger = props.get('passenger_lines', '')
    
    # 排除：非客运线路
    if service:
        return None
    if usage in ('industrial','military','freight','test','tourism'):
        return None
    if traffic == 'freight':
        return None
    
    # 必须有客运证据
    is_passenger = (
        traffic in ('passenger','mixed') or
        bool(passenger) or
        high_speed == 'yes' or
        bool(ctcs) or
        ('铁路' in name) or
        ('高铁' in name) or
        ('城际' in name) or
        ('客专' in name) or
        ('线' in name)
    )
    if not is_passenger:
        return None
    
    # 高速 (350级别)
    if ctcs == '3':
        return '#e53e3e', 2.0, '高速'
    if high_speed == 'yes' and maxspeed in ('300','350','380'):
        return '#e53e3e', 2.0, '高速'
    if '高铁' in name:
        return '#e53e3e', 2.0, '高速'
    
    # 城际 (200-250级别)
    if ctcs == '2':
        return '#f59e0b', 1.6, '城际'
    if high_speed == 'yes' and maxspeed in ('200','250'):
        return '#f59e0b', 1.6, '城际'
    if '城际' in name or '客专' in name:
        return '#d97706', 1.4, '城际'
    if maxspeed in ('200','250'):
        return '#d97706', 1.4, '城际'
    
    # 普速
    return '#059669', 1.2, '普速'

# ─── 端点匹配合并 ──────────────────────────────────────────
def merge_segments(segments):
    """合并共享端点的同类型线段。"""
    from collections import defaultdict
    ep = defaultdict(list)
    for i, seg in enumerate(segments):
        c = seg['coords']
        ep[f"{c[0][0]:.4f},{c[0][1]:.4f}"].append((i, 'start'))
        ep[f"{c[-1][0]:.4f},{c[-1][1]:.4f}"].append((i, 'end'))
    
    visited = [False] * len(segments)
    merged = []
    
    for start_idx in range(len(segments)):
        if visited[start_idx]:
            continue
        
        s = segments[start_idx]
        chain = list(s['coords'])
        cat = s['cat']
        color = s['color']
        width = s['width']
        visited[start_idx] = True
        
        front = f"{chain[0][0]:.4f},{chain[0][1]:.4f}"
        back = f"{chain[-1][0]:.4f},{chain[-1][1]:.4f}"
        
        while True:
            extended = False
            for ni, et in ep.get(front, []):
                if visited[ni] or segments[ni]['cat'] != cat:
                    continue
                nb = segments[ni]['coords']
                if et == 'end':
                    chain = list(reversed(nb[:-1])) + chain
                else:
                    chain = list(reversed(nb[1:])) + chain
                visited[ni] = True
                front = f"{chain[0][0]:.4f},{chain[0][1]:.4f}"
                extended = True
                break
            if extended:
                continue
            for ni, et in ep.get(back, []):
                if visited[ni] or segments[ni]['cat'] != cat:
                    continue
                nb = segments[ni]['coords']
                if et == 'start':
                    chain = chain + nb[1:]
                else:
                    chain = chain + list(reversed(nb[:-1]))
                visited[ni] = True
                back = f"{chain[-1][0]:.4f},{chain[-1][1]:.4f}"
                extended = True
                break
            if not extended:
                break
        
        simplified = simplify_dp(chain, tolerance=0.001)
        if len(simplified) < 2:
            continue
        
        compact = [[round(c[0],5), round(c[1],5)] for c in simplified]
        merged.append({
            'p': compact,
            'c': color,
            'w': width,
            't': cat,
        })
    
    return merged

# ─── 主处理 ────────────────────────────────────────────────
BASE = '/Users/apple/Desktop/codex/trip'
RAIL_IN = f'{BASE}/data/china-railways.geojson'
STATION_IN = f'{BASE}/data/china-stations.geojson'
RAIL_OUT = f'{BASE}/public/data/railways.json'
STATION_OUT = f'{BASE}/public/data/stations.json'

print("Loading railways...")
with open(RAIL_IN) as f:
    data = json.load(f)

print(f"Input features: {len(data['features'])}")

segments = []
type_counts_raw = {}
total_coords_in = 0

for feat in data['features']:
    geom = feat.get('geometry')
    if not geom or geom['type'] != 'LineString':
        continue
    
    coords = geom['coordinates']
    total_coords_in += len(coords)
    
    gcj_coords = [wgs84_to_gcj02(c[0], c[1]) for c in coords]
    if len(gcj_coords) < 2:
        continue
    
    props = feat.get('properties', {})
    result = classify_railway(props)
    if result is None:
        continue
    color, width, cat = result
    
    type_counts_raw[cat] = type_counts_raw.get(cat, 0) + 1
    
    segments.append({
        'coords': gcj_coords,
        'color': color,
        'width': width,
        'cat': cat,
    })

print(f"Segments: {len(segments)}")
print(f"Raw categories: {type_counts_raw}")
print(f"Coords in: {total_coords_in}")

# 合并
print("Merging segments...")
routes = merge_segments(segments)

total_coords_out = sum(len(r['p']) for r in routes)
type_counts = {}
for r in routes:
    type_counts[r['t']] = type_counts.get(r['t'], 0) + 1

print(f"Merged routes: {len(routes)}")
print(f"Categories: {type_counts}")
print(f"Coords: {total_coords_in} → {total_coords_out} ({100*total_coords_out/max(1,total_coords_in):.1f}%)")

# 写入
import os
os.makedirs(os.path.dirname(RAIL_OUT), exist_ok=True)
with open(RAIL_OUT, 'w') as f:
    json.dump(routes, f, ensure_ascii=False)
print(f"Written: {RAIL_OUT}")

# ─── 处理站点 ──────────────────────────────────────────────
print("\nLoading stations...")
with open(STATION_IN) as f:
    sdata = json.load(f)

# 省会名称定位（纯文字，非站点）
CAPITAL_CITIES = {'北京':(116.407,39.904),'上海':(121.474,31.233),'广州':(113.264,23.129),'深圳':(114.058,22.543),'成都':(104.066,30.573),'重庆':(106.551,29.563),'杭州':(120.155,30.274),'武汉':(114.305,30.593),'西安':(108.940,34.347),'郑州':(113.625,34.747),'南京':(118.797,32.061),'天津':(117.201,39.085),'长沙':(112.939,28.228),'福州':(119.296,26.074),'厦门':(118.089,24.480),'合肥':(117.227,31.821),'南昌':(115.858,28.683),'沈阳':(123.432,41.807),'大连':(121.615,38.914),'昆明':(102.833,24.881),'贵阳':(106.630,26.647),'南宁':(108.366,22.817),'海口':(110.199,20.044),'乌鲁木齐':(87.617,43.793),'拉萨':(91.173,29.650),'西宁':(101.778,36.617),'兰州':(103.834,36.061),'银川':(106.231,38.487),'太原':(112.549,37.870),'石家庄':(114.514,38.042),'济南':(117.000,36.670),'青岛':(120.383,36.067),'哈尔滨':(126.535,45.803),'长春':(125.324,43.817),'呼和浩特':(111.749,40.843)}

# 手动升级站（从 JSON 配置文件加载）
import os
PROMOTED = {}
promoted_path = os.path.join(os.path.dirname(RAIL_OUT), 'promoted_stations.json')
try:
    with open(promoted_path, encoding='utf-8') as f:
        PROMOTED = json.load(f)
except:
    pass

# ─── 多维计分体系 ──────────────────────────────────────────
RAIL_HUB_CITIES = {
    '徐州','株洲','柳州','洛阳','宝鸡','怀化','蚌埠','襄阳','鹰潭','衡阳',
    '大同','阜阳','商丘','新乡','向塘','安康','黎塘','山海关',
}
HUB_SUFFIXES = ('东','西','南','北','虹桥','白云','双流','机场','新塘')

def compute_score(name, city, city_count):
    """多维计分，返回 (总分, 级别)"""
    s = 0
    # 维度1: 城市行政等级 0-30
    if city in MAJOR_CITIES:        s += 30
    elif city_count >= 5:           s += 15
    else:                           s += 5
    
    # 维度2: 同城站点密度 0-25（省会 cap=25，地级 cap=15）
    cap = 25 if city in MAJOR_CITIES else 15
    if city_count >= 15:        v = cap
    elif city_count >= 10:      v = min(cap, 20)
    elif city_count >= 6:       v = min(cap, 15)
    elif city_count >= 3:       v = 10
    elif city_count >= 2:       v = 5
    else:                       v = 0
    s += v
    
    # 维度3: 站名枢纽特征 0-25
    clean_nm = name.replace('站','').replace('火车站','').strip()
    if clean_nm == city:            s += 25
    elif any(clean_nm.endswith(sx) and clean_nm[:-len(sx)] == city 
             for sx in HUB_SUFFIXES if len(clean_nm) > len(sx)):
                                    s += 20
    elif city in clean_nm and len(city) >= 2:
                                    s += 15
    
    # 维度4: 铁路枢纽城市 0-10
    if city in RAIL_HUB_CITIES and clean_nm == city:
                                    s += 10
    
    # 维度5: 线路等级 0-15（主干线15/区域干线10/城际5/支线0，预留）
    s += 0
    
    # 判定级别
    if s >= 70:     return s, 'CH'
    elif s >= 55:   return s, 'RK'
    elif s >= 35:   return s, 'GI'
    elif s >= 15:   return s, 'AS'
    else:           return s, 'MT'

def station_classify(name, name_en):
    # promoted 手动配置优先
    for pname, plevel in PROMOTED.items():
        if pname == name or pname in name:
            if plevel in ('CH','RK','GI','AS','MT'):
                return plevel
            if plevel == 'hub': return 'CH'
            if plevel == 'major': return 'RK'
            if plevel == 'local_major': return 'GI'
    
    clean = name.replace('站','').replace('火车站','').strip()
    city = NAME_TO_CITY.get(clean, clean)
    city_count = CITY_STATION_COUNT.get(city, 1)
    _, level = compute_score(name, city, city_count)
    return level

stations = []
for feat in sdata['features']:
    geom = feat.get('geometry')
    if not geom or geom['type'] != 'Point':
        continue
    lng, lat = geom['coordinates']
    gcj = wgs84_to_gcj02(lng, lat)
    props = feat.get('properties', {})
    
    # 排除地铁/轻轨/电车站
    if props.get('subway') == 'yes':
        continue
    if props.get('station') in ('subway','light_rail','tram'):
        continue
    if props.get('railway') in ('halt','tram_stop'):
        continue
    if props.get('disused') == 'yes':
        continue
    
    name = props.get('name', '')
    # 排除货运站关键词
    # 保留中文字符
    import re
    name = re.sub(r'[^\u4e00-\u9fff()0-9]', '', name).strip()
    if not name:
        continue
    
    # 12306 官方白名单精确匹配
    clean_name = name.replace('站','').replace('火车站','').strip()
    if clean_name not in WHITELIST:
        continue
    
    if any(kw in name for kw in ('货','编组','驼峰','车辆段','机务段','折返段')):
        continue
    
    city = NAME_TO_CITY.get(clean_name, clean_name)
    city_count = CITY_STATION_COUNT.get(city, 1)
    score, level = compute_score(name, city, city_count)
    # promoted 覆盖
    for pname, plevel in PROMOTED.items():
        if pname == name or pname in name:
            if plevel in ('CH','RK','GI','AS','MT'):
                level = plevel
                break
    
    stations.append({
        'name': clean_name,
        'lng': round(gcj[0], 5),
        'lat': round(gcj[1], 5),
        'level': level,
        'score': score,
        'dev_index': 1.0,   # 平台发展指数，初始100%
    })

print(f"Stations: {len(stations)}")

# 省会定位文字
capital_labels = [{'name': name, 'lng': wgs84_to_gcj02(lng, lat)[0], 'lat': wgs84_to_gcj02(lng, lat)[1]} 
                  for name, (lng, lat) in CAPITAL_CITIES.items()]

output = {'stations': stations, 'capitals': capital_labels}
with open(STATION_OUT, 'w') as f:
    json.dump(output, f, ensure_ascii=False)
print(f"Written: {STATION_OUT}")

import os
r_size = os.path.getsize(RAIL_OUT) / 1024
s_size = os.path.getsize(STATION_OUT) / 1024
print(f"\nOutput sizes: railways={r_size:.0f}KB, stations={s_size:.0f}KB")

# 生成 WGS-84 版本（从 GCJ-02 反向转换）
print("\nGenerating WGS-84 version...")
def gcj02_to_wgs84(lng, lat):
    w_lng, w_lat = lng, lat
    for _ in range(2):
        g = wgs84_to_gcj02(w_lng, w_lat)
        w_lng += lng - g[0]
        w_lat += lat - g[1]
    return w_lng, w_lat

wgs_routes = []
for r in routes:
    wgs_path = [list(gcj02_to_wgs84(c[0], c[1])) for c in r['p']]
    wgs_routes.append({ 'p': wgs_path, 'c': r['c'], 'w': r['w'], 't': r['t'] })

WGS_OUT = f'{BASE}/public/data/railways-wgs84.json'
with open(WGS_OUT, 'w') as f:
    json.dump(wgs_routes, f, ensure_ascii=False)
wgs_size = os.path.getsize(WGS_OUT) / 1024
print(f"WGS-84 railways: {wgs_size:.0f}KB")
