'use client'

/**
 * **La ficha de un proveedor: donde se cierra el ciclo.**
 *
 * Cuatro bloques, y los dos últimos son los que hacen que esto no sea una libreta:
 *  1. Quién es, y los dos enganches.
 *  2. Lo que anoté — visitas, intereses con su precio y fecha, compromisos.
 *  3. **Lo que entró** — de `recepcion_oc`, por `proveedor_id_ingresos`. El agregado lo hace
 *     `porProveedor` de `lib/recepciones/core.ts`: ⛔ NO se recalcula acá.
 *  4. **Lo que vendió** — del ETL, por `proveedor_gn`.
 *  5. **Cómo se mueve lo que le compro** — compras y ventas por semana, el ritmo de los últimos
 *     días y la curva desde que entra. Cuelga de las ÓRDENES, no de `proveedor_gn`, así que es el
 *     único bloque de venta que también contesta para BDI. Vive en `MovimientoProveedor.tsx`.
 *
 * ⚠️ **4 y 5 son DOS cortes distintos de la misma plata y por eso conviven.** «Lo que vendió» es el
 * catálogo entero del proveedor en Gestión Nube (sólo Zattia, por mes); el 5 son **los productos de
 * sus órdenes** (las dos marcas, por semana). Contestan preguntas distintas y van a dar números
 * distintos: la pantalla dice cuál contesta cada una.
 *
 * 🔴 **Los dos bloques de abajo distinguen TRES estados y no dos**: sin enganche · enganchado y sin
 * datos · con datos. Un cero mudo afirmaría que no le compramos nunca o que no vendió nada, y sin
 * enganche eso no se sabe. **El cero afirma.**
 *
 * 🔴 **`proveedor_gn` existe SÓLO en Zattia**: la columna `productos.proveedor` no está en la base
 * de BDI. Un proveedor de BDI nunca va a tener ventas acá y eso ⛔ no es un dato faltante.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Field,
  KpiCard,
  Notice,
  Select,
  SectionCard,
  Esqueleto,
  TBody,
  TableWrap,
  THead,
  Td,
  Th,
  Tr,
  color,
  space,
} from '@/components/ui'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { porProveedor, porcentaje } from '@/lib/recepciones/core'
import { kpisProveedor, ranking } from '@/lib/proveedores'
import { escribir, leerFicha, type Ficha, type Opciones } from '@/lib/prm/cliente'
import { abiertosOrdenados, conReloj, sugerirProveedorGn } from '@/lib/prm/core'
import { MovimientoProveedor } from './MovimientoProveedor'

const TONO_SITUACION = { vencido: 'danger', hoy: 'warning', por_venir: 'neutral', sin_fecha: 'neutral', cumplido: 'success' } as const

export function FichaProveedor({
  marca,
  id,
  hoy,
  opciones,
  onVolver,
  onCambio,
}: {
  marca: string
  id: string
  hoy: string
  /**
   * 🔴 `null` = **todavía viajando**, que ⛔ no es «no hay ninguna». Con una `Opciones` vacía los
   * dos desplegables salen vacíos y el bloque de Gestión Nube afirma «no se pudo leer el catálogo»
   * de algo que sigue en camino ⇒ mientras sea `null` la ficha espera con su esqueleto.
   */
  opciones: Opciones | null
  onVolver: () => void
  onCambio: () => void
}) {
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const { datos } = useDatosMonitor()

  useEffect(() => {
    let vivo = true
    void (async () => {
      setCargando(true)
      setError(null)
      try {
        const f = await leerFicha(marca, id)
        if (!vivo) return
        setFicha(f)
      } catch (e) {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudo abrir la ficha.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, id, tick])

  const entrega = useMemo(() => {
    if (!ficha?.recepciones || !ficha.recepciones.length) return null
    return porProveedor(ficha.recepciones)[0] ?? null
  }, [ficha])

  /**
   * 🔑 **Una SUGERENCIA, ⛔ no un enganche.** La regla del módulo sigue en pie —los dos enganches se
   * tildan a mano, porque uno mal puesto es peor que ninguno—: acá ⛔ no se escribe nada solo, sólo
   * se deja de hacer buscar el nombre en una lista de 33. Medido el 2-sep-2026: de los 28
   * proveedores de Zattia, **22 dan exacta y 2 probables**; los 4 que quedan afuera son los que
   * entraron el 1-sep y todavía no tienen productos en Gestión Nube.
   */
  const sugerencia = useMemo(() => {
    if (!ficha || ficha.local.proveedor_gn || !opciones?.gnDisponible) return null
    return sugerirProveedorGn(ficha.local.nombre, opciones.deGn)
  }, [ficha, opciones])

  const ventas = useMemo(() => {
    const gn = ficha?.local.proveedor_gn
    if (!gn || !datos) return null
    const bloque = datos.allProveedoresData?.[gn]
    if (!bloque) return null
    return { kpis: kpisProveedor(bloque.products), top: ranking(bloque.products).slice(0, 8) }
  }, [ficha, datos])

  async function enganchar(patch: Record<string, unknown>) {
    setError(null)
    try {
      await escribir(marca, 'local.enganchar', { id, ...patch })
      setTick((n) => n + 1)
      onCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el enganche.')
    }
  }

  if (cargando || !opciones) return <Esqueleto />
  if (error && !ficha) return <Notice tone="danger">{error}</Notice>
  if (!ficha) return null

  const l = ficha.local
  const compromisos = conReloj(ficha.compromisos, hoy)
  const abiertos = abiertosOrdenados(ficha.compromisos, hoy)

  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <Button variant="ghost" onClick={onVolver} style={{ justifySelf: 'start' }}>← Volver al PRM</Button>

      {error && <Notice tone="danger">{error}</Notice>}

      {/* ── 1 · Quién es ─────────────────────────────────────────────────────────────────── */}
      <SectionCard title={l.nombre} subtitle={[l.galeria, l.direccion, l.zona].filter(Boolean).join(' · ')}>
        <div style={{ display: 'flex', gap: space[4], flexWrap: 'wrap', fontSize: 13 }}>
          {l.rubro && <span><strong>Rubro:</strong> {l.rubro}</span>}
          {l.contacto && <span><strong>Atiende:</strong> {l.contacto}</span>}
          {l.telefono && <span><strong>Tel:</strong> {l.telefono}</span>}
          {l.instagram && <span><strong>IG:</strong> {l.instagram}</span>}
        </div>
        {l.nota && <p style={{ fontSize: 13, color: color.mut, marginTop: space[2] }}>{l.nota}</p>}

        <div style={{ display: 'flex', gap: space[4], flexWrap: 'wrap', marginTop: space[3] }}>
          <Field
            label="Proveedor en el sistema de Ingresos"
            hint="Lo que enciende «Lo que entró». Se elige a mano: los nombres no se pueden cruzar solos."
            width={280}
          >
            <Select
              value={l.proveedor_id_ingresos == null ? '' : String(l.proveedor_id_ingresos)}
              onChange={(e) => void enganchar({ proveedor_id_ingresos: e.target.value || null })}
            >
              <option value="">— sin enganchar —</option>
              {opciones.deIngresos.map((o) => (
                <option key={o.id} value={o.id}>{o.nombre}</option>
              ))}
            </Select>
          </Field>

          <Field
            label="Proveedor en Gestión Nube"
            hint={
              opciones.gnDisponible
                ? 'Lo que enciende «Lo que vendió». Existe sólo del lado de Zattia.'
                : 'No se pudo leer el catálogo de Zattia, así que la lista está vacía por eso — no porque no haya.'
            }
            width={280}
          >
            <Select
              value={l.proveedor_gn ?? ''}
              onChange={(e) => void enganchar({ proveedor_gn: e.target.value || null })}
              disabled={!opciones.gnDisponible}
            >
              <option value="">— sin enganchar —</option>
              {opciones.deGn.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
            {/*
              🔴 **El nombre sugerido va A LA VISTA y el botón dice qué va a hacer.** ⛔ No se
              preselecciona en el desplegable: un valor puesto de antemano se guarda solo en cuanto
              alguien toca cualquier otra cosa, y ahí deja de ser una sugerencia.
              🔑 Y **«probable» se dice**: `Contamina` contra `CONTAMINA BY LATTE CHIC` es de las que
              hay que mirar antes de aceptar, y la de al lado puede no serlo.
            */}
            {sugerencia && (
              <div style={{ display: 'flex', gap: space[2], alignItems: 'center', marginTop: space[1] }}>
                <Button size="sm" onClick={() => void enganchar({ proveedor_gn: sugerencia.nombre })}>
                  Enganchar con «{sugerencia.nombre}»
                </Button>
                <span style={{ fontSize: 11, color: color.mut2 }}>
                  {sugerencia.seguridad === 'exacta' ? 'mismo nombre' : 'se le parece — miralo antes'}
                </span>
              </div>
            )}
          </Field>
        </div>
      </SectionCard>

      {/* ── 2 · Lo que anoté ─────────────────────────────────────────────────────────────── */}
      <SectionCard title="Lo que quedó prometido" subtitle={`${abiertos.length} abierto(s) de ${compromisos.length}`}>
        {!compromisos.length ? (
          <p style={{ fontSize: 13, color: color.mut }}>Nada anotado todavía.</p>
        ) : (
          compromisos.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: space[2], alignItems: 'center', marginBottom: 6 }}>
              <Badge tone={TONO_SITUACION[c.situacion]} subtle>{c.situacion.replace('_', ' ')}</Badge>
              <span style={{ fontSize: 13, flex: 1 }}>
                <strong>{c.de_quien === 'yo' ? 'Yo:' : 'Ellos:'}</strong> {c.que}
                <span style={{ color: color.mut2, fontSize: 11 }}>
                  {' '}· anotado hace {c.diasEsperando} día(s)
                  {c.para_cuando ? ` · para el ${c.para_cuando}` : ' · sin fecha'}
                </span>
              </span>
              {c.situacion !== 'cumplido' && (
                <Button size="sm" variant="outline" onClick={() => void escribir(marca, 'compromiso.cumplir', { id: c.id, cumplido: true }).then(() => setTick((n) => n + 1))}>
                  Cumplido
                </Button>
              )}
            </div>
          ))
        )}
      </SectionCard>

      <SectionCard title="Qué me interesó" subtitle="El precio va con su fecha: un precio sin fecha no dice nada">
        {!ficha.intereses.length ? (
          <p style={{ fontSize: 13, color: color.mut }}>Nada anotado todavía.</p>
        ) : (
          <TableWrap>
            <THead>
              <Tr><Th>Producto</Th><Th>Precio visto</Th><Th>Cuándo</Th><Th>Para</Th><Th>Estado</Th></Tr>
            </THead>
            <TBody>
              {ficha.intereses.map((i) => (
                <Tr key={i.id}>
                  <Td strong>{i.descripcion}</Td>
                  <Td align="right" mono>{i.precio_visto != null ? `$${i.precio_visto}` : '—'}</Td>
                  <Td>{i.visto_en}</Td>
                  <Td>{i.marca ?? '—'}</Td>
                  <Td><Badge subtle>{i.estado}</Badge></Td>
                </Tr>
              ))}
            </TBody>
          </TableWrap>
        )}
      </SectionCard>

      <SectionCard title="Las visitas" subtitle={`${ficha.visitas.length} anotada(s)`}>
        {!ficha.visitas.length ? (
          <p style={{ fontSize: 13, color: color.mut }}>Todavía no fui, o fui y no anoté.</p>
        ) : (
          ficha.visitas.map((v) => (
            <div key={v.id} style={{ borderTop: `1px solid ${color.line}`, paddingTop: space[2], marginTop: space[2] }}>
              <div style={{ fontSize: 12, color: color.mut }}>
                {v.fecha}
                {v.quien ? ` · ${v.quien}` : ''}
                {v.puntaje != null ? ` · ${v.puntaje}/5` : ''}
                {v.compre ? ' · compré' : ''}
              </div>
              <div style={{ fontSize: 13 }}>{v.opinion || '—'}</div>
              {v.compre && v.que_compre && (
                <div style={{ fontSize: 12, color: color.mut }}>
                  Qué: {v.que_compre}{' '}
                  <span style={{ color: color.mut2 }}>(nota; las unidades las trae la orden de compra)</span>
                </div>
              )}
            </div>
          ))
        )}
      </SectionCard>

      {/* ── 3 · Lo que entró ─────────────────────────────────────────────────────────────── */}
      <SectionCard title="Lo que entró" subtitle="De las órdenes de compra confirmadas: ¿entrega lo que le pedimos?">
        {ficha.recepciones === null ? (
          <Notice tone="neutral">
            Este local no está enganchado a ningún proveedor del sistema de Ingresos, así que no se
            puede saber qué entregó. Elegilo arriba.
          </Notice>
        ) : !ficha.recepciones.length ? (
          <Notice tone="neutral">
            Está enganchado, y todavía no llegó ninguna orden de compra suya. ⛔ No es que entregue mal:
            es que no hay nada medido.
          </Notice>
        ) : entrega ? (
          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
            <KpiCard label="Órdenes" value={String(entrega.ocs)} />
            <KpiCard label="Pedidas" value={String(entrega.unidades_pedidas)} />
            <KpiCard label="Contadas" value={String(entrega.unidades_contadas)} />
            <KpiCard label="Cumplimiento" value={porcentaje(entrega.cumplimiento)} />
            <KpiCard label="Faltaron" value={String(entrega.unidades_faltantes)} />
            <KpiCard label="Sobraron" value={String(entrega.unidades_sobrantes)} />
          </div>
        ) : null}
      </SectionCard>

      {/* ── 4 · Lo que vendió ────────────────────────────────────────────────────────────── */}
      <SectionCard title="Lo que vendió" subtitle="De su mercadería en el catálogo">
        {!l.proveedor_gn ? (
          <Notice tone="neutral">
            {opciones.gnDisponible
              ? 'Este local no está enganchado a ningún proveedor de Gestión Nube. Elegilo arriba.'
              : 'El proveedor de Gestión Nube existe SÓLO del lado de Zattia: la columna no está en la base de BDI. Para un proveedor de BDI, este bloque no se puede llenar.'}
          </Notice>
        ) : !datos ? (
          <Esqueleto />
        ) : !ventas ? (
          <Notice tone="neutral">
            Está enganchado a <strong>{l.proveedor_gn}</strong>, pero ese proveedor no aparece en el
            catálogo de la marca que estás mirando. Recordá que sólo existe en Zattia.
          </Notice>
        ) : (
          <>
            <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', marginBottom: space[3] }}>
              <KpiCard label="Vendidas" value={String(ventas.kpis.totalSold)} />
              <KpiCard label="En stock" value={String(ventas.kpis.totalStock)} />
              <KpiCard label="Margen promedio" value={ventas.kpis.avgMargin == null ? '—' : `${ventas.kpis.avgMargin.toFixed(1)}%`} />
            </div>
            <TableWrap>
              <THead>
                <Tr><Th>Producto</Th><Th>Vendidas</Th><Th>Stock</Th><Th>Margen</Th></Tr>
              </THead>
              <TBody>
                {ventas.top.map((p) => (
                  <Tr key={p.id}>
                    <Td strong>{p.name ?? p.id}</Td>
                    <Td align="right" mono>{p.soldTotal}</Td>
                    <Td align="right" mono>{p.stock}</Td>
                    <Td align="right" mono>{p.margin == null ? '—' : `${p.margin.toFixed(1)}%`}</Td>
                  </Tr>
                ))}
              </TBody>
            </TableWrap>
          </>
        )}
      </SectionCard>

      {/* ── 5 · Cómo se mueve lo que le compro ───────────────────────────────────────────── */}
      <SectionCard
        title="Cómo se mueve lo que le compro"
        subtitle="De sus órdenes cruzadas contra el catálogo: qué entró, qué salió de eso, y con qué forma"
      >
        <MovimientoProveedor marca={marca} id={id} hoy={hoy} />
      </SectionCard>
    </div>
  )
}
