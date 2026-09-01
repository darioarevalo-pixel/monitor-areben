'use client'

/**
 * Una orden de compra recibida, renglón por renglón.
 *
 * 🔑 **Abre por lo que no cerró.** La lista completa está abajo, plegada: quien entra a una OC no
 * viene a leer 120 renglones que cerraron bien, viene a ver los tres que no.
 */

import { useEffect, useState } from 'react'
import {
  Badge,
  EmptyState,
  Esqueleto,
  Notice,
  Plegable,
  SectionCard,
  StatusPill,
  TBody,
  TableWrap,
  THead,
  Td,
  Th,
  Tr,
  color,
  space,
} from '@/components/ui'
import { leerRecepcion, type LineaConCruce } from '@/lib/recepciones/cliente'
import { renglonesQueNoCerraron, type Recepcion } from '@/lib/recepciones/core'

/** El renglón, con el signo adelante: `-2` y `+3` se leen distinto que `2` y `3`. */
function Diferencia({ n }: { n: number }) {
  if (n === 0) return <span style={{ color: color.mut }}>—</span>
  return (
    <strong style={{ color: n < 0 ? color.danger : color.warning }}>
      {n > 0 ? '+' : ''}
      {n}
    </strong>
  )
}

/**
 * El cruce con Gestión Nube, en TRES estados.
 *
 * ⛔ El tercero no se puede colapsar en "no está": `null` es "no se pudo preguntar", y pintarlo como
 * falta de alta convierte un espejo caído en una lista de tareas inventada.
 */
function EnGN({ v }: { v: boolean | null }) {
  if (v === null) return <Badge tone="neutral">no se pudo ver</Badge>
  return v ? <Badge tone="success">en GN</Badge> : <Badge tone="warning">falta crearlo en GN</Badge>
}

/**
 * La foto del artículo, si Ingresos la mandó.
 *
 * 🔑 **Sin foto no dibuja un placeholder gris**: las 79 OC del historial (todo lo anterior al
 * 1-sep-2026) llegaron antes de que el emisor prendiera las imágenes, y una grilla de recuadros
 * vacíos se lee como "las fotos se rompieron" cuando lo que pasa es que nunca vinieron.
 *
 * ⚠️ `onError` la esconde: la URL apunta al servidor de Ingresos, que es otra máquina. Si un día
 * mueve los archivos, acá tiene que quedar el renglón sin foto, ⛔ no el ícono de imagen rota.
 */
