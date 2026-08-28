'use client'

/**
 * Calendario editorial — cuándo se necesita cada cosa.
 *
 * # Por qué esta pantalla existe
 *
 * No había ningún lugar donde vivieran las fechas. Las comerciales se recordaban tarde (el Día de
 * la Madre quince días antes, cuando ya no hay tiempo de producir una pieza) y los lanzamientos
 * propios vivían en la cabeza de cada uno. Es la mitad "cuándo lo necesitás" del problema; la otra
 * mitad —"qué falta"— la contesta `/meta-ads/etapas`.
 *
 * **Sueltas son dos pantallas informativas; juntas producen un pedido.** De ahí el renglón "Etapas
 * armadas" de cada fila: no dice sólo que el Día de la Madre es en 34 días, dice que en 34 días es
 * el Día de la Madre y que **no hay ni una idea de la segunda etapa anotada**. Eso es lo único que
 * hace que alguien se ponga a craneаr hoy.
 *
 * # Las cinco decisiones de diseño que no son cosméticas
 *
 *  1. **Arranca en la lista, no en la grilla.** La lista es la que hace actuar (los días que faltan
 *     en grande, el pedido al lado); la grilla es contexto para ubicarse. Encima en el celular la
 *     grilla no se lee, y la lista sí.
 *  2. **Una fecha estimada NUNCA se dibuja como firme.** Chip ámbar y botón para confirmarla. Una
 *     fecha inventada presentada como cierta es peor que no tener la fecha: el equipo planifica
 *     contra un dato falso y cuando se entera ya es tarde.
 *  3. **Los días que faltan van en grande y la decisión abajo.** "Faltan 34 días" tranquiliza; con
 *     cuánta fuerza la vamos a jugar es lo que mueve.
 *  4. 🔴 **La urgencia NO se deduce: la pone una persona.** La pantalla nació anunciando "ya habría
 *     que estar produciendo" cuando el `anticipoDias` del catálogo había vencido, sin que nadie
 *     hubiera decidido trabajar esa fecha. Es falso —si estas marcas se suman al Día del Niño
 *     depende del stock y de las manos que haya, no del almanaque— y encima es caro: un aviso que
 *     se ignora doce veces enseña a ignorar el número trece, que sí importaba. Ahora el catálogo
 *     pone las fechas sobre la mesa, alguien marca fuerte / suave / pasamos, y **la ausencia de
 *     decisión se dibuja como la pregunta abierta que es**, no como un default inventado.
 *  5. **Una sola pantalla para las dos marcas, con las decisiones separadas.** Marketing es un
 *     equipo solo: tener que cambiar el selector del header para ver lo de la otra marca era
 *     cruzar dos listas de memoria, o sea el trabajo que esta pantalla vino a evitar. Pero
 *     unificar la vista no es unificar la decisión: las fechas son del almanaque y valen para las
 *     dos, mientras que con cuánta fuerza jugamos cada una es de cada marca (BDI le va fuerte al
 *     Día del Niño y Zattia pasa, y eso es normal). Por eso una fila y **un renglón de decisión
 *     por marca**. Las bases siguen siendo dos, una por marca: no se migró nada.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { MarcaChip } from '@/components/ui/MarcaChip'
import { CUENTAS } from '@/lib/cuentas'
import type { Marca } from '@/lib/nav.datos'
import { marcasConAcceso } from '@/lib/permisos'
import {
  apagaLaFila, diasEntre, fechaComercialDe, hoyIso, iso, juegaLaFecha,
  laQueAprieta, PRIORIDADES, prioridadDe, proximas, sinDecidir, TIPOS_HITO, unificar,
  type BaseUnificada, type DecisionFecha, type EntradaCalendario, type FechaFijada,
  type FilaUnificada, type Hito, type Prioridad,
} from '@/lib/calendario'
import {
  borrarHito, decidirFecha, desfijarFecha, fijarFecha, guardarHito, indecidirFecha,
  leerCalendarioDeMarcas, nuevoIdHito,
} from '@/lib/calendario/persistencia'
import { celdasDelMes, DIAS_GRILLA, MESES, rotuloFecha } from '@/lib/fechas/semana'
import { ETIQUETA_ETAPA } from '@/lib/meta-ads/etapas'
import { ETAPAS } from '@/lib/meta-ads/etapas'
import type { Etapa } from '@/lib/meta-ads/tipos'
import { FORMATOS_IDEA, guardarIdea, leerIdeas, nuevoIdIdea, type Idea } from '@/lib/meta-ads/ideas'
import {
  Button, Card, EmptyState, Field, Input, Modal, Notice, Select, StatusPill, Tabs, useToast,
  color, font, radius, space, weight,
} from '@/components/ui'

/**
 * Hasta dónde mira "lo que se viene".
 *
 * 🔴 **El default son 6 meses, no 3, y el cambio no es cosmético.** Arrancó en 90 días porque la
 * pantalla servía para *avisar*: un trimestre alcanza para no llegar tarde a lo que viene. Desde que
 * sirve para **decidir** con cuánta fuerza jugamos cada fecha, 90 días es un techo que estorba —
 * parado en agosto cortaba el 2 de noviembre y no se podía decidir ni Black Friday ni Navidad, que
 * son justamente las que hay que resolver con tiempo. No se puede decidir lo que no se ve.
 *
 * Sigue siendo elegible porque las dos lecturas son válidas: "qué tengo encima" y "qué queda por
 * resolver este año".
 */
const VENTANAS = [
  { key: '90', label: '3 meses', dias: 90 },
  { key: '180', label: '6 meses', dias: 180 },
  { key: '365', label: 'Todo el año', dias: 365 },
]
const VENTANA_DEFAULT = '180'

/**
 * Los nombres de los días y de los meses, y el armado de la grilla, viven en `lib/fechas/semana.ts`
 * desde que el mes de la Agenda operativa pinta la misma cuadrícula. Acá quedaron sueltos mientras
 * fueron de esta pantalla; con dos consumidores, la copia sería el camino corto a que una de las dos
 * grillas empiece la semana un día distinto que la otra.
 */

/** `180` → `los próximos 6 meses`. Para no repetir "en los próximos 180 días", que nadie piensa así. */
function rotuloVentana(dias: number): string {
  if (dias >= 365) return 'los próximos 12 meses'
  return `los próximos ${Math.round(dias / 30)} meses`
}

const TODAS_LAS_MARCAS = Object.keys(CUENTAS) as Marca[]

/** Lo que trajo cada marca. Se guarda por separado porque la decisión y las ideas son de cada una. */
type DatosMarca = {
  hitos: Hito[]
  fijadas: FechaFijada[]
  decisiones: DecisionFecha[]
  ideas: Idea[]
  ideasCaidas: boolean
  error: string | null
}

