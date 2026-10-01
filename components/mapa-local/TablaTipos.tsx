'use client'

import { Button, NumberField, Select, TableWrap, TBody, THead, Td, Th, Tr, color, font } from '@/components/ui'
import type { FilaTipo } from '@/lib/mapa-local/core'
import type { Largo, MapaLocal, TipoCfg } from '@/lib/mapa-local/tipos'

/**
 * La cuenta por tipo de prenda (cuántas hay, cuántas entran) y, para quien edita, la tabla que
 * decide el cupo: el largo de cada tipo y DOS densidades, la cómoda y la del tope.
 *
 * 🔑 Al lado de cada densidad va lo que da en una barra de 75 cm, porque así se mide en el local
 * («38 blusas en una barra»), ⛔ no por metro.
 */

const BARRA_CM = 75
const enBarra = (porM: number) => Math.floor((BARRA_CM / 100) * porM)
export function TablaTipos({ mapa, filas, editar, onCambiar }: { mapa: MapaLocal; filas: FilaTipo[]; editar: boolean; onCambiar: (tipos: TipoCfg[]) => void }) {
  const cfg = new Map(mapa.tipos.map((t) => [t.tipo, t]))
  const poner = (tipo: string, cambio: Partial<TipoCfg>) => {
    const ya = cfg.get(tipo)
    const nuevo: TipoCfg = { tipo, largo: 'L2', perchasPorM: 16, topePorM: null, cuelga: true, ...ya, ...cambio }
    onCambiar(ya ? mapa.tipos.map((t) => (t.tipo === tipo ? nuevo : t)) : [...mapa.tipos, nuevo])
  }
  return (
    <TableWrap>
        <THead>
          <Tr>
            <Th>Tipo</Th>
            <Th align="right">Prendas</Th>
            <Th align="right">Colección</Th>
            <Th align="right">Sale</Th>
            <Th align="right">En barra</Th>
            <Th align="right">No entran</Th>
            <Th align="right">Sin lugar</Th>
            <Th>Largo</Th>
            <Th align="right">Cómodo /m</Th>
            <Th align="right">Tope /m</Th>
            <Th>Se cuelga</Th>
          </Tr>
        </THead>
        <TBody>
          {filas.map((f) => {
            const c = cfg.get(f.tipo)
            return (
              <Tr key={f.tipo}>
                <Td>
                  <b>{f.tipo}</b>
                  {!f.configurado && <div style={{ fontSize: font.xs, color: color.warningInk }}>no está en la tabla</div>}
                </Td>
                <Td align="right">{f.total}</Td>
                <Td align="right">{f.nc}</Td>
                <Td align="right">{f.sale}</Td>
                <Td align="right">{f.cuelga ? f.ubicadas : '—'}</Td>
                <Td align="right" style={{ color: f.noEntran ? color.dangerInk : undefined, fontWeight: f.noEntran ? 700 : undefined }}>{f.cuelga ? f.noEntran : '—'}</Td>
                <Td align="right" style={{ color: f.sinLugar ? color.warningInk : undefined, fontWeight: f.sinLugar ? 700 : undefined }}>{f.cuelga ? f.sinLugar : '—'}</Td>
                <Td>
                  {editar ? (
                    <Select value={c?.largo ?? 'L2'} onChange={(e) => poner(f.tipo, { largo: e.target.value as Largo })}>
                      <option value="L1">Corta</option>
                      <option value="L2">Media</option>
                      <option value="L3">Larga</option>
                    </Select>
                  ) : (
                    { L1: 'Corta', L2: 'Media', L3: 'Larga' }[c?.largo ?? 'L2']
                  )}
                </Td>
                <Td align="right">
                  {editar ? <NumberField value={c?.perchasPorM ?? 16} min={1} max={80} width={72} onChange={(v) => v !== '' && poner(f.tipo, { perchasPorM: v })} /> : (c?.perchasPorM ?? 16)}
                  <div style={{ fontSize: font.xs, color: color.mut }}>{enBarra(c?.perchasPorM ?? 16)} por barra</div>
                </Td>
                <Td align="right">
                  {editar ? (
                    <NumberField value={c?.topePorM ?? ''} min={1} max={150} width={72} placeholder="—" onChange={(v) => poner(f.tipo, { topePorM: v === '' ? null : v })} />
                  ) : (c?.topePorM ?? '—')}
                  <div style={{ fontSize: font.xs, color: c?.topePorM == null ? color.warningInk : color.mut }}>{c?.topePorM == null ? 'sin medir' : `${enBarra(c.topePorM)} por barra`}</div>
                </Td>
                <Td>
                  {editar ? (
                    <Button size="sm" variant="outline" onClick={() => poner(f.tipo, { cuelga: !f.cuelga })}>
                      {f.cuelga ? 'Sí' : 'No'}
                    </Button>
                  ) : f.cuelga ? 'Sí' : 'No'}
                </Td>
              </Tr>
            )
          })}
        </TBody>
    </TableWrap>
  )
}
