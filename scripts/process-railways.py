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
    railway_type = props.get('railway', '')
    
    # 高铁
    if high_speed == 'yes' or props.get('maxspeed', '') in ('250','300','350'):
        return '#e53e3e', 3, '高铁'
    # 干线
    if usage == 'main':
        return '#3182ce', 2.5, '干线'
    # 支线
    if usage == 'branch':
        return '#38a169', 1.8, '支线'
    # 其他
    if service in ('spur','yard','siding','crossover'):
        return '#a0aec0', 0.8, '侧线'
    return '#718096', 1.5, '普速'

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
        
        simplified = simplify_dp(chain, tolerance=0.003)
        if len(simplified) < 2:
            continue
        
        compact = [[round(c[0],4), round(c[1],4)] for c in simplified]
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
    color, width, cat = classify_railway(props)
    if cat == '侧线':
        continue
    
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

stations = []
for feat in sdata['features']:
    geom = feat.get('geometry')
    if not geom or geom['type'] != 'Point':
        continue
    lng, lat = geom['coordinates']
    gcj = wgs84_to_gcj02(lng, lat)
    props = feat.get('properties', {})
    stations.append({
        'name': props.get('name', ''),
        'lng': gcj[0],
        'lat': gcj[1],
        'name:en': props.get('name:en', ''),
    })

print(f"Stations: {len(stations)}")

with open(STATION_OUT, 'w') as f:
    json.dump(stations, f, ensure_ascii=False)
print(f"Written: {STATION_OUT}")

import os
r_size = os.path.getsize(RAIL_OUT) / 1024
s_size = os.path.getsize(STATION_OUT) / 1024
print(f"\nOutput sizes: railways={r_size:.0f}KB, stations={s_size:.0f}KB")
