#!/usr/bin/env python3
"""
Backfill histórico 2024 al CRM desde el export de Gestión Nube (Excel de 4 hojas).

Uso:
  python3 scripts/import_2024.py <ruta_excel>            # DRY RUN (no escribe)
  python3 scripts/import_2024.py <ruta_excel> --ejecutar # carga real

Lee SUPABASE_URL y SUPABASE_SERVICE_KEY (o SUPABASE_KEY) del .env del repo.
Idempotente: ventas por upsert(id); detalle por delete+insert de los sale_id 2024;
clientes insert-only (no pisa los ya existentes).
"""
import os, sys, json, urllib.request, urllib.error, time

def load_env():
    try:
        for line in open(os.path.join(os.path.dirname(__file__), '..', '.env'), encoding='utf-8'):
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except FileNotFoundError:
        pass

load_env()
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_KEY')

if len(sys.argv) < 2:
    print('Falta la ruta del Excel.'); sys.exit(1)
XLSX = sys.argv[1]
EJECUTAR = '--ejecutar' in sys.argv
if not SUPABASE_URL or not SUPABASE_KEY:
    print('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en el .env'); sys.exit(1)

import openpyxl

def norm(s):
    return str(s).strip().upper() if s is not None else ''

def fecha_iso(v):
    # "16-12-2024" -> "2024-12-16"; ignora valores no fecha (ej. 'TOTAL')
    if v is None: return None
    s = str(v).strip()
    parts = s.split('-')
    if len(parts) == 3 and all(p.isdigit() for p in parts):
        d, m, y = parts
        return f'{y}-{m.zfill(2)}-{d.zfill(2)}'
    return None

def num(v):
    try:
        if v is None or v == '': return None
        return float(v)
    except (TypeError, ValueError):
        return None

def to_int(v):
    try:
        if v is None or v == '': return None
        return int(float(v))
    except (TypeError, ValueError):
        return None

# ---------- Supabase REST ----------
def sb(method, path, body=None, headers=None):
    url = SUPABASE_URL + '/rest/v1/' + path
    data = json.dumps(body).encode() if body is not None else None
    h = {'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY,
         'Content-Type': 'application/json'}
    if headers: h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    for attempt in range(1, 6):
        try:
            r = urllib.request.urlopen(req, timeout=60)
            return r.status, r.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode('utf-8', 'replace')
        except Exception as e:
            if attempt < 5:
                time.sleep(2 * attempt); continue
            raise

def sb_upsert(table, rows, on_conflict='id', chunk=1000):
    for i in range(0, len(rows), chunk):
        lote = rows[i:i+chunk]
        st, txt = sb('POST', f'{table}?on_conflict={on_conflict}', lote,
                     {'Prefer': 'resolution=merge-duplicates,return=minimal'})
        if st >= 300:
            raise RuntimeError(f'{table} upsert [{st}]: {txt[:300]}')

def sb_insert(table, rows, chunk=1000):
    for i in range(0, len(rows), chunk):
        lote = rows[i:i+chunk]
        st, txt = sb('POST', table, lote, {'Prefer': 'return=minimal'})
        if st >= 300:
            raise RuntimeError(f'{table} insert [{st}]: {txt[:300]}')

def existing_client_ids():
    ids = set(); offset = 0
    while True:
        st, txt = sb('GET', f'clientes?select=id&limit=1000&offset={offset}')
        if st >= 300: raise RuntimeError(f'clientes GET [{st}]: {txt[:200]}')
        rows = json.loads(txt)
        ids.update(r['id'] for r in rows if r.get('id') is not None)
        if len(rows) < 1000: break
        offset += 1000
    return ids

# ---------- Leer Excel ----------
print(f'Leyendo {XLSX} ...')
wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)

def sheet_rows(name):
    ws = wb[name]; it = ws.iter_rows(values_only=True)
    hdr = [str(h) for h in next(it)]
    return hdr, [dict(zip(hdr, r)) for r in it]

h_cli, cli_rows = sheet_rows('Datos del Cliente')
h_v, v_rows = sheet_rows('Ventas')
h_p, p_rows = sheet_rows('Productos de la Venta')

# Mapa nombre -> client_id  y  ficha de cliente por id
nombre_a_id = {}
cliente_por_id = {}
dup = 0
for c in cli_rows:
    cid = to_int(c.get('ID INTERNO'))
    nom = c.get('Nombre')
    if cid is None or not nom: continue
    key = norm(nom)
    if key in nombre_a_id and nombre_a_id[key] != cid: dup += 1
    nombre_a_id[key] = cid
    cliente_por_id[cid] = {
        'id': cid, 'name': str(nom).strip(),
        'email': (str(c.get('Correo Electrónico')).strip() if c.get('Correo Electrónico') else None),
        'phone': (str(c.get('Teléfono Móvil') or c.get('Teléfono Fijo')).strip() if (c.get('Teléfono Móvil') or c.get('Teléfono Fijo')) else None),
        'city': (str(c.get('Ciudad')).strip() if c.get('Ciudad') else None),
        'province': (str(c.get('Provincia')).strip() if c.get('Provincia') else None),
        'address': (str(c.get('Dirección')).strip() if c.get('Dirección') else None),
    }