export function Foto({ l, lado }: { l: LineaConCruce; lado: number }) {
  const [rota, setRota] = useState(false)
  const src = l.imagen_thumb_url || l.imagen_url
  if (!src || rota) return null
  return (
    <a href={l.imagen_url || src} target="_blank" rel="noopener noreferrer" title={`${l.nombre || l.sku || ''} — ver grande`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={[l.nombre, l.color, l.talle].filter(Boolean).join(' ') || l.sku || 'artículo'}
        onError={() => setRota(true)}
        loading="lazy"
        width={lado}
        height={lado}
        style={{ width: lado, height: lado, objectFit: 'cover', borderRadius: 6, border: `1px solid ${color.line}`, display: 'block', background: color.bg2 }}
      />
    </a>
  )
}

export function DetalleOC({ marca, oc, onCerrar }: { marca: string; oc: string; onCerrar: () => void }) {
  const [datos, setDatos] = useState<{ recepcion: Recepcion; lineas: LineaConCruce[]; espejoConsultado: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [verTodo, setVerTodo] = useState(false)

  useEffect(() => {
    let vivo = true
    void (async () => {
      setError(null)
      setDatos(null)
      try {
        const r = await leerRecepcion(marca, oc)
        if (vivo) setDatos(r)
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudo abrir la orden.')
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, oc])

  if (error) return <Notice tone="danger">{error}</Notice>
  if (!datos) return <Esqueleto />

  const { recepcion: r, lineas, espejoConsultado } = datos
  const noCerraron = renglonesQueNoCerraron(lineas)
  // Lo que hay que dar de alta se calcula con el cruce **de hoy**, no con la foto guardada: el caso
  // normal de una importación es que el producto todavía no exista en GN cuando llega.
  const sinAlta = lineas.filter((l) => l.en_gn_hoy === false)
  const conFoto = lineas.filter((l) => l.imagen_thumb_url || l.imagen_url)

  const fila = (l: LineaConCruce) => (
    <Tr key={l.id}>
      <Td>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
          <Foto l={l} lado={40} />
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{l.sku || '—'}</div>
            <div style={{ color: color.ink2, fontSize: 12 }}>
              {[l.nombre, l.talle, l.color].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
        </div>
      </Td>
      <Td align="right">{l.cantidad_pedida}</Td>
      <Td align="right">{l.cantidad_contada}</Td>
      <Td align="right">
        <Diferencia n={l.diferencia} />
      </Td>
      <Td>{l.observaciones || <span style={{ color: color.mut }}>—</span>}</Td>
      <Td>
        {l.es_nuevo && <Badge tone="brand">nuevo</Badge>} <EnGN v={l.en_gn_hoy} />
      </Td>
    </Tr>
  )

  const cabecera = (
    <THead>
      <Tr>
        <Th>Artículo</Th>
        <Th align="right">Pedidas</Th>
        <Th align="right">Contadas</Th>
        <Th align="right">Dif.</Th>
        <Th>Observaciones</Th>
        <Th>Estado</Th>
      </Tr>
    </THead>
  )

  return (
    <SectionCard
      title={`${r.oc_label || `OC ${r.oc_id}`} · ${r.proveedor_nombre || 'sin proveedor'}`}
      subtitle={`${r.lineas_recibidas} renglones · ${r.unidades_pedidas} pedidas · ${r.unidades_contadas} contadas${
        r.fecha_ingreso ? ` · ingresó el ${r.fecha_ingreso}` : ''
      }`}
      actions={
        <button type="button" onClick={onCerrar} style={{ background: 'none', border: 0, color: color.brand, cursor: 'pointer' }}>
          ← volver a la lista
        </button>
      }
    >
      <div style={{ display: 'grid', gap: space[4] }}>
        {!r.totales_coinciden && (
          <Notice tone="warning">
            <strong>Los totales que mandó Ingresos no cierran contra sus propios renglones.</strong> La orden
            dice {r.unidades_pedidas} pedidas y {r.unidades_contadas} contadas; sumando los {r.lineas_recibidas}{' '}
            renglones da otra cosa. Lo que se muestra abajo son los renglones, que es lo que se puede
            verificar — el desvío hay que mirarlo del lado del emisor.
          </Notice>
        )}
        {!espejoConsultado && (
          <Notice tone="neutral">
            No se pudo consultar el catálogo de Gestión Nube, así que la columna «en GN» no dice nada
            en esta pasada. <strong>No significa que los artículos no estén.</strong>
          </Notice>
        )}

        {conFoto.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: space[2] }}>
              Lo que entró — {conFoto.length}
              {conFoto.length < lineas.length ? ` de ${lineas.length} renglones con foto` : ' artículos'}
            </div>
            {/* 🔑 La grilla va ARRIBA y fuera del plegable. La tabla se abre por lo que NO cerró, y
                hoy la mayoría de las OC cierran completas: si las fotos vivieran sólo adentro de los
                renglones, en una OC sin diferencias no se vería ninguna sin desplegar. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: space[3] }}>
              {conFoto.map((l) => (
                <div key={l.id} style={{ display: 'grid', gap: 4, justifyItems: 'center', textAlign: 'center' }}>
                  <Foto l={l} lado={96} />
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: color.ink2, wordBreak: 'break-all' }}>{l.sku || '—'}</div>
                  <div style={{ fontSize: 11, color: color.mut }}>
                    {l.cantidad_contada} u.{l.diferencia !== 0 ? ' · ' : ''}
                    {l.diferencia !== 0 && <Diferencia n={l.diferencia} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {noCerraron.length === 0 ? (
          <EmptyState icon="✅" title="Llegó completo" hint="Todos los renglones cerraron contra lo pedido." />
        ) : (
          <div>
            <div style={{ fontWeight: 600, marginBottom: space[2] }}>
              Lo que no cerró — {noCerraron.length} de {lineas.length} renglones
            </div>
            <TableWrap>
              {cabecera}
              <TBody>{noCerraron.map(fila)}</TBody>
            </TableWrap>
          </div>
        )}

        {sinAlta.length > 0 && (
          <Notice tone="action">
            <strong>{sinAlta.length} artículos que llegaron no están en Gestión Nube.</strong> Hasta que
            se les haga la ficha no se pueden vender ni contar:{' '}
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
              {sinAlta.slice(0, 8).map((l) => l.sku).join(' · ')}
              {sinAlta.length > 8 ? ` … y ${sinAlta.length - 8} más` : ''}
            </span>
          </Notice>
        )}

        <Plegable
          abierto={verTodo}
          onToggle={() => setVerTodo((v) => !v)}
          titulo={`Los ${lineas.length} renglones`}
          ayuda="La orden entera, incluidos los que cerraron bien."
        >
          <TableWrap>
            {cabecera}
            <TBody>{lineas.map(fila)}</TBody>
          </TableWrap>
        </Plegable>

        <div style={{ color: color.mut, fontSize: 12 }}>
          <StatusPill tone={r.oc_estado === 'confirmada' ? 'success' : 'neutral'} label={r.oc_estado || 'sin estado'} />{' '}
          Comprada el {r.fecha_compra || '—'} · recibida en el monitor el{' '}
          {new Date(r.recibido_en).toLocaleString('es-AR')}
        </div>
      </div>
    </SectionCard>
  )
}