export function Calendario() {
  const { marca, perfil } = useSesion()
  const toast = useToast()
  const [vista, setVista] = useState<'lista' | 'mes'>('lista')
  const [ventana, setVentana] = useState(VENTANA_DEFAULT)
  const dias = VENTANAS.find((v) => v.key === ventana)?.dias ?? 180
  const [editando, setEditando] = useState<{ marca: Marca; hito: Partial<Hito> } | null>(null)
  const [anotando, setAnotando] = useState<{ marca: Marca; e: EntradaCalendario } | null>(null)
  const [confirmando, setConfirmando] = useState<FilaUnificada | null>(null)
  const [decidiendo, setDecidiendo] = useState<{ marca: Marca; e: EntradaCalendario; prioridad: Prioridad } | null>(null)

  /**
   * 🔑 **Marketing es un equipo solo: la pantalla muestra las dos marcas juntas.**
   *
   * Antes era una marca por vez y había que cambiar el selector del header para ver lo de la otra,
   * o sea cruzar dos listas de memoria — que es exactamente el trabajo que este calendario vino a
   * sacarle a alguien de la cabeza.
   *
   * La regla de quién ve qué **se reusa, no se inventa**: `marcasConAcceso` es la misma que usan
   * Inicio, Solicitudes y Gerencial. Respeta la cuenta fija (y le gana incluso al admin) y contempla
   * que alguien vea Calendario en BDI y no en Zattia. La marca del header sigue mandando en dos
   * cosas: va primera en cada fila y es el default de lo que se carga.
   */
  const marcas = useMemo(() => {
    const puede = marcasConAcceso(perfil, 'calendario', TODAS_LAS_MARCAS)
    const lista = puede.length ? puede : [marca]
    return [...lista].sort((a, b) => Number(b === marca) - Number(a === marca))
  }, [perfil, marca])
  const varias = marcas.length > 1

  // Todo lo cargado viaja en UN estado sellado con su clave, como en `Etapas.tsx`. Así el `setState`
  // vive siempre adentro de la promesa (nunca en el cuerpo del efecto, que dispara renders en
  // cascada) y una respuesta vieja de la marca anterior no puede pisar a la nueva.
  const [datos, setDatos] = useState<{ key: string; porMarca: Partial<Record<Marca, DatosMarca>> } | null>(null)
  const [nonce, setNonce] = useState(0)

  const hoy = hoyIso()
  const key = `${marcas.join(',')}|${nonce}`

  useEffect(() => {
    let vivo = true
    void (async () => {
      // Las ideas van aparte y su falla NO tumba el calendario: son el enganche, no el contenido.
      // Si la tabla todavía no está migrada en una marca, el calendario tiene que seguir sirviendo
      // y lo único que se pierde es el renglón "Etapas armadas" de esa marca.
      const [cals, ideas] = await Promise.all([
        leerCalendarioDeMarcas(marcas),
        Promise.all(marcas.map(async (m) => {
          try {
            return { marca: m, ideas: (await leerIdeas(m)).ideas, caidas: false }
          } catch {
            return { marca: m, ideas: [] as Idea[], caidas: true }
          }
        })),
      ])
      const porMarca: Partial<Record<Marca, DatosMarca>> = {}
      for (const c of cals) {
        const i = ideas.find((x) => x.marca === c.marca)
        porMarca[c.marca] = {
          hitos: c.hitos,
          fijadas: c.fijadas,
          decisiones: c.decisiones,
          ideas: i?.ideas ?? [],
          ideasCaidas: !!i?.caidas,
          error: c.error,
        }
      }
      if (vivo) setDatos({ key: `${marcas.join(',')}|${nonce}`, porMarca })
    })()
    return () => { vivo = false }
  }, [marcas, nonce])

  const recargar = useCallback(() => setNonce((n) => n + 1), [])

  const cargando = !datos || datos.key !== key

  /** Una lista por marca — `proximas()` sigue siendo de a una, ver el docblock de `unificar()`. */
  const entradasPorMarca = useMemo(() => {
    const out: Partial<Record<Marca, EntradaCalendario[]>> = {}
    for (const m of marcas) {
      const d = datos?.porMarca[m]
      out[m] = proximas(hoy, dias, {
        fijadas: d?.fijadas ?? [],
        hitos: d?.hitos ?? [],
        ideas: d?.ideas ?? [],
        decisiones: d?.decisiones ?? [],
      })
    }
    return out
  }, [hoy, dias, datos, marcas])

  const filas = useMemo(() => unificar(entradasPorMarca, marcas), [entradasPorMarca, marcas])

  async function guardar(m: Marca, h: Partial<Hito>) {
    try {
      await guardarHito(m, {
        ...h,
        id: h.id || nuevoIdHito(),
        titulo: String(h.titulo || ''),
        fecha: String(h.fecha || ''),
      })
      setEditando(null)
      toast.ok('Hito guardado.')
      recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }

  async function borrar(m: Marca, id: string) {
    try {
      await borrarHito(m, id)
      setEditando(null)
      toast.ok('Hito eliminado.')
      recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar.')
    }
  }

  async function anotar(m: Marca, e: EntradaCalendario, d: { etapa: Etapa; titulo: string; formato: string; gancho: string }) {
    try {
      await guardarIdea(m, {
        id: nuevoIdIdea(),
        etapa: d.etapa,
        titulo: d.titulo,
        formato: d.formato,
        gancho: d.gancho || null,
        evento: e.id,
      })
      setAnotando(null)
      toast.ok(`Idea anotada para ${e.titulo}.`)
      recargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo anotar la idea.')
    }
  }

  /**
   * Confirmar la fecha real **se escribe en todas las marcas de la fila**, y ésa es la única acción
   * de la pantalla que no es por marca.
   *
   * No es una inconsistencia con la prioridad: son dos cosas distintas. Con cuánta fuerza jugamos el
   * Día del Niño es una decisión, y BDI y Zattia pueden decidir distinto. Qué día cae el Hot Sale es
   * un hecho del mundo que anunció una cámara — es el mismo día para las dos, y hacerlo tipear dos
   * veces sólo agrega la chance de que una de las bases quede con la fecha vieja.
   *
   * 🔴 **Va a todas las marcas, no sólo a las que la tienen estimada.** Mientras el destino salía de
   * `marcasEstimadas()`, corregir era imposible: la marca que había confirmado quedaba afuera del
   * lazo, así que el día viejo sobrevivía a la corrección y `desfijar` no borraba nada. Con `fecha`
   * vacía esto vuelve a la estimación del catálogo; el DELETE de la que no tenía fila es un no-op.
   */
  async function confirmar(fila: FilaUnificada, fecha: string) {
    const clave = fila.id.split(':')[1]
    const anio = Number(fila.id.split(':')[2])
    try {
      for (const m of fila.marcas) {
        if (fecha) await fijarFecha(m, clave, anio, fecha)
        else await desfijarFecha(m, clave, anio)
      }
      setConfirmando(null)
      toast.ok(fecha ? 'Fecha confirmada.' : 'Vuelve a mostrarse como estimada.')
      recargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo confirmar la fecha.')
    }
  }

  /**
   * `pasamos` guarda de una: no hay nada que producir, así que pedir una fecha de arranque sería
   * pedir un dato que no existe. Jugarla abre el modal con el arranque sugerido para confirmar —
   * el catálogo prellena, la persona decide.
   */
  async function elegirPrioridad(m: Marca, e: EntradaCalendario, prioridad: Prioridad) {
    if (juegaLaFecha(prioridad)) return setDecidiendo({ marca: m, e, prioridad })
    await decidir(m, e, prioridad, null)
  }

  async function decidir(m: Marca, e: EntradaCalendario, prioridad: Prioridad, arrancar: string | null) {
    try {
      await decidirFecha(m, e.id, prioridad, arrancar)
      setDecidiendo(null)
      toast.ok(`${e.titulo}: ${prioridadDe(prioridad)?.label.toLowerCase()}.`)
      recargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar la prioridad.')
    }
  }

  async function indecidir(m: Marca, e: EntradaCalendario) {
    try {
      await indecidirFecha(m, e.id)
      setDecidiendo(null)
      toast.ok(`${e.titulo} vuelve a quedar sin decidir.`)
      recargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo volver atrás.')
    }
  }

  // Las bandas de arriba se calculan **por marca**: qué aprieta y cuánto falta por decidir son
  // preguntas de cada una, y promediarlas daría un número que no es de nadie.
  const aprietan = useMemo(
    () => marcas
      .map((m) => ({ marca: m, e: laQueAprieta(entradasPorMarca[m] ?? []) }))
      .filter((x): x is { marca: Marca; e: EntradaCalendario } => !!x.e),
    [marcas, entradasPorMarca],
  )
  const pendientes = useMemo(
    () => marcas
      .map((m) => ({ marca: m, lista: sinDecidir(entradasPorMarca[m] ?? []) }))
      .filter((x) => x.lista.length > 0),
    [marcas, entradasPorMarca],
  )
  /**
   * Las marcas que deben exactamente lo mismo van en un renglón solo, con los dos chips.
   *
   * 🔑 El estado normal hoy es que ninguna decidió nada, así que la banda salía dos veces con el
   * mismo número y los mismos cuatro nombres — dos párrafos idénticos antes de la primera fecha.
   * Agrupar por la lista y no por el largo es a propósito: dos marcas pueden deber cuatro fechas
   * **distintas**, y ahí decir "BDI y Zattia deben 4" sería un número que no es de ninguna de las
   * dos. Se juntan cuando deben las mismas; si no, siguen separadas.
   */
  const gruposPendientes = useMemo(() => {
    const porLista = new Map<string, { marcas: Marca[]; lista: EntradaCalendario[] }>()
    for (const { marca: m, lista } of pendientes) {
      const clave = lista.map((e) => e.id).join('|')
      const ya = porLista.get(clave)
      if (ya) ya.marcas.push(m)
      else porLista.set(clave, { marcas: [m], lista })
    }
    return [...porLista.values()]
  }, [pendientes])
  const caidas = marcas.filter((m) => datos?.porMarca[m]?.error)
  const sinIdeas = marcas.filter((m) => datos?.porMarca[m]?.ideasCaidas)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <Tabs
          items={[{ key: 'lista', label: 'Lo que se viene' }, { key: 'mes', label: 'Mes' }]}
          value={vista}
          onChange={(k) => setVista(k as 'lista' | 'mes')}
        />
        <Select value={ventana} onChange={(e) => setVentana(e.target.value)} style={{ width: 140 }}>
          {VENTANAS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
        </Select>
        <div style={{ flex: 1 }} />
        <Button variant="solid" onClick={() => setEditando({ marca, hito: { fecha: hoy, firme: false, tipo: 'lanzamiento' } })}>
          Cargar algo nuestro
        </Button>
      </div>

      {/* La marca que falló se nombra: si no, "no se pudo leer el calendario" con la otra media
          pantalla llena parece que falló todo, y nadie sabe qué está viendo. */}
      {caidas.map((m) => (
        <Notice key={m} tone="danger">
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
            {varias && <MarcaChip marca={m} />}
            <span>{datos?.porMarca[m]?.error}</span>
          </div>
        </Notice>
      ))}

      {sinIdeas.length > 0 && (
        <Notice tone="neutral">
          <div style={{ fontSize: font.sm, lineHeight: 1.5 }}>
            {varias && <b>{sinIdeas.map(nombreMarca).join(' y ')}: </b>}
            no se pudieron leer las ideas de creativos, así que el renglón <b>Etapas armadas</b> no
            se muestra. El resto del calendario funciona igual. Si es la primera vez, puede faltar
            correr <code>node scripts/apply-meta-funnel.mjs</code>.
          </div>
        </Notice>
      )}

      {/*
        La banda de arriba dice lo que decidimos, no lo que dedujo una resta.
        Antes anunciaba "ya habría que estar produciendo" para cualquier fecha del catálogo cuyo
        anticipo hubiera vencido — el Día del Niño incluido, que estas dos marcas casi no trabajan.
        Un aviso que se ignora doce veces enseña a ignorar el número trece.
      */}
      {aprietan.length > 0 && (
        <Notice tone={aprietan.some((a) => a.e.arrancarEn !== null && a.e.arrancarEn <= 0) ? 'warning' : 'neutral'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            {aprietan.map(({ marca: m, e }) => (
              <div key={m}>
                <div style={{ fontSize: font.md, fontWeight: weight.bold, display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                  {varias && <MarcaChip marca={m} />}
                  <span>
                    {e.titulo} es en {e.faltan} {e.faltan === 1 ? 'día' : 'días'}
                    {e.arrancarEn === null
                      ? ` y le vamos ${prioridadDe(e.prioridad)?.corto.toLowerCase()}.`
                      : e.arrancarEn <= 0
                        ? `: pusiste arrancar el ${rotuloFecha(e.arrancar!)} y ya pasó.`
                        : `: pusiste arrancar en ${e.arrancarEn} ${e.arrancarEn === 1 ? 'día' : 'días'}.`}
                  </span>
                </div>
                <div style={{ fontSize: font.sm, marginTop: space[1], lineHeight: 1.5 }}>
                  {e.arrancarEn === null ? 'Falta poner desde cuándo hay que producirla.' : e.detalle}
                </div>
              </div>
            ))}
          </div>
        </Notice>
      )}

      {!cargando && gruposPendientes.length > 0 && (
        <Notice tone="neutral">
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            {gruposPendientes.map(({ marcas: suyas, lista }) => (
              <div key={suyas.join('|')}>
                <div style={{ fontSize: font.md, fontWeight: weight.bold, display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                  {varias && suyas.map((m) => <MarcaChip key={m} marca={m} />)}
                  <span>
                    {lista.length === 1
                      ? `Hay 1 fecha sin decidir en ${rotuloVentana(dias)}.`
                      : `Hay ${lista.length} fechas sin decidir en ${rotuloVentana(dias)}.`}
                  </span>
                </div>
                <div style={{ fontSize: font.sm, marginTop: space[1], lineHeight: 1.5 }}>
                  {lista.slice(0, 4).map((e) => `${e.titulo} (${e.faltan} d)`).join(' · ')}
                  {lista.length > 4 ? ` y ${lista.length - 4} más abajo` : ''}.
                </div>
              </div>
            ))}
            <div style={{ fontSize: font.sm, lineHeight: 1.5 }}>
              Marcá con cuánta fuerza vamos a cada una: sin eso, el calendario no puede decir qué
              aprieta ni pedirle creativos a Etapas de la pauta.
            </div>
          </div>
        </Notice>
      )}

      {cargando ? (
        <Card style={{ color: color.mut2 }}>Leyendo el calendario…</Card>
      ) : vista === 'lista' ? (
        <Lista
          filas={filas}
          dias={dias}
          varias={varias}
          sinIdeas={sinIdeas}
          onAnotar={(m, e) => setAnotando({ marca: m, e })}
          onConfirmar={setConfirmando}
          onPrioridad={elegirPrioridad}
          onCambiar={(m, e) => setDecidiendo({ marca: m, e, prioridad: e.prioridad || e.prioridadSugerida || 'fuerte' })}
          onEditar={(m, id) => {
            const h = (datos?.porMarca[m]?.hitos ?? []).find((x) => x.id === id)
            if (h) setEditando({ marca: m, hito: h })
          }}
        />
      ) : (
        <Grilla filas={filas} hoy={hoy} varias={varias} />
      )}

      {editando && (
        <ModalHito
          hito={editando.hito}
          marca={editando.marca}
          marcas={marcas}
          onMarca={(m) => setEditando({ marca: m, hito: editando.hito })}
          onCerrar={() => setEditando(null)}
          onGuardar={(h) => guardar(editando.marca, h)}
          onBorrar={editando.hito.id ? () => borrar(editando.marca, String(editando.hito.id)) : undefined}
          puedeBorrar={!!editando.hito.id && (String(editando.hito.creadoPor || '') === String(perfil?.name || ''))}
        />
      )}

      {anotando && (
        <ModalIdea
          entrada={anotando.e}
          marca={anotando.marca}
          varias={varias}
          onCerrar={() => setAnotando(null)}
          onAnotar={(e, d) => anotar(anotando.marca, e, d)}
        />
      )}

      {confirmando && (
        <ModalConfirmarFecha
          fila={confirmando}
          varias={varias}
          onCerrar={() => setConfirmando(null)}
          onConfirmar={confirmar}
        />
      )}

      {decidiendo && (
        <ModalDecidir
          entrada={decidiendo.e}
          marca={decidiendo.marca}
          varias={varias}
          prioridad={decidiendo.prioridad}
          hoy={hoy}
          onCerrar={() => setDecidiendo(null)}
          onGuardar={(e, p, a) => decidir(decidiendo.marca, e, p, a)}
          onSoltar={() => indecidir(decidiendo.marca, decidiendo.e)}
        />
      )}
    </div>
  )
}

const nombreMarca = (m: Marca) => (m === 'zattia' ? 'Zattia' : 'BDI')

// ── Lo que se viene ──────────────────────────────────────────────────────────────────────────

function Lista({ filas, dias, varias, sinIdeas, onAnotar, onConfirmar, onPrioridad, onCambiar, onEditar }: {
  filas: FilaUnificada[]
  dias: number
  varias: boolean
  sinIdeas: Marca[]
  onAnotar: (m: Marca, e: EntradaCalendario) => void
  onConfirmar: (f: FilaUnificada) => void
  onPrioridad: (m: Marca, e: EntradaCalendario, p: Prioridad) => void
  onCambiar: (m: Marca, e: EntradaCalendario) => void
  onEditar: (m: Marca, id: string) => void
}) {
  if (!filas.length) {
    return (
      <EmptyState
        title={`No hay nada en ${rotuloVentana(dias)}`}
        hint="Las fechas comerciales se calculan solas; lo propio (lanzamientos, sesiones, llegada de mercadería) se carga con el botón de arriba."
        dashed
      />
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
      {filas.map((f) => (
        <Fila
          key={f.key} fila={f} varias={varias} sinIdeas={sinIdeas}
          onAnotar={onAnotar} onConfirmar={onConfirmar} onPrioridad={onPrioridad}
          onCambiar={onCambiar} onEditar={onEditar}
        />
      ))}
    </div>
  )
}

/**
 * Una fecha, con **un renglón de decisión por marca**.
 *
 * 🔑 Lo de arriba (el día, el título, por qué está en la lista) es del almanaque y vale para las
 * dos. Lo de abajo —con cuánta fuerza la jugamos y qué ideas hay anotadas— es de cada marca, y por
 * eso va en bloques separados con su chip. Un solo renglón para las dos obligaría a elegir la
 * decisión de una y mostrarla como si fuera del equipo entero.
 *
 * Con una sola marca visible no hay chips: la fila se lee igual que cuando la pantalla era de a una.
 */
function Fila({ fila, varias, sinIdeas, onAnotar, onConfirmar, onPrioridad, onCambiar, onEditar }: {
  fila: FilaUnificada
  varias: boolean
  sinIdeas: Marca[]
  onAnotar: (m: Marca, e: EntradaCalendario) => void
  onConfirmar: (f: FilaUnificada) => void
  onPrioridad: (m: Marca, e: EntradaCalendario, p: Prioridad) => void
  onCambiar: (m: Marca, e: EntradaCalendario) => void
  onEditar: (m: Marca, id: string) => void
}) {
  const b = fila.base
  const entradas = fila.marcas.map((m) => ({ marca: m, e: fila.porMarca[m]! }))

  // 🔴 Urgente sólo si una persona puso desde cuándo producir y esa fecha ya pasó. Antes salía de
  // `faltan <= anticipoDias`, o sea del catálogo: la mitad de las filas aparecían en ámbar sin que
  // nadie hubiera decidido trabajarlas.
  const urgenteDe = (e: EntradaCalendario) => juegaLaFecha(e.prioridad) && e.arrancarEn !== null && e.arrancarEn <= 0
  // Alcanza con que UNA marca esté apurada para que la fila se pinte: el borde ámbar es "acá hay
  // algo atrasado", y el renglón de esa marca dice de quién.
  const urgente = entradas.some((x) => urgenteDe(x.e))
  // Una fecha que dejamos pasar se apaga en vez de esconderse: sigue estando (para no volver a
  // discutirla) pero deja de competir por la atención con las que sí vamos a trabajar. Con dos
  // marcas se apaga sólo si **las dos** pasan: si una la juega, la fila es de las que importan.
  // ⚠️ `institucional` NO apaga: está decidida y se ve normal, sólo que no reclama producción.
  const apagada = entradas.every((x) => apagaLaFila(x.e.prioridad))

  return (
    <div
      style={{
        display: 'flex', gap: space[4], alignItems: 'flex-start', flexWrap: 'wrap',
        border: `1px solid ${urgente ? color.warningBorder : color.line}`,
        background: color.surface, borderRadius: radius.xl, padding: space[4],
        opacity: apagada ? 0.6 : 1,
      }}
    >
      {/* Los días que faltan, en grande. Es el dato que se busca al entrar. */}
      <div style={{ minWidth: 68, textAlign: 'center' }}>
        <div style={{ fontSize: font['2xl'], fontWeight: weight.heavy, color: urgente ? color.warningInk : color.ink, lineHeight: 1 }}>
          {b.faltan}
        </div>
        <div style={{ fontSize: font.xs, color: color.mut2 }}>{b.faltan === 1 ? 'día' : 'días'}</div>
      </div>

      <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: space[1.5] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          <span style={{ fontSize: font.md, fontWeight: weight.bold, color: color.ink }}>{b.titulo}</span>
          <span style={{ fontSize: font.sm, color: color.mut }}>
            {rotuloFecha(b.fecha)}{b.hora ? ` · ${b.hora}` : ''}
          </span>
          <ChipCerteza base={b} marcas={marcasEstimadas(fila)} varias={varias} />
          {/* Un hito es de una base sola: el chip acá arriba dice de quién es sin repetirlo abajo. */}
          {varias && b.clase === 'hito' && <MarcaChip marca={fila.marcas[0]} />}
          {b.tipoHito && <span style={{ fontSize: font.xs, color: color.mut2 }}>{TIPOS_HITO.find((t) => t.key === b.tipoHito)?.label || b.tipoHito}</span>}
        </div>

        {/* Dos marcas con la misma fecha confirmada en días distintos son dos filas. Decirlo acá
            evita el "esto ya lo vi más arriba" y apunta a lo único que lo arregla. */}
        {fila.discrepa && (
          <div style={{ fontSize: font.xs, color: color.warningInk, lineHeight: 1.45 }}>
            Esta fecha está confirmada en días distintos según la marca — por eso aparece dos veces.
            Confirmala igual en las dos y vuelven a juntarse.
          </div>
        )}

        {entradas.map(({ marca: m, e }) => {
          const apagadaM = apagaLaFila(e.prioridad)
          return (
            <div key={m} style={{ display: 'flex', flexDirection: 'column', gap: space[1], opacity: apagadaM && !apagada ? 0.65 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                {varias && b.clase === 'comercial' && <MarcaChip marca={m} />}
                {b.clase === 'comercial' && (
                  <Decision e={e} urgente={urgenteDe(e)} onPrioridad={(x, p) => onPrioridad(m, x, p)} onCambiar={(x) => onCambiar(m, x)} />
                )}
                {!apagadaM && <Button size="sm" variant="soft" onClick={() => onAnotar(m, e)}>Anotar idea</Button>}
              </div>

              {/* El renglón de etapas se dibuja sólo cuando la fecha pide producción de verdad. Una
                  que dejamos pasar no necesita creativos, y un feriado en `institucional` tampoco:
                  mostrarle tres etapas vacías haría parecer que falta trabajo que nadie va a hacer.
                  Sin decidir SÍ se dibuja — es lo que hace que valga la pena decidir. */}
              {!sinIdeas.includes(m) && (!e.prioridad || juegaLaFecha(e.prioridad)) && <Cobertura e={e} />}
            </div>
          )
        })}

        {b.detalle && <div style={{ fontSize: font.sm, color: color.mut2, lineHeight: 1.45 }}>{b.detalle}</div>}

        {/* Un hito lo cargó alguien; una comercial no la cargó nadie —la trae el catálogo— y lo
            único que puso una persona es el día. Decir "cargado por" en las dos era contar algo que
            no pasó, y encima salía de `base`, o sea de la marca que el header pusiera primera: el
            renglón aparecía parado en BDI y desaparecía parado en Zattia. */}
        {b.clase === 'hito'
          ? b.creadoPor && <div style={{ fontSize: font.xs, color: color.mut2 }}>Cargado por {b.creadoPor}</div>
          : confirmaronLaFecha(fila).length > 0 && (
            <div style={{ fontSize: font.xs, color: color.mut2 }}>
              Fecha confirmada por {confirmaronLaFecha(fila).join(' y ')}
            </div>
          )}
      </div>

      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Sale de `seConfirma`, no de la certeza: una fecha que pone una cámara se puede tocar
            SIEMPRE. Con `certeza === 'estimada'` el botón desaparecía al confirmarla y una fecha
            confirmada con el día equivocado apagaba el chip ámbar y no había forma de corregirla
            desde la pantalla. Ámbar sólo mientras falte confirmarla: después ya no reclama nada. */}
        {b.seConfirma && (
          <Button
            size="sm"
            variant="ghost"
            tone={b.certeza === 'estimada' ? 'warning' : 'neutral'}
            onClick={() => onConfirmar(fila)}
          >
            {b.certeza === 'estimada' ? 'Confirmar fecha' : 'Corregir la fecha'}
          </Button>
        )}
        {b.clase === 'hito' && (
          <Button size="sm" variant="ghost" onClick={() => onEditar(fila.marcas[0], b.id.replace(/^hito:/, ''))}>Editar</Button>
        )}
      </div>
    </div>
  )
}

/** Las marcas de la fila donde la fecha todavía está sin confirmar. */
function marcasEstimadas(fila: FilaUnificada): Marca[] {
  return fila.marcas.filter((m) => fila.porMarca[m]?.certeza === 'estimada')
}

/**
 * Quién confirmó el día de una comercial, sin repetidos y **sin depender del orden del header**.
 *
 * Se lee de `porMarca` y se ordena: `base.creadoPor` es el de la primera marca que entró al mapa, y
 * como la fecha puede estar confirmada en una base y no en la otra, leerlo de ahí hacía que el dato
 * apareciera o desapareciera según qué marca estuviera seleccionada arriba.
 */
function confirmaronLaFecha(fila: FilaUnificada): string[] {
  const nombres = new Set<string>()
  for (const m of fila.marcas) {
    const por = fila.porMarca[m]?.creadoPor
    if (por) nombres.add(por)
  }
  return [...nombres].sort()
}

/**
 * Con cuánta fuerza jugamos esta fecha — la decisión que antes tomaba una resta.
 *
 * Sin decidir **no se dibuja como un estado neutro**: se dibuja como la pregunta abierta que es, con
 * los tres botones a la vista. Es lo único que la pantalla pide, y pedirlo con un `<Select>` que ya
 * muestra un valor haría parecer que alguien decidió. La ausencia de decisión tiene que verse.
 */
function Decision({ e, urgente, onPrioridad, onCambiar }: {
  e: EntradaCalendario
  urgente: boolean
  onPrioridad: (e: EntradaCalendario, p: Prioridad) => void
  onCambiar: (e: EntradaCalendario) => void
}) {
  if (!e.prioridad) {
    // El peldaño sugerido va primero y resaltado; los otros tres quedan disponibles igual. Un
    // feriado sugiere `institucional` y una comercial `fuerte`, pero ninguno de los dos es un techo:
    // el 9 de julio en año de Mundial se sube a `fuerte` desde acá mismo.
    const sug = e.prioridadSugerida
    const orden = [...PRIORIDADES].sort((a, b) => Number(b.key === sug) - Number(a.key === sug))
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <span style={{ fontSize: font.sm, color: color.ink2, fontWeight: weight.semibold }}>
          {e.tipo === 'feriado' || e.tipo === 'efemeride' ? '¿Subimos algo?' : '¿Nos sumamos?'}
        </span>
        {orden.map((p) => (
          <Button
            key={p.key} size="sm" variant={p.key === sug ? 'soft' : 'ghost'} title={p.ayuda}
            onClick={() => onPrioridad(e, p.key)}
          >
            {p.corto}
          </Button>
        ))}
        <InfoPopover titulo="Por qué lo pregunta en vez de deducirlo">
          <p>
            El calendario sabe <b>cuándo</b> es cada fecha. No puede saber si estas marcas se suman:
            eso depende del stock, de si la fecha le habla al público y de si hay manos esa semana.
          </p>
          <p>
            Antes lo deducía de un anticipo del catálogo y avisaba «ya habría que estar produciendo»
            para fechas que nadie pensaba trabajar. Un aviso que se ignora doce veces enseña a
            ignorar el número trece, que sí importaba.
          </p>
          <p>
            Un feriado o una efeméride arrancan sugiriendo <b>algo institucional</b> —subimos una
            pieza y listo—, pero eso no es un techo: si ese año la fecha vale la pena (un 9 de julio
            en año de Mundial), se la sube a <b>suave</b> o <b>fuerte</b> y pide creativos como
            cualquier otra.
          </p>
          <p>
            Lo que elijas vale <b>para esta marca y este año</b>: el que viene se vuelve a preguntar,
            así que lo que subiste una vez no queda subido para siempre.
          </p>
        </InfoPopover>
      </div>
    )
  }

  const p = prioridadDe(e.prioridad)!
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
      <StatusPill tone={e.prioridad === 'fuerte' ? 'success' : 'neutral'} label={p.label.toLowerCase()} />
      {p.arrastraProduccion && (
        <span
          style={{
            fontSize: font.sm,
            color: urgente ? color.warningInk : color.mut,
            fontWeight: urgente ? weight.semibold : weight.normal,
          }}
        >
          {e.arrancar === null
            ? 'falta poner desde cuándo producirla'
            : urgente
              ? `había que arrancar el ${rotuloFecha(e.arrancar)}`
              : `arrancar el ${rotuloFecha(e.arrancar)}${e.arrancarEn !== null ? ` (en ${e.arrancarEn} ${e.arrancarEn === 1 ? 'día' : 'días'})` : ''}`}
        </span>
      )}
      <Button size="sm" variant="ghost" onClick={() => onCambiar(e)}>Cambiar</Button>
    </div>
  )
}

/**
 * El renglón que convierte una fecha en un pedido: cuántas ideas hay anotadas por etapa.
 *
 * Cuenta las ideas vivas, no las producidas: la pregunta que contesta es "¿hay alguien pensando
 * esto?". Si sólo contara las terminadas, diría "no hay nada de la segunda etapa" con cuatro ideas
 * anotadas y el equipo dejaría de creerle en una semana.
 */
function Cobertura({ e }: { e: EntradaCalendario }) {
  const total = ETAPAS.reduce((t, x) => t + (e.cobertura[x] || 0), 0)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', marginTop: space[1] }}>
      <span style={{ fontSize: font.xs, color: color.mut2 }}>Etapas armadas:</span>
      {ETAPAS.map((x) => {
        const n = e.cobertura[x] || 0
        return (
          <span
            key={x}
            title={n ? `${n} idea${n === 1 ? '' : 's'} anotada${n === 1 ? '' : 's'}` : 'Nadie anotó nada para esta etapa'}
            style={{
              fontSize: font.xs, display: 'inline-flex', alignItems: 'center', gap: 4,
              color: n ? color.successInk : color.mut2,
              // La que falta va punteada y sin relleno, igual que la tarjeta vacía de Etapas de la
              // pauta: el hueco se tiene que ver, no leerse.
              border: `1px ${n ? 'solid' : 'dashed'} ${n ? color.successBorder : color.line}`,
              background: n ? color.successBg : 'transparent',
              borderRadius: radius.pill, padding: '2px 8px',
            }}
          >
            {n ? '✓' : '✗'} {ETIQUETA_ETAPA[x]}{n > 1 ? ` (${n})` : ''}
          </span>
        )
      })}
      {total === 0 && <span style={{ fontSize: font.xs, color: color.mut2 }}>— todavía no hay nada pensado</span>}
    </div>
  )
}

/**
 * `marcas` son las que todavía la tienen estimada. Si una confirmó y la otra no, el chip **sigue
 * puesto** y dice en cuál falta: dar por firme una fecha que en una de las dos bases nadie confirmó
 * es la forma exacta de que alguien planifique contra un dato que no existe.
 */
function ChipCerteza({ base, marcas, varias }: { base: BaseUnificada; marcas: Marca[]; varias: boolean }) {
  if (base.certeza === 'estimada') {
    const parcial = varias && marcas.length === 1
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <StatusPill tone="warning" label={parcial ? `sin confirmar en ${nombreMarca(marcas[0])}` : 'fecha estimada'} />
        <InfoPopover titulo="Por qué esta fecha no es segura">
          <p>
            Esta fecha <b>no la decide el calendario</b>: la anuncia una cámara y cambia todos los
            años. Lo que se muestra es la mejor estimación posible con la regla histórica, y por eso
            va marcada.
          </p>
          {base.comoSeConfirma && <p>{base.comoSeConfirma}</p>}
          <p>
            Cuando salga la fecha real, <b>Confirmar fecha</b> la fija para este año y el chip se
            apaga. Planificar contra una estimación presentada como firme es cómo se llega tarde.
          </p>
          {parcial && (
            <p>
              En la otra marca ya está confirmada. El chip queda hasta que lo esté en las dos, porque
              la fecha se guarda en cada base por separado.
            </p>
          )}
        </InfoPopover>
      </span>
    )
  }
  if (base.certeza === 'proyectada') return <StatusPill tone="neutral" label="proyectada" />
  return null
}

// ── La grilla del mes ────────────────────────────────────────────────────────────────────────

/**
 * Contexto, no acción: sirve para ubicarse ("¿cuánto hay entre el lanzamiento y Black Friday?").
 * Por eso no tiene botones y es la segunda pestaña — en el celular directamente no se lee bien.
 */
function Grilla({ filas, hoy, varias }: { filas: FilaUnificada[]; hoy: string; varias: boolean }) {
  const [offset, setOffset] = useState(0)
  const base = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1 + offset, 1))
  const anio = base.getUTCFullYear()
  const mes = base.getUTCMonth() + 1

  // Una comercial que las dos marcas comparten ocupa **una** celda: en un cuadrito de 76 px, verla
  // dos veces se lee como dos eventos distintos. De qué marca es sale del tooltip.
  const porDia = new Map<string, FilaUnificada[]>()
  for (const f of filas) porDia.set(f.fecha, [...(porDia.get(f.fecha) || []), f])

  // Los huecos del arranque —contados desde el LUNES— y los días, en el orden en que se pintan.
  const celdas = celdasDelMes(anio, mes)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
        <Button size="sm" variant="ghost" onClick={() => setOffset((o) => o - 1)}>‹</Button>
        <div style={{ fontSize: font.md, fontWeight: weight.bold, minWidth: 160, textAlign: 'center' }}>
          {MESES[mes - 1]} {anio}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOffset((o) => o + 1)}>›</Button>
        {offset !== 0 && <Button size="sm" variant="ghost" onClick={() => setOffset(0)}>Hoy</Button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {DIAS_GRILLA.map((d) => (
          <div key={d} style={{ fontSize: font.xs, color: color.mut2, textAlign: 'center', paddingBottom: 4 }}>{d}</div>
        ))}
        {celdas.map((d, i) => {
          if (d === null) return <div key={`v${i}`} />
          const fecha = iso(anio, mes, d)
          const items = porDia.get(fecha) || []
          const esHoy = fecha === hoy
          return (
            <div
              key={fecha}
              style={{
                minHeight: 76, padding: 6, borderRadius: radius.md,
                border: `1px solid ${esHoy ? color.brandBorder : color.line}`,
                background: esHoy ? color.brandBg : color.surface,
                display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden',
              }}
            >
              <div style={{ fontSize: font.xs, color: esHoy ? color.brand : color.mut2, fontWeight: esHoy ? weight.bold : weight.normal }}>{d}</div>
              {items.map((f) => (
                <div
                  key={f.key}
                  title={[
                    f.base.hora ? `${f.base.hora} ${f.base.titulo}` : f.base.titulo,
                    varias ? f.marcas.map(nombreMarca).join(' y ') : '',
                    f.base.certeza === 'estimada' ? 'fecha estimada' : f.base.certeza === 'proyectada' ? 'proyectada' : rotuloFecha(f.fecha),
                  ].filter(Boolean).join(' — ')}
                  style={{
                    fontSize: font.xs, lineHeight: 1.25, padding: '2px 4px', borderRadius: 4,
                    background: f.base.clase === 'comercial' ? color.brandBg : color.bg2,
                    color: f.base.clase === 'comercial' ? color.brand : color.ink2,
                    border: f.base.certeza === 'firme' ? '1px solid transparent' : `1px dashed ${color.warningBorder}`,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {/* La hora adelante, como cualquier calendario: es lo que se busca de un vistazo
                      cuando el día tiene dos cosas. Sin hora no se dibuja nada — un `00:00` diría
                      que es a la medianoche. */}
                  {f.base.hora && <span style={{ fontWeight: weight.bold }}>{f.base.hora} </span>}
                  {f.base.titulo}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Los diálogos ─────────────────────────────────────────────────────────────────────────────

function ModalHito({ hito, marca, marcas, onMarca, onCerrar, onGuardar, onBorrar, puedeBorrar }: {
  hito: Partial<Hito>
  marca: Marca
  marcas: Marca[]
  onMarca: (m: Marca) => void
  onCerrar: () => void
  onGuardar: (h: Partial<Hito>) => void
  onBorrar?: () => void
  puedeBorrar: boolean
}) {
  const [f, setF] = useState<Partial<Hito>>(hito)
  const listo = !!String(f.titulo || '').trim() && !!f.fecha
  // Un hito vive en UNA base. Al crearlo se elige (viene la del header); al editarlo ya no se puede
  // mover de marca — sería borrar de una base y crear en la otra, y el id se rompería.
  const eligeMarca = marcas.length > 1 && !hito.id

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrarConFondo={false}
      titulo={hito.id ? 'Editar' : 'Cargar algo nuestro'}
      pie={
        <>
          {puedeBorrar && onBorrar && <Button variant="ghost" tone="danger" onClick={onBorrar}>Eliminar</Button>}
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" disabled={!listo} onClick={() => onGuardar(f)}>Guardar</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Field label="Qué es" required>
          <Input
            value={String(f.titulo || '')}
            onChange={(e) => setF({ ...f, titulo: e.target.value })}
            placeholder="Lanzamiento cápsula tejidos"
            autoFocus
          />
        </Field>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          <Field label="Cuándo" required width={180}>
            <Input type="date" value={String(f.fecha || '')} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          </Field>
          {/* Opcional a propósito: vacía quiere decir "ese día", que es lo que pasa con una llegada
              de mercadería. Poner 00:00 por defecto mostraría una hora que nadie eligió. */}
          <Field label="Hora" width={140} hint="Opcional.">
            <Input
              type="time"
              value={String(f.hora || '')}
              onChange={(e) => setF({ ...f, hora: e.target.value || null })}
            />
          </Field>
          <Field label="Tipo" width={200}>
            <Select value={String(f.tipo || 'otro')} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              {TIPOS_HITO.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </Select>
          </Field>
          {eligeMarca && (
            <Field label="¿De qué marca?" width={180} hint="Viene la del header.">
              <Select value={marca} onChange={(e) => onMarca(e.target.value as Marca)}>
                {marcas.map((m) => <option key={m} value={m}>{nombreMarca(m)}</option>)}
              </Select>
            </Field>
          )}
        </div>
        {!eligeMarca && marcas.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.xs, color: color.mut2 }}>
            <MarcaChip marca={marca} /> <span>Un hito propio vive en una sola marca y no se puede mudar.</span>
          </div>
        )}
        {/* Firme vs. proyectada. El default es proyectada porque una fecha que alguien tipeó sin
            decir nada casi nunca está cerrada, y mostrarla firme hace que otro planifique contra
            ella. Se puede mover después sin borrar nada. */}
        <Field
          label="¿La fecha está cerrada?"
          hint="Si todavía se puede mover, dejala en proyectada: se muestra distinta y nadie planifica encima como si fuera segura."
        >
          <Select value={f.firme ? 'si' : 'no'} onChange={(e) => setF({ ...f, firme: e.target.value === 'si' })}>
            <option value="no">Proyectada — puede moverse</option>
            <option value="si">Firme — es ese día</option>
          </Select>
        </Field>
        <Field label="Nota" hint="Opcional. Lo que el resto necesita saber para producir a tiempo.">
          <Input value={String(f.nota || '')} onChange={(e) => setF({ ...f, nota: e.target.value })} />
        </Field>
      </div>
    </Modal>
  )
}

/**
 * Anotar una idea desde el calendario.
 *
 * Es el alta mínima —etapa, título, formato y el gancho—, no el tablero completo: acá la pregunta
 * es "para esta fecha, ¿qué falta pensar?", y pedir el copy entero en ese momento haría que nadie
 * anote nada. Lo demás se completa después, en `/meta-ads/etapas`.
 *
 * La etapa arranca en la primera que no tiene nada anotado: es exactamente el hueco que la fila
 * acaba de mostrar, así que es lo que se viene a llenar.
 */
function ModalIdea({ entrada, marca, varias, onCerrar, onAnotar }: {
  entrada: EntradaCalendario
  marca: Marca
  varias: boolean
  onCerrar: () => void
  onAnotar: (e: EntradaCalendario, d: { etapa: Etapa; titulo: string; formato: string; gancho: string }) => void
}) {
  const sugerida = (ETAPAS.find((x) => !(entrada.cobertura[x] || 0)) || 'mofu') as Etapa
  const [etapa, setEtapa] = useState<Etapa>(sugerida)
  const [titulo, setTitulo] = useState('')
  const [formato, setFormato] = useState('reel')
  const [gancho, setGancho] = useState('')

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrarConFondo={false}
      titulo={`Anotar una idea para ${entrada.titulo}`}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" disabled={!titulo.trim()} onClick={() => onAnotar(entrada, { etapa, titulo, formato, gancho })}>
            Anotar
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.sm, color: color.mut2, display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          {/* La idea entra en la base de UNA marca: decir cuál antes de escribirla evita anotar el
              reel de Zattia en el embudo de BDI y enterarse en Etapas de la pauta. */}
          {varias && <MarcaChip marca={marca} />}
          <span>{rotuloFecha(entrada.fecha)} · faltan {entrada.faltan} días</span>
        </div>
        <Field label="Para qué etapa" hint="Viene elegida la que no tiene nada anotado para esta fecha.">
          <Select value={etapa} onChange={(e) => setEtapa(e.target.value as Etapa)}>
            {ETAPAS.map((x) => (
              <option key={x} value={x}>
                {ETIQUETA_ETAPA[x]}{(entrada.cobertura[x] || 0) === 0 ? ' — no hay nada' : ` — ya hay ${entrada.cobertura[x]}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="La idea, en una línea" required>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Testimonios de clientas sobre el talle" autoFocus />
        </Field>
        {/* ⚠️ La fila de afuera no sobra. `Field width` es `flex-basis`, y adentro de un contenedor
            en COLUMNA el basis es el **alto**: `width={220}` le daba 220 px de alto al campo y
            dejaba un pozo en blanco antes de "El gancho". Envuelto en una fila, el eje principal
            vuelve a ser horizontal y el 220 es lo que dice ser. */}
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          <Field label="Formato" width={220}>
            <Select value={formato} onChange={(e) => setFormato(e.target.value)}>
              {FORMATOS_IDEA.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="El gancho" hint="Opcional. Los primeros dos segundos, o la frase que arranca.">
          <Input value={gancho} onChange={(e) => setGancho(e.target.value)} />
        </Field>
        <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.45 }}>
          Entra como <b>propuesta</b>. El resto (el copy, a quién le habla) se completa en Etapas de
          la pauta, y de ahí en más la aprueba quien tenga el permiso para pautear.
        </div>
      </div>
    </Modal>
  )
}

/**
 * 🔑 **Confirmar escribe en todas las marcas que la tengan estimada, y es lo único que no es por
 * marca.** Qué día cae el Hot Sale no es una decisión editorial: es un hecho que anunció una cámara
 * y es el mismo para las dos. Hacerlo tipear una vez por marca sólo agregaría la chance de que una
 * base quede con la fecha vieja y las dos listas se separen.
 */
function ModalConfirmarFecha({ fila, varias, onCerrar, onConfirmar }: {
  fila: FilaUnificada
  varias: boolean
  onCerrar: () => void
  onConfirmar: (f: FilaUnificada, fecha: string) => void
}) {
  const [fecha, setFecha] = useState(fila.fecha)
  const anio = Number(fila.id.split(':')[2])
  const cat = fechaComercialDe(fila.id.split(':')[1])
  const mueve = diasEntre(fila.fecha, fecha)
  // El día que se está mirando ya lo puso alguien en al menos una base: eso es lo que se puede
  // corregir o soltar. Con las dos estimadas no hay nada que deshacer.
  const yaConfirmada = fila.marcas.some((m) => fila.porMarca[m]?.certeza === 'firme')

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`${yaConfirmada ? 'Corregir' : 'Confirmar'} la fecha de ${fila.base.titulo}`}
      pie={
        <>
          {/* Soltar la fecha la devuelve a la estimación del catálogo. Está acá y no en la fila
              porque es lo que hay que hacer cuando se confirmó mal, y ahí ya se está mirando el
              día equivocado. */}
          {yaConfirmada && (
            <Button variant="ghost" onClick={() => onConfirmar(fila, '')}>Volver a la estimada</Button>
          )}
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" disabled={!fecha || Number(fecha.slice(0, 4)) !== anio} onClick={() => onConfirmar(fila, fecha)}>
            {yaConfirmada ? 'Guardar' : 'Confirmar'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.sm, color: color.ink2, lineHeight: 1.5 }}>
          {yaConfirmada ? (
            <>Hoy se está mostrando <b>{rotuloFecha(fila.fecha)}</b>, que confirmó alguien del equipo.</>
          ) : (
            <>Hoy se está mostrando <b>{rotuloFecha(fila.fecha)}</b>, que es una estimación.</>
          )}
          {cat?.comoSeConfirma ? ` ${cat.comoSeConfirma}` : ''}
        </div>
        <Field label={`La fecha real de ${anio}`} required>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} autoFocus />
        </Field>
        {!!mueve && Number(fecha.slice(0, 4)) === anio && (
          <div style={{ fontSize: font.sm, color: color.warningInk }}>
            Se corre {Math.abs(mueve)} {Math.abs(mueve) === 1 ? 'día' : 'días'} {mueve > 0 ? 'más adelante' : 'para atrás'}.
          </div>
        )}
        {varias && (
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', fontSize: font.xs, color: color.mut2 }}>
            {fila.marcas.map((m) => <MarcaChip key={m} marca={m} />)}
            <span>
              {fila.marcas.length > 1
                ? 'Se guarda en las dos: el día es el mismo para las dos marcas.'
                : 'Sólo esta marca tiene la fecha en este día.'}
            </span>
          </div>
        )}
        <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.45 }}>
          Queda confirmada sólo para {anio}: el año que viene la vuelve a decidir la cámara y se
          muestra estimada de nuevo.
        </div>
      </div>
    </Modal>
  )
}

/**
 * Con cuánta fuerza jugamos la fecha, y desde cuándo hay que producirla.
 *
 * 🔑 **El arranque viene sugerido pero se guarda como propio.** El catálogo prellena el campo con
 * `fecha − anticipoDias`, y ahí termina su intervención: lo que queda guardado es lo que confirmó
 * una persona. La diferencia no es cosmética — un número que nadie miró disfrazado de decisión es
 * exactamente lo que hacía que la pantalla reclamara producción que nadie había pedido.
 *
 * **Se puede dejar vacío.** "Nos sumamos pero todavía no sabemos desde cuándo" es un estado real y
 * frecuente; obligar a poner una fecha ahí garantizaría que se tipee cualquiera con tal de cerrar
 * el modal, y a partir de ahí el dato miente.
 */
function ModalDecidir({ entrada, marca, varias, prioridad: inicial, hoy, onCerrar, onGuardar, onSoltar }: {
  entrada: EntradaCalendario
  marca: Marca
  varias: boolean
  prioridad: Prioridad
  hoy: string
  onCerrar: () => void
  onGuardar: (e: EntradaCalendario, p: Prioridad, arrancar: string | null) => void
  onSoltar: () => void
}) {
  const [prioridad, setPrioridad] = useState<Prioridad>(inicial)
  const [arrancar, setArrancar] = useState(entrada.arrancar || entrada.arranqueSugerido || '')

  const juega = juegaLaFecha(prioridad)
  const sugerido = entrada.arranqueSugerido
  const esElSugerido = !!sugerido && arrancar === sugerido
  const tarde = juega && !!arrancar && arrancar < hoy
  const despues = juega && !!arrancar && arrancar > entrada.fecha

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={varias ? `${entrada.titulo} en ${nombreMarca(marca)} — ¿nos sumamos?` : `${entrada.titulo} — ¿nos sumamos?`}
      pie={
        <>
          {entrada.prioridad && (
            <Button variant="ghost" onClick={onSoltar} title="Vuelve a la pregunta abierta. No es lo mismo que dejarla pasar.">
              Dejar sin decidir
            </Button>
          )}
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" disabled={despues} onClick={() => onGuardar(entrada, prioridad, juega ? (arrancar || null) : null)}>
            Guardar
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.sm, color: color.mut2, display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          {/* La decisión es de esta marca sola: que BDI le vaya fuerte y Zattia pase es lo normal. */}
          {varias && <MarcaChip marca={marca} />}
          <span>
            {rotuloFecha(entrada.fecha)} · faltan {entrada.faltan} {entrada.faltan === 1 ? 'día' : 'días'}
            {entrada.certeza === 'estimada' ? ' · la fecha todavía es estimada' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          {PRIORIDADES.map((p) => {
            const elegida = p.key === prioridad
            return (
              <label
                key={p.key}
                style={{
                  display: 'flex', gap: space[2], alignItems: 'flex-start', cursor: 'pointer',
                  border: `1px solid ${elegida ? color.brandBorder : color.line}`,
                  background: elegida ? color.brandBg : 'transparent',
                  borderRadius: radius.md, padding: space[3],
                }}
              >
                <input
                  type="radio"
                  name="prioridad"
                  checked={elegida}
                  onChange={() => setPrioridad(p.key)}
                  style={{ marginTop: 3 }}
                />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: font.sm, fontWeight: weight.semibold, color: elegida ? color.brand : color.ink }}>
                    {p.label}
                  </span>
                  <span style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.45 }}>{p.ayuda}</span>
                </span>
              </label>
            )
          })}
        </div>

        {juega && (
          <Field
            label="¿Desde cuándo hay que producirla?"
            hint={
              sugerido
                ? `Se puede dejar vacío. Viene sugerido el ${rotuloFecha(sugerido)}, que son ${entrada.anticipoDias} días antes — es sólo una sugerencia del catálogo.`
                : 'Se puede dejar vacío si todavía no se sabe.'
            }
          >
            <Input type="date" value={arrancar} onChange={(ev) => setArrancar(ev.target.value)} />
          </Field>
        )}

        {despues && (
          <div style={{ fontSize: font.sm, color: color.dangerInk }}>
            El arranque cae <b>después</b> de la fecha: así no se llega a producir nada.
          </div>
        )}

        {tarde && !despues && (
          <div style={{ fontSize: font.sm, color: color.warningInk }}>
            Esa fecha ya pasó: va a quedar marcada como que habría que estar produciendo.
          </div>
        )}

        {juega && esElSugerido && !tarde && !despues && (
          <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.45 }}>
            Guardándola tal cual queda como <b>tu</b> fecha de arranque, no como una cuenta del
            catálogo: de ahí en más el calendario avisa contra esto y no contra una estimación.
          </div>
        )}

        {prioridad === 'institucional' && (
          <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.45 }}>
            No pide fecha de arranque ni creativos de embudo: se resuelve en el día. La fila se sigue
            viendo normal — está decidida, sólo que no reclama trabajo. Si más adelante esta fecha
            resulta valer la pena, <b>subila a suave o fuerte</b> y pasa a comportarse como cualquier
            comercial. Vale sólo para esta marca y este año.
          </div>
        )}

        {prioridad === 'pasamos' && (
          <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.45 }}>
            Queda en la lista, apagada, para no volver a discutirla. No pide creativos ni aparece en
            el veredicto de Etapas de la pauta. Vale sólo para esta marca y este año.
          </div>
        )}
      </div>
    </Modal>
  )
}