# ---------- Ventas ----------
ventas = []
sin_cliente = 0
sale_ids = []
clientes_referidos = set()
for v in v_rows:
    vid = to_int(v.get('Id Venta'))
    ds = fecha_iso(v.get('Fecha Venta'))
    if vid is None or ds is None:      # saltea fila TOTAL y basura
        continue
    cid = nombre_a_id.get(norm(v.get('Cliente')))
    if cid is None: sin_cliente += 1
    else: clientes_referidos.add(cid)
    ficha = cliente_por_id.get(cid, {})
    ventas.append({
        'id': vid,
        'number': (str(to_int(v.get('Número de Venta'))) if to_int(v.get('Número de Venta')) is not None else None),
        'date_sale': ds,
        'total_price': num(v.get('Total')),
        'channel': (str(v.get('Canal')).strip() if v.get('Canal') else None),
        'sale_state': (str(v.get('Estado')).strip() if v.get('Estado') else None),
        'store': (str(v.get('Depósito')).strip() if v.get('Depósito') else None),
        'client_name': (str(v.get('Cliente')).strip() if v.get('Cliente') else None),
        'client_id': cid,
        'client_city': ficha.get('city'),
        'client_province': ficha.get('province'),
        'client_phone': ficha.get('phone'),
        'client_email': ficha.get('email'),
        'items_sold': to_int(v.get('Cantidad Vendida')),
    })
    sale_ids.append(vid)

# Dedup de ventas por id (el Excel puede repetir un Id Venta; el upsert no
# admite el mismo id dos veces en el mismo comando). Nos quedamos con la última.
_vistas = {}
for v in ventas:
    _vistas[v['id']] = v
dup_ventas = len(ventas) - len(_vistas)
ventas = list(_vistas.values())

sale_id_set = set(sale_ids)

# ---------- Detalle ----------
detalles = []
neg = 0
for p in p_rows:
    sid = to_int(p.get('Id Venta'))
    if sid is None or sid not in sale_id_set:
        continue
    neg -= 1
    detalles.append({
        'id': neg,
        'sale_id': sid,
        'product_id': to_int(p.get('Id Producto')),
        'product_name': (str(p.get('Nombre del Producto')).strip() if p.get('Nombre del Producto') else None),
        'size_id': None,
        'size': (str(p.get('Variante')).strip() if p.get('Variante') else None),
        'quantity': to_int(p.get('Cantidad Vendida')),
        'unit_price': num(p.get('Precio')),
        'total': num(p.get('Importe')),
    })

# ---------- Clientes a insertar (solo los referidos y NO existentes) ----------
existentes = existing_client_ids()
clientes_nuevos = [cliente_por_id[cid] for cid in clientes_referidos
                   if cid in cliente_por_id and cid not in existentes]

# ---------- Reporte ----------
print('\n===== RESUMEN =====')
print(f'Clientes en Excel:            {len(cliente_por_id)} (nombres duplicados: {dup})')
print(f'Ventas a cargar:              {len(ventas)} (ids duplicados unificados: {dup_ventas})')
print(f'  - sin client_id (s/match):  {sin_cliente}')
print(f'Clientes referidos por ventas:{len(clientes_referidos)}')
print(f'  - ya existen en el CRM:     {len(clientes_referidos & existentes)}')
print(f'  - NUEVOS a insertar:        {len(clientes_nuevos)}')
print(f'Detalles a cargar:            {len(detalles)}')
if sale_ids:
    print(f'Rango sale_id (id interno):   {min(sale_ids)} .. {max(sale_ids)}')
nums = [int(x["number"]) for x in ventas if x["number"] and x["number"].isdigit()]
if nums:
    print(f'Rango N° de venta:            {min(nums)} .. {max(nums)}')
fechas = sorted(x['date_sale'] for x in ventas)
print(f'Rango fechas:                 {fechas[0]} .. {fechas[-1]}')
# choque con ids ya existentes en ventas?
st, txt = sb('GET', 'ventas?select=id&id=in.(%s)&limit=5' % ','.join(str(s) for s in sale_ids[:200]))
choques = json.loads(txt) if st < 300 else []
print(f'Choques de id (muestra 200):  {len(choques)}')
# galasso presente?
g = [v for v in ventas if v['client_name'] and 'galasso' in v['client_name'].lower()]
print(f'Ventas de GALASSO en el set:  {len(g)} -> {[(x["number"], x["date_sale"], x["client_id"], x["total_price"]) for x in g]}')

if not EJECUTAR:
    print('\n*** DRY RUN: no se escribió nada. Agregá --ejecutar para cargar. ***')
    sys.exit(0)

# ---------- Carga real ----------
print('\n===== EJECUTANDO CARGA =====')
if clientes_nuevos:
    print(f'Insertando {len(clientes_nuevos)} clientes nuevos...')
    sb_insert('clientes', clientes_nuevos, chunk=500)
print(f'Upsert de {len(ventas)} ventas...')
sb_upsert('ventas', ventas, on_conflict='id', chunk=1000)
# detalle: borrar los de estos sale_id y reinsertar
print('Borrando detalle previo de estos sale_id (si hubiera)...')
uniq = list(sale_id_set)
for i in range(0, len(uniq), 200):
    lote = uniq[i:i+200]
    sb('DELETE', 'venta_detalles?sale_id=in.(%s)' % ','.join(str(s) for s in lote),
       None, {'Prefer': 'return=minimal'})
print(f'Insertando {len(detalles)} detalles...')
sb_insert('venta_detalles', detalles, chunk=2000)
print('\n✓ Carga completada.')
