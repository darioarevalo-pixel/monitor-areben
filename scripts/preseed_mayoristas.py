#!/usr/bin/env python3
"""
Pre-marca como MAYORISTA (es_mayorista=true en crmseg) a los clientes mayoristas
de 2024 ya conocidos, para que aparezcan en el CRM Mayorista aunque en 2025
compren por otro canal (Whatsapp, etc.).

Fuente: las ventas 2024 que quedaron con channel_id=10 (las de Tipo=Mayorista
que marcamos en la carga 2024). Toma sus client_id y les pone es_mayorista=true
en el mapa crmseg (KV), SIN pisar cadencia/notas existentes.

Uso:
  python3 scripts/preseed_mayoristas.py            # DRY RUN (no escribe)
  python3 scripts/preseed_mayoristas.py --ejecutar # guarda
"""
import os, sys, json, urllib.request

def load_env():
    for line in open(os.path.join(os.path.dirname(__file__), '..', '.env'), encoding='utf-8'):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

load_env()
U = os.environ['SUPABASE_URL']
K = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ['SUPABASE_KEY']
CRM_TEL_API = 'https://bdi-catalogo.vercel.app/api/ingresos'
STORE = 'bdi'
EJECUTAR = '--ejecutar' in sys.argv

def sb_get(path):
    req = urllib.request.Request(U + '/rest/v1/' + path, headers={'apikey': K, 'Authorization': 'Bearer ' + K})
    return json.load(urllib.request.urlopen(req, timeout=90))

# 1) client_ids mayoristas 2024 (ventas con channel_id=10 antes de 2025)
ids = set()
off = 0
while True:
    rows = sb_get(f'ventas?select=client_id&channel_id=eq.10&date_sale=lt.2025-01-01&client_id=not.is.null&limit=1000&offset={off}')
    ids.update(r['client_id'] for r in rows if r.get('client_id') is not None)
    if len(rows) < 1000:
        break
    off += 1000
print('clientes mayoristas 2024 a marcar:', len(ids))

# 2) crmseg actual
r = urllib.request.Request(f'{CRM_TEL_API}?kind=crmseg&store={STORE}&nc=1', headers={})
d = json.load(urllib.request.urlopen(r, timeout=60))
crmseg = d.get('map') or {}
print('entradas crmseg actuales:', len(crmseg))

# 3) merge es_mayorista=true (sin pisar lo existente)
nuevos = ya = 0
for cid in ids:
    k = str(cid)
    if k not in crmseg:
        crmseg[k] = {'cadencia': '', 'ultimo_contacto': None, 'proximo_manual': None, 'notas': []}
    if crmseg[k].get('es_mayorista'):
        ya += 1
    else:
        crmseg[k]['es_mayorista'] = True
        nuevos += 1
print(f'marcas nuevas: {nuevos} | ya estaban: {ya}')

if not EJECUTAR:
    print('\n*** DRY RUN: no se escribió nada. Agregá --ejecutar para guardar. ***')
    sys.exit(0)

# 4) guardar
body = json.dumps({'map': crmseg}).encode()
req = urllib.request.Request(f'{CRM_TEL_API}?kind=crmseg&store={STORE}',
                             data=body, headers={'Content-Type': 'application/json'}, method='POST')
resp = json.load(urllib.request.urlopen(req, timeout=60))
print('guardado:', resp)
