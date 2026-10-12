'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Notice, TableWrap, TBody, Td, Th, THead, Tr, color, font, space, useToast, weight } from '@/components/ui'
import { CUENTAS } from '@/lib/cuentas'
import { leerRecorrido } from '@/lib/exhib/cliente'
import type { Cobertura, EscaneoLibre, RecorridoLibre } from '@/lib/exhib/libre'
import { nuevosDesde, reporteDelChequeo, type Duplicada, type FeriaEnRegulares, type Pendiente } from '@/lib/exhib/reporte'
import { imprimirTicket } from '@/lib/exhib/ticket'
import type { ExhibItem } from '@/lib/exhib/tipos'
import type { MapaLocal } from '@/lib/mapa-local/tipos'
import type { Marca } from '@/lib/nav'
import { fetchAll } from '@/lib/supabase/rest'
import { FotoTicket } from './FotoTicket'
import { useEdadStock } from './useEdadStock'

/**
 * **El reporte del chequeo** (Darío, 11-oct-2026): lo pendiente de exhibición y las variantes
 * duplicadas de los recorridos de un día, sólo de regulares, y el ticket de 80 mm para la empleada.
 * La cuenta vive en `lib/exhib/reporte.ts` y el papel en `lib/exhib/ticket.ts`.
 * La feria colgada en regulares se muestra sólo acá: se decide después, ⛔ es tarea del ticket.
 *
 * 🔑 **Un chequeo son los recorridos del DÍA** (uno por sector). Se tildan todos los cerrados de ese
 * día; se puede destildar uno que fue una prueba o un arranque en falso.
 * ⛔ El celular es para escanear: esto se mira e imprime desde la computadora (lo muestra
 * `ExhibLibre` sólo a quien edita el Mapa del local).
 */

const EN_AR = { timeZone: 'America/Argentina/Buenos_Aires' } as const
/** El día del local (`YYYY-MM-DD` en hora de Buenos Aires). Lo usa también la foto del ticket de `ExhibLibre`. */
export const diaDe = (iso: string) => new Date(iso).toLocaleDateString('en-CA', EN_AR)
const fechaLarga = (dia: string) => new Date(`${dia}T12:00:00-03:00`).toLocaleDateString('es-AR', { ...EN_AR, weekday: 'long', day: '2-digit', month: '2-digit' })
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { ...EN_AR, hour: '2-digit', minute: '2-digit' })
/** Con una foto del stock más nueva que esto, abrir el reporte ⛔ la vuelve a traer. */
const FRESCO_MIN = 30
const variante = (v: string) => (v && v !== 'Variante Única' ? v : '—')
/** `2026-10-08` → `8-oct`. */
const diaCorto = (dia: string) => new Date(`${dia}T12:00:00-03:00`).toLocaleDateString('es-AR', { ...EN_AR, day: 'numeric', month: 'short' }).replace(/\s+de\s+|\s+/, '-').replace('.', '')

