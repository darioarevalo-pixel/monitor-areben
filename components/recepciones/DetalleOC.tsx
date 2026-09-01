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
  Lightbox,
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
import { renglonesQueNoCerraron } from '@/lib/recepciones/core'

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
 * 🔴 **Es un BOTÓN que abre el lightbox, ⛔ no un enlace a la imagen.** Cuando era un `<a href>`,
 * apretarla **descargaba el archivo** en vez de mostrarlo: el servidor de Ingresos sirve los
 * `.webp` como `application/octet-stream`, y ante ese content-type el navegador **navegando**
 * descarga. ⚠️ Adentro de un `<img>` el mismo byte se dibuja igual —el navegador sniffea— así que
 * la miniatura nunca dio ninguna señal de que el clic iba a hacer otra cosa. La única forma de
 * verlo es apretarla.
 *
 * 🔑 **Sin foto no dibuja un placeholder gris**: las 79 OC del historial (todo lo anterior al
 * 1-sep-2026) llegaron antes de que el emisor prendiera las imágenes, y una grilla de recuadros
 * vacíos se lee como "las fotos se rompieron" cuando lo que pasa es que nunca vinieron.
 *
 * ⚠️ `onError` la esconde: la URL apunta al servidor de Ingresos, que es otra máquina. Si un día
 * mueve los archivos, acá tiene que quedar el renglón sin foto, ⛔ no el ícono de imagen rota.
 */
export function Foto({ l, lado, onAmpliar }: { l: LineaConCruce; lado: number; onAmpliar?: (l: LineaConCruce) => void }) {
  const [rota, setRota] = useState(false)
  const src = l.imagen_thumb_url || l.imagen_url
  if (!src || rota) return null
  return (
    <button
      type="button"
      onClick={() => onAmpliar?.(l)}
      title={`${l.nombre || l.sku || ''} — ver grande`}
      // 🔴 `height: auto` NO es decorativo. `globals.css` le da a TODO `button` de la pantalla
      // (`.shell-content button`) una altura fija de control —la del kit—, así que sin esto el
      // botón mide 36 px con una foto de 96 adentro: la imagen desborda y **se monta sobre el SKU
      // del renglón de abajo**. Pasó apenas la foto dejó de ser un `<a>`. Un `<a>` no la agarraba.
      style={{ padding: 0, border: 0, background: 'none', cursor: 'zoom-in', display: 'block', lineHeight: 0, height: 'auto', width: 'auto' }}
    >
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
    </button>
  )
}

export function DetalleOC({ marca, oc, onCerrar }: { marca: string; oc: string; onCerrar: () => void }) {
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof leerRecepcion>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Abierto de entrada: la orden entera es lo que se viene a ver. Sigue plegable para cerrarla.
  const [verTodo, setVerTodo] = useState(true)
  const [ampliada, setAmpliada] = useState<LineaConCruce | null>(null)

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

  const { recepcion: r, lineas, espejoConsultado, puede } = datos
  const noCerraron = renglonesQueNoCerraron(lineas)
  // Lo que hay que dar de alta se calcula con el cruce **de hoy**, no con la foto guardada: el caso
  // normal de una importación es que el producto todavía no exista en GN cuando llega.
  const sinAlta = lineas.filter((l) => l.en_gn_hoy === false)
  const conFoto = lineas.filter((l) => l.imagen_thumb_url || l.imagen_url)

  const fila = (l: LineaConCruce) => (
    <Tr key={l.id}>
      <Td>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
          <Foto l={l} lado={40} onAmpliar={setAmpliada} />
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
      // El proveedor sólo si lo puede ver: el servidor ya se lo borró a la respuesta, así que
      // `|| 'sin proveedor'` diría «sin proveedor» sobre una orden que sí lo tiene.
      title={puede.proveedores ? `${r.oc_label || `OC ${r.oc_id}`} · ${r.proveedor_nombre || 'sin proveedor'}` : r.oc_label || `OC ${r.oc_id}`}
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
                  <Foto l={l} lado={96} onAmpliar={setAmpliada} />
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

        {/* 🔑 La foto GRANDE, ⛔ no la miniatura: la del lightbox es para mirar el artículo. */}
        <Lightbox
          src={ampliada ? ampliada.imagen_url || ampliada.imagen_thumb_url : null}
          alt={[ampliada?.sku, ampliada?.nombre, ampliada?.color].filter(Boolean).join(' · ')}
          onCerrar={() => setAmpliada(null)}
        />

        <div style={{ color: color.mut, fontSize: 12 }}>
          <StatusPill tone={r.oc_estado === 'confirmada' ? 'success' : 'neutral'} label={r.oc_estado || 'sin estado'} />{' '}
          Comprada el {r.fecha_compra || '—'} · recibida en el monitor el{' '}
          {new Date(r.recibido_en).toLocaleString('es-AR')}
        </div>
      </div>
    </SectionCard>
  )
}
