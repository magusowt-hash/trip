#!/usr/bin/env python3
"""
从 12306 抓取全量客运时刻表，按经停车次密度重新分级。
用法：
  1. python3 scripts/fetch_schedule.py           # 抓取
  2. python3 scripts/fetch_schedule.py --stats    # 统计
  3. python3 scripts/fetch_schedule.py --classify # 重新分级
"""
import json, os, re, sys, time, urllib.request, ssl, urllib.parse

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIONS_IN = os.path.join(BASE, 'public/data/stations.json')
CACHE_DIR = os.path.join(BASE, 'data/schedule_cache')
STATION_NAME_JS = os.path.join(BASE, 'scripts/station_name.js')
SUMMARY_FILE = os.path.join(CACHE_DIR, 'station_density.json')
TRAIN_LIST_FILE = os.path.join(CACHE_DIR, 'train_list.json')

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Referer': 'https://kyfw.12306.cn/otn/leftTicket/init',
}

def get_json(url, cookie=''):
    req = urllib.request.Request(url, headers=HEADERS)
    if cookie:
        req.add_header('Cookie', cookie)
    resp = urllib.request.urlopen(req, context=SSL_CTX, timeout=15)
    return json.loads(resp.read().decode('utf-8-sig'))

def load_name_to_code():
    with open(STATION_NAME_JS) as f:
        text = f.read()
    m = re.search(r"var station_names ='(.+)'", text, re.DOTALL)
    nc = {}
    if m:
        for e in m.group(1).split('@'):
            p = e.split('|')
            if len(p) >= 3:
                nc[p[1]] = p[2]
    return nc

def query_tickets(from_code, to_code, from_name='', to_name='', date='2026-05-18'):
    fe = urllib.parse.quote(from_name) if from_name else ''
    te = urllib.parse.quote(to_name) if to_name else ''
    cookie = (f'_jc_save_fromDate=2026-05-18; _jc_save_toDate=2026-05-18; '
              f'_jc_save_fromStation={fe}%2c{from_code}; '
              f'_jc_save_toStation={te}%2c{to_code}')
    url = (f'https://kyfw.12306.cn/otn/leftTicket/queryG?'
           f'leftTicketDTO.train_date={date}&'
           f'leftTicketDTO.from_station={from_code}&'
           f'leftTicketDTO.to_station={to_code}&'
           f'purpose_codes=ADULT')
    data = get_json(url, cookie)
    result = data.get('data', {}).get('result', [])
    if not result:
        return []
    trains = []
    for line in result:
        if '|预订|' not in line:
            continue
        parts = line.split('|')
        try:
            idx = parts.index('预订')
            train_no = parts[idx + 1]
            code = parts[idx + 2]
            trains.append({'train_no': train_no, 'code': code})
        except (ValueError, IndexError):
            continue
    return trains

def fetch_train_stops(train_no, date='2026-05-18'):
    url = (f'https://kyfw.12306.cn/otn/queryTrainInfo/query?'
           f'leftTicketDTO.train_no={train_no}&leftTicketDTO.train_date={date}&rand_code=')
    data = get_json(url)
    return data.get('data', {}).get('data', [])