export function ReporteChequeo({ marca, previos, items, mapa, onTraerStock, trayendo, onCobertura }: { marca: Marca; previos: RecorridoLibre[]; items: ExhibItem[]; mapa: MapaLocal | null; onTraerStock: () => Promise<void>; trayendo: boolean; onCobertura: (id: string, c: Cobertura) => void }) {
  const toast = useToast()
  const cerrados = useMemo(() => previos.filter((r) => r.estado === 'cerrado' && (r.escaneos ?? 0) > 0), [previos])
  const dias = useMemo(() => [...new Set(cerrados.map((r) => diaDe(r.creado_en)))].sort().reverse(), [cerrados])
  const [dia, setDia] = useState<string | null>(null)
  const diaVisto = dia && dias.includes(dia) ? dia : (dias[0] ?? null)
  const delDia = useMemo(() => cerrados.filter((r) => diaDe(r.creado_en) === diaVisto).sort((a, b) => a.creado_en.localeCompare(b.creado_en)), [cerrados, diaVisto])
  /** Los destildados (por id): lo que no está acá, cuenta. Así un recorrido nuevo del día entra solo. */
  const [fuera, setFuera] = useState<Set<string>>(new Set())
  const elegidos = useMemo(() => delDia.filter((r) => !fuera.has(r.id)), [delDia, fuera])

  /** Los escaneos de cada recorrido, por id: un recorrido cerrado ⛔ cambia, así que se bajan una vez. */
  const [escaneos, setEscaneos] = useState<Record<string, EscaneoLibre[]>>({})
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const faltan = elegidos.filter((r) => !escaneos[r.id])
    if (!faltan.length) return
    let vivo = true
    Promise.all(faltan.map((r) => leerRecorrido(marca, r.id).then((d) => [r.id, d.escaneos] as const)))
      .then((pares) => {
        if (!vivo) return
        setError(null)
        setEscaneos((prev) => ({ ...prev, ...Object.fromEntries(pares) }))
      })
      .catch((e: Error) => vivo && setError(e.message))
    return () => {
      vivo = false
    }
  }, [elegidos, escaneos, marca])

  /**
   * Los productos dados de alta en GN desde el chequeo anterior (Darío, 12-oct-2026): en la lista
   * separan «entró y todavía no se colgó» de «se dejó de exhibir». Si ⛔ se pudieron leer, el reporte
   * sale igual, sin la marca.
   */
  const desde = useMemo(() => (diaVisto ? nuevosDesde(diaVisto, cerrados.map((r) => ({ dia: diaDe(r.creado_en), escaneos: r.escaneos ?? 0 }))) : null), [diaVisto, cerrados])
  const [nuevos, setNuevos] = useState<{ desde: string; porProducto: Map<string, string> } | null>(null)
  useEffect(() => {
    if (!desde) return
    let vivo = true
    fetchAll<{ id: number | string; created_at: string | null }>(CUENTAS[marca], 'productos', `select=id,created_at&created_at=gte.${desde.desde}`)
      .then((filas) => {
        if (!vivo) return
        const porProducto = new Map<string, string>()
        for (const f of filas) if (f.created_at) porProducto.set(String(f.id), f.created_at.slice(0, 10))
        setNuevos({ desde: desde.desde, porProducto })
      })
      .catch(() => vivo && setNuevos({ desde: desde.desde, porProducto: new Map() }))
    return () => {
      vivo = false
    }
  }, [desde, marca])
  const nuevosAlDia = nuevos && desde && nuevos.desde === desde.desde ? nuevos.porProducto : null

  const listo = elegidos.length > 0 && elegidos.every((r) => escaneos[r.id]) && nuevosAlDia !== null
  const reporte = useMemo(() => (listo && nuevosAlDia ? reporteDelChequeo(elegidos.flatMap((r) => escaneos[r.id]), items, mapa, nuevosAlDia) : null), [listo, elegidos, escaneos, items, mapa, nuevosAlDia])
  const { stockDe, stockViejo, texto: textoStock } = useEdadStock(marca, items)
  const [imprimiendo, setImprimiendo] = useState(false)

  /**
   * 🔑 **El stock se trae SOLO al abrir el reporte** (Darío, 12-oct-2026): el espejo es una foto de la
   * mañana, y una venta o una reposición posterior hacen que la lista pida lo que ya se vendió o
   * se olvide de lo que llegó. El botón quedaba librado a la memoria de quien imprime.
   * Es el MISMO sync del botón (2-4 min); ⛔ se dispara si la foto tiene menos de `FRESCO_MIN`, y
   * una sola vez por apertura (si falla, queda el botón y el aviso de la hora).
   */
  const disparado = useRef(false)
  useEffect(() => {
    if (disparado.current || stockDe === undefined || trayendo || !dias.length) return
    if (stockDe && stockDe.horas * 60 < FRESCO_MIN) return
    disparado.current = true
    void onTraerStock()
  }, [stockDe, trayendo, dias.length, onTraerStock])

  async function imprimir() {
    if (!reporte) return
    setImprimiendo(true)
    try {
      await imprimirTicket(reporte.pendientes, reporte.duplicadas)
    } catch (e) {
      toast.error('No se pudo armar el ticket: ' + (e as Error).message)
    } finally {
      setImprimiendo(false)
    }
  }

  if (!dias.length) return null
  const pct = reporte && reporte.total ? Math.round((reporte.vistas / reporte.total) * 100) : 0

  return (
    <div style={{ marginBottom: space[5] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', marginBottom: space[2] }}>
        <b style={{ fontSize: font.md, color: color.ink }}>Reporte del chequeo</b>
        <select
          className="mo-input"
          value={diaVisto ?? ''}
          onChange={(e) => {
            setDia(e.target.value)
            setFuera(new Set())
          }}
          aria-label="Día del chequeo"
          style={{ height: 32, width: 'auto', fontSize: font.sm }}
        >
          {dias.map((d) => (
            <option key={d} value={d}>
              {fechaLarga(d)}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', marginBottom: space[3], fontSize: font.sm }}>
        {delDia.map((r) => (
          <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: color.ink2 }}>
            <input
              type="checkbox"
              checked={!fuera.has(r.id)}
              onChange={() =>
                setFuera((prev) => {
                  const s = new Set(prev)
                  if (s.has(r.id)) s.delete(r.id)
                  else s.add(r.id)
                  return s
                })
              }
            />
            {hora(r.creado_en)} · {r.persona || 'sin nombre'} · {r.escaneos} escaneos
          </label>
        ))}
      </div>

      {/* 🔑 La foto del ticket tildado va ARRIBA: lo primero que se quiere saber de un día viejo es si se terminó. */}
      <FotoTicket marca={marca} recorridos={delDia} onCobertura={onCobertura} />

      {error && <Notice tone="danger" icon="⚠" style={{ marginBottom: space[3] }}>No se pudieron leer los recorridos: {error}</Notice>}
      {!elegidos.length && <div style={{ color: color.mut, fontSize: font.sm }}>Tildá al menos un recorrido.</div>}
      {elegidos.length > 0 && !reporte && !error && <div style={{ color: color.mut, fontSize: font.sm }}>Armando el reporte…</div>}

      {reporte && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[3], fontSize: font.sm, color: color.mut }}>
            {/* 🔑 El total va a la vista: el reporte afirma sobre TODO lo regular del local, y un día
                que se caminó un solo perchero se nota acá antes de imprimir 400 renglones. */}
            <span title="Variantes regulares con stock en el Local (sin feria, outlet, accesorios ni Stunned)">
              Pasaron por el lector <b style={{ color: color.ink }}>{reporte.vistas}</b> de <b style={{ color: color.ink }}>{reporte.total}</b> variantes regulares ({pct} %)
            </span>
            <span title="El local vende unas 160 prendas por día: con el stock viejo, el reporte puede pedir cosas que ya se vendieron." style={{ color: stockViejo ? color.warning : color.mut }}>
              {textoStock}
            </span>
            <Button size="sm" variant="outline" onClick={() => void onTraerStock()} loading={trayendo}>
              Actualizar stock
            </Button>
            {/* ⛔ Se imprime mientras se trae el stock: el papel saldría con la foto vieja. */}
            <Button size="sm" variant="solid" tone="brand" onClick={() => void imprimir()} loading={imprimiendo} disabled={trayendo}>
              Imprimir ticket
            </Button>
          </div>
          {trayendo && (
            <Notice tone="brand" icon="↻" style={{ marginBottom: space[3] }}>
              Actualizando el stock con Gestión Nube (2 a 4 minutos). Cuando termine, la lista se vuelve a armar sola y se puede imprimir.
            </Notice>
          )}

          <ListaPendientes lista={reporte.pendientes} porUnaVariante={reporte.porUnaVariante} desde={desde} />
          <ListaDuplicadas lista={reporte.duplicadas} />
          <ListaFeria lista={reporte.feria} />
        </>
      )}
    </div>
  )
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <div style={{ fontWeight: weight.bold, fontSize: font.base, color: color.ink, margin: `${space[3]}px 0 ${space[2]}px` }}>{children}</div>
}

