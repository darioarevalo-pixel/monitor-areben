'use client'

import { useMemo, useState } from 'react'
import type { Producto } from '@/lib/etl/tipos'
import { fechaCorta } from '@/lib/productos'
import { cartelDeTanda, relojesDeTanda } from '@/lib/ganadores/cartel'
import { rankingDeTanda, tandasDe, UMBRAL_MIN_POR_MODELO, type FilaGanador } from '@/lib/ganadores/tipos'
import { imagenDe, type IndiceTn } from '@/lib/tn'
import {
  Badge,
  Barra,
  EmptyState,
  FilterBar,
  Notice,
  Select,
  TBody,
  THead,
  TableWrap,
  Td,
  Th,
  Tr,
  color,
  font,
  space,
} from '@/components/ui'

/**
 * «Ganadores por tanda»: qué productos de un mismo ingreso venden mejor, para elegir a cuáles
 * hacerles publicidad (pedido de Bruno, 17-sep-2026).
 *
 * Toda la lógica vive en `lib/ganadores/`: qué ranking manda, los relojes, los puestos y el cartel.
 * Acá sólo se dibuja. Ver `docs/secciones/productos.md`.
 */
export function GanadoresTanda({ productos, tnIdx }: { productos: Producto[]; tnIdx: IndiceTn | null }) {
  const tandas = useMemo(() => tandasDe(productos), [productos])
  const [fecha, setFecha] = useState('')
  const tanda = tandas.find((t) => t.fecha === fecha) ?? tandas[0]
  // `hoy` se fija una vez por montaje: los días de la tanda no tienen que moverse entre renders.
  const [hoy] = useState(() => new Date())
  const r = useMemo(
    () => (tanda ? rankingDeTanda(tanda.productos, { umbralMinPorModelo: UMBRAL_MIN_POR_MODELO, hoy }) : null),
    [tanda, hoy],
  )

  if (!tanda || !r) {
    return <EmptyState icon="🏷️" title="No hay tandas para comparar" hint="Una tanda son 3 o más productos dados de alta el mismo día en Gestión Nube." dashed />
  }

  const cartel = cartelDeTanda(r, UMBRAL_MIN_POR_MODELO)
  const porId = new Map(tanda.productos.map((p) => [p.id, p]))

  return (
    <>
      <FilterBar>
        <Select value={tanda.fecha} onChange={(e) => setFecha(e.target.value)} style={{ width: 320 }} aria-label="Tanda">
          {tandas.map((t) => (
            <option key={t.fecha} value={t.fecha}>
              Alta {fechaCorta(t.fecha)} · {t.productos.length} modelos
            </option>
          ))}
        </Select>
        <span style={{ fontSize: font.sm, color: color.mut }}>{relojesDeTanda(r)}</span>
      </FilterBar>

      <Notice tone={cartel.tono} style={{ marginBottom: space[3] }}>
        <div style={{ fontWeight: 600 }}>{cartel.titulo}</div>
        <div style={{ marginTop: 2 }}>{cartel.detalle}</div>
        {r.senal !== 'sin-ventas' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginTop: space[2], fontSize: font.xs, color: color.mut }}>
            <Barra pct={r.progreso * 100} tono={r.progreso >= 1 ? color.success : color.brand} alto={6} ancho={180} />
            <span>
              Público {r.uMin.toLocaleString('es-AR')} de {r.umbralUnidades.toLocaleString('es-AR')} u · Mayorista{' '}
              {r.uMay.toLocaleString('es-AR')} u
            </span>
          </div>
        )}
      </Notice>

      <TableWrap maxHeight={640}>
        <THead>
          <Tr>
            <Th width={48} align="center">Puesto</Th>
            <Th width={64}>Foto</Th>
            <Th>Producto</Th>
            <Th align="right">Minorista</Th>
            <Th align="right">Minorista por día</Th>
            <Th align="right">Mayorista</Th>
            <Th align="center">Público vs mayorista</Th>
            <Th align="right">Stock</Th>
          </Tr>
        </THead>
        <TBody>
          {r.filas.map((f) => (
            <FilaGanadorView key={f.id} f={f} foto={tnIdx ? imagenDe(porId.get(f.id) ?? {}, tnIdx) : null} manda={r.senal} />
          ))}
        </TBody>
      </TableWrap>
      <p style={{ fontSize: font.xs, color: color.mut2, marginTop: space[2] }}>
        Minorista = Tienda Nube, el local y los demás canales al público; no cuenta canjes ni ventas internas. Los empatados
        comparten puesto. «Público vs mayorista» es cuántos puestos más arriba (▲) o más abajo (▼) lo pone el público.
      </p>
    </>
  )
}

function FilaGanadorView({ f, foto, manda }: { f: FilaGanador; foto: string | null; manda: string }) {
  const fuerte = { fontWeight: 600, color: color.ink }
  return (
    <Tr>
      <Td align="center" strong>{f.puesto}</Td>
      <Td tall>
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} loading="lazy" alt={f.name} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
        ) : (
          <span style={{ fontSize: 9, color: color.mut2 }}>sin foto</span>
        )}
      </Td>
      <Td tall>
        <div style={{ fontWeight: 600, color: color.ink }}>{f.name}</div>
        <div style={{ fontSize: font.xs, color: color.mut2 }}>${f.precio.toLocaleString('es-AR')}</div>
      </Td>
      <Td align="right" tall>
        <span style={manda !== 'mayorista' ? fuerte : undefined}>{f.uMin}</span>
        <div style={{ fontSize: font.xs, color: color.mut2 }}>
          TN {f.uOnline} · local {f.uLocal} · #{f.puestoMin}
        </div>
      </Td>
      <Td align="right" style={{ color: color.mut }}>
        {f.velMin === null ? '—' : f.velMin.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
      </Td>
      <Td align="right" tall>
        <span style={manda === 'mayorista' ? fuerte : undefined}>{f.uMay.toLocaleString('es-AR')}</span>
        <div style={{ fontSize: font.xs, color: color.mut2 }}>#{f.puestoMay}</div>
      </Td>
      <Td align="center">
        {f.desacople === 0 ? (
          <span style={{ color: color.mut2 }}>=</span>
        ) : (
          <Badge tone={f.desacople > 0 ? 'success' : 'warning'} subtle>
            {f.desacople > 0 ? `▲ ${f.desacople}` : `▼ ${-f.desacople}`}
          </Badge>
        )}
      </Td>
      <Td align="right">{f.stock.toLocaleString('es-AR')}</Td>
    </Tr>
  )
}