def fetch_all(max_pairs=500, delay=0.5):
    os.makedirs(CACHE_DIR, exist_ok=True)
    nc = load_name_to_code()

    with open(STATIONS_IN) as f:
        stations = json.load(f)['stations']
    ch_stations = [s for s in stations if s['level'] == 'CH']

    pairs = []
    for i, a in enumerate(ch_stations):
        ca = nc.get(a['name'])
        if not ca: continue
        for j, b in enumerate(ch_stations):
            if i == j: continue
            cb = nc.get(b['name'])
            if cb:
                pairs.append((ca, cb, a['name'], b['name']))

    print(f'CH 站对: {len(pairs)}，取 {max_pairs}')
    pairs = pairs[:max_pairs]

    seen_trains = set()
    train_list = []

    for idx, (fc, tc, fn, tn) in enumerate(pairs):
        try:
            result = query_tickets(fc, tc, fn, tn)
            for tr in result:
                if tr['train_no'] not in seen_trains:
                    seen_trains.add(tr['train_no'])
                    train_list.append(tr)
            if idx % 50 == 0:
                print(f'  [{idx}/{len(pairs)}] {fn}->{tn}: {len(result)} 累计 {len(train_list)}')
            time.sleep(delay)
        except Exception as e:
            print(f'  {fn}->{tn} err: {e}')

    with open(TRAIN_LIST_FILE, 'w') as f:
        json.dump(train_list, f, ensure_ascii=False, indent=2)
    print(f'车次: {len(train_list)}')

    station_count = {}
    for i, tr in enumerate(train_list):
        cp = os.path.join(CACHE_DIR, f'{tr["train_no"]}.json')
        if os.path.exists(cp):
            with open(cp) as f:
                stops = json.load(f)
        else:
            try:
                stops = fetch_train_stops(tr['train_no'])
                with open(cp, 'w') as f:
                    json.dump(stops, f, ensure_ascii=False)
                time.sleep(delay)
            except:
                continue

        for stop in stops:
            nm = stop.get('station_name', '')
            if nm:
                station_count[nm] = station_count.get(nm, 0) + 1

        if i % 100 == 0:
            print(f'  [{i}/{len(train_list)}] {len(station_count)} 站')

    density = [{'name': k, 'trains': v} for k, v in station_count.items()]
    density.sort(key=lambda x: -x['trains'])
    with open(SUMMARY_FILE, 'w') as f:
        json.dump(density, f, ensure_ascii=False, indent=2)
    print(f'密度: {SUMMARY_FILE}')
    return density

def classify_by_density():
    if not os.path.exists(SUMMARY_FILE):
        print('先抓取')
        return
    with open(SUMMARY_FILE) as f:
        density = json.load(f)
    with open(STATIONS_IN) as f:
        current = json.load(f)

    tm = {d['name']: d['trains'] for d in density}
    ac = sorted(tm.values(), reverse=True)
    n = len(ac)
    if n < 100: return

    ch_t = ac[max(0, int(n * 0.05))]
    rk_t = ac[max(0, int(n * 0.20))]
    gi_t = ac[max(0, int(n * 0.50))]
    as_t = ac[max(0, int(n * 0.85))]
    print(f'CH>={ch_t} RK>={rk_t} GI>={gi_t} AS>={as_t}')

    lm = {}
    for st in current['stations']:
        t = tm.get(st['name'], 0)
        lm[st['name']] = 'CH' if t >= ch_t else 'RK' if t >= rk_t else 'GI' if t >= gi_t else 'AS' if t >= as_t else 'MT'

    pp = os.path.join(BASE, 'public/data/promoted_stations.json')
    if os.path.exists(pp):
        with open(pp) as f:
            pm = json.load(f)
        for pn, pl in pm.items():
            if pl in ('CH','RK','GI','AS','MT'):
                for st in current['stations']:
                    if st['name'] == pn or pn in st['name']:
                        lm[st['name']] = pl

    changed = 0
    for st in current['stations']:
        nl = lm.get(st['name'])
        if nl and nl != st['level']:
            st['level'] = nl; changed += 1

    with open(STATIONS_IN, 'w') as f:
        json.dump(current, f, ensure_ascii=False)

    fv = {}
    for st in current['stations']: fv[st['level']] = fv.get(st['level'], 0) + 1
    print(f'{changed} changed  CH={fv.get("CH",0)} RK={fv.get("RK",0)} GI={fv.get("GI",0)} AS={fv.get("AS",0)} MT={fv.get("MT",0)}')

if __name__ == '__main__':
    if '--stats' in sys.argv:
        if os.path.exists(SUMMARY_FILE):
            with open(SUMMARY_FILE) as f:
                d = json.load(f)
            print(f'{len(d)} stations  top: {[(x["name"],x["trains"]) for x in d[:5]]}')
    elif '--classify' in sys.argv:
        classify_by_density()
    else:
        fetch_all()