function ListaPendientes({ lista, porUnaVariante, desde }: { lista: Pendiente[]; porUnaVariante: number; desde: { desde: string; hayAnterior: boolean } | null }) {
  const cuantosNuevos = lista.filter((p) => p.nuevo).length
  const unaSola = lista.filter((p) => p.enLocal === 1).length
  return (
    <>
      <Titulo>
        Pendiente de exhibición ({lista.length})
        <span style={{ fontWeight: 400, fontSize: font.sm, color: color.mut }}>
          {cuantosNuevos > 0 && desde && (
            <span title="Productos dados de alta en Gestión Nube desde el chequeo anterior. La reposición de un producto que ya existía no se marca.">
              {' '}
              · {cuantosNuevos} nuevos {desde.hayAnterior ? `desde el chequeo del ${diaCorto(desde.desde)}` : `desde el ${diaCorto(desde.desde)}`}
            </span>
          )}
          {unaSola > 0 && <span title="El sistema dice que hay una sola unidad: si no aparece, revisar el stock"> · {unaSola} con 1 sola unidad</span>}
          {porUnaVariante > 0 && <> · {porUnaVariante} sin pedir por «una sola variante»</>}
        </span>
      </Titulo>
      {lista.length ? (
        <TableWrap maxHeight={420}>
          <THead>
            <Tr>
              <Th width={150}>SKU</Th>
              <Th>Producto</Th>
              <Th>Variante</Th>
              <Th align="center" width={80}>En el local</Th>
            </Tr>
          </THead>
          <TBody>
            {lista.map((p) => (
              <Tr key={p.clave}>
                <Td style={{ fontWeight: 600 }}>{p.sku || '—'}</Td>
                <Td wrap>
                  {p.nombre}
                  {p.nuevo && <Etiqueta tono="nuevo" titulo="Dado de alta en Gestión Nube desde el chequeo anterior">Nuevo {diaCorto(p.nuevo)}</Etiqueta>}
                  {p.enLocal === 1 && <Etiqueta tono="una" titulo="Una sola unidad: si no aparece, revisar el stock">1 sola</Etiqueta>}
                </Td>
                <Td wrap>{p.unaCualquiera ? 'una cualquiera' : variante(p.variante)}</Td>
                <Td align="center" style={{ color: p.enLocal === 1 ? color.danger : color.ink2 }} title={p.enLocal === 1 ? 'Una sola unidad: si no aparece, revisar el stock' : undefined}>
                  {p.enLocal}
                </Td>
              </Tr>
            ))}
          </TBody>
        </TableWrap>
      ) : (
        <div style={{ color: color.mut, fontSize: font.sm }}>No hay variantes pendientes.</div>
      )}
    </>
  )
}

/** La marquita al lado del producto: «Nuevo 8-oct» o «1 sola». Sólo en pantalla, ⛔ va al ticket. */
function Etiqueta({ tono, titulo, children }: { tono: 'nuevo' | 'una'; titulo: string; children: React.ReactNode }) {
  const c = tono === 'nuevo' ? color.brand : color.danger
  return (
    <span title={titulo} style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, border: `1px solid ${c}`, color: c, fontSize: font.xs, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

function ListaDuplicadas({ lista }: { lista: Duplicada[] }) {
  return (
    <>
      <Titulo>Variantes duplicadas ({lista.length})</Titulo>
      {lista.length ? (
        <TableWrap maxHeight={420}>
          <THead>
            <Tr>
              <Th width={150}>SKU</Th>
              <Th>Producto</Th>
              <Th>Variante</Th>
              <Th align="center" width={70}>Veces</Th>
            </Tr>
          </THead>
          <TBody>
            {lista.map((d) => (
              <Tr key={d.clave}>
                <Td style={{ fontWeight: 600 }}>{d.sku || '—'}</Td>
                <Td wrap>
                  {d.nombre}
                  {/* El lugar sólo cuando está en DOS: por el nombre ya se sabe el sector (Darío, 11-oct-2026),
                      pero con una en el perchero y otra en la vidriera hay que saber cuál se retira. */}
                  {d.lugares.length > 1 && <span style={{ fontSize: font.sm, color: color.mut }}> · en {d.lugares.slice(0, -1).join(', ')} y {d.lugares.at(-1)}</span>}
                </Td>
                <Td wrap>{variante(d.variante)}</Td>
                <Td align="center">{d.veces}</Td>
              </Tr>
            ))}
          </TBody>
        </TableWrap>
      ) : (
        <div style={{ color: color.mut, fontSize: font.sm }}>No hay variantes duplicadas.</div>
      )}
    </>
  )
}

/** La feria que pasó por el lector en el sector regular: ⛔ se corrige en el chequeo, se decide después (Darío, 11-oct-2026). */
function ListaFeria({ lista }: { lista: FeriaEnRegulares[] }) {
  return (
    <>
      <Titulo>
        Feria en el sector regular ({lista.length})
        <span style={{ fontWeight: 400, fontSize: font.sm, color: color.mut }}> · para decidir después, no va en el ticket</span>
      </Titulo>
      {lista.length ? (
        <TableWrap maxHeight={420}>
          <THead>
            <Tr>
              <Th width={150}>SKU</Th>
              <Th>Producto</Th>
              <Th>Variante</Th>
              <Th>Dónde</Th>
              <Th align="center" width={70}>Veces</Th>
            </Tr>
          </THead>
          <TBody>
            {lista.map((f) => (
              <Tr key={f.clave}>
                <Td style={{ fontWeight: 600 }}>{f.sku || '—'}</Td>
                <Td wrap>{f.nombre}</Td>
                <Td wrap>{variante(f.variante)}</Td>
                <Td wrap>{f.lugares.join(', ') || '—'}</Td>
                <Td align="center">{f.veces}</Td>
              </Tr>
            ))}
          </TBody>
        </TableWrap>
      ) : (
        <div style={{ color: color.mut, fontSize: font.sm }}>No se escaneó feria.</div>
      )}
    </>
  )
}
