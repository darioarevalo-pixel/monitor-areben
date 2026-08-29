/**
 * Los avisos de la persona logueada, con UN solo refresco.
 *
 * Existe por dos motivos. El primero es que el sidebar necesita el número y hoy no toca datos:
 * es menú puro. Colgarlo de Inicio no sirve porque Inicio puede no estar montado, y el aviso
 * tiene que aparecer estés donde estés.
 *
 * El segundo es que **había dos `setInterval` de 3 minutos corriendo por separado** —uno en
 * Inicio y otro en Solicitudes— que pedían lo mismo. Al unificarlos acá queda un refresco donde
 * había dos: la feature nueva sale más liviana que lo que reemplaza.
 *
 * Los avisos se DERIVAN de lo que ya se baja (ver `lib/notificaciones/`), así que este store no
 * consulta nada nuevo salvo las fallas, los reclamos y los hallazgos de la pauta.
 */

import { create } from 'zustand'
import { leerCajon } from '@/lib/solicitudes/cajon'
import { leerFallas } from '@/lib/postventa/fallas/cliente'
import { leerReclamosParaAviso } from '@/lib/reclamos/cliente'
import { puedeVer } from '@/lib/permisos'
import { marcasVisibles } from '@/lib/inicio/core'
import { lineasDeMarca } from '@/lib/lineas'
import { filtrarPorFuncion, resumenFoto, resumenInterna, type ResumenSolicitud } from '@/lib/solicitudes/overview'
import { avisosDeAprobacion, avisosDeCanjeAprobacion, avisosDeCanjeVencido, avisosDeContenidoSinRevisar, avisosDeFallas, avisosDeHallazgo, avisosDeInsumo, avisosDeNoDevueltos, avisosDeReclamo, avisosDeSolicitud, contarNuevos, ordenarAvisos } from '@/lib/notificaciones/derivar'
import { esCiego, leerCanjes } from '@/lib/canjes/cliente'
import { lineasQueVe } from '@/lib/meta-ads/acciones'
import { traerHallazgos } from '@/lib/meta-ads/cliente'
import { nombrePersona, type CanjeRow } from '@/lib/canjes/tipos'
import { vistoHasta } from '@/lib/notificaciones/visto'
import { leerInsumos } from '@/lib/insumos/cliente'
import { mirarTodos } from '@/lib/insumos/core'
import type { Aviso } from '@/lib/notificaciones/tipos'
import type { Perfil } from '@/lib/permisos'
import type { Marca } from '@/lib/nav'
import type { Solicitud } from '@/lib/sesionfotos/tipos'
import type { SolicitudInterna } from '@/lib/solicitudes-internas/tipos'

/** 3 minutos, el mismo que tenían Inicio y Solicitudes por su cuenta. */
export const POLL_AVISOS_MS = 180000

type AvisosState = {
  avisos: Aviso[]
  /** Los resúmenes crudos, para que Inicio y Solicitudes no vuelvan a pedirlos. */
  resumenes: ResumenSolicitud[]
  cargando: boolean
  /**
   * Cuándo se leyeron por última vez, para poder decirlo en pantalla ("actualizado hace 2 min").
   * Sin esto, Inicio muestra una lista que se refresca sola cada 3 minutos y no tiene forma de
   * distinguirse de una congelada — y una pantalla en la que no se sabe si lo que se ve es de
   * ahora es exactamente una en la que no se confía.
   */
  cargadoEn: number
  /** Cuántos aparecieron después de la última visita. Es el número del sidebar. */
  nuevos: number
  cargar: (perfil: Perfil | null, marca: Marca) => Promise<void>
  /** Recalcula `nuevos` sin volver a pedir nada (después de marcar visto). */
  recontar: (usuario: string | null | undefined) => void
  limpiar: () => void
}

/**
 * Los hallazgos de la pauta, en UNA sola lectura para las tres líneas.
 *
 * Va fuera del `Promise.all` por marca por lo mismo que los canjes: el endpoint devuelve todas las
 * líneas que el perfil puede ver —`stunned` incluida, que ni siquiera es una `Marca`—, así que
 * adentro pediría lo mismo dos veces y duplicaría cada aviso.
 *
 * 🔑 **El permiso se pregunta ANTES de pedir**, como con los reclamos: sin Meta Ads en ninguna
 * marca esto sería un 403 en cada refresco de cada persona del local, cada 3 minutos. ⚠️ Es un
 * atajo y ⛔ no la regla: la regla la vuelve a mirar `avisosDeHallazgo`, y si algún día discreparan
 * el que decide es el derivador.
 *
 * 🔑 **Sale de la base y ⛔ no de Graph**: `recurso=hallazgos` está arriba del guard del token en
 * `api/meta-ads.js`, así que el aviso sigue llegando el día que el token se venza — que es
 * justamente el día en que más importa saber qué quedó pendiente de decidir.
 */
async function avisosDePauta(perfil: Perfil): Promise<Aviso[]> {
  if (!lineasQueVe(perfil).length) return []
  const r = await traerHallazgos('nuevo')
  // Un hallazgo que no se pudo leer ⛔ no puede tumbar el resto de los avisos: `traerHallazgos` ya
  // devuelve `{ok:false}` en vez de tirar, así que acá alcanza con no afirmar nada.
  return r.ok ? avisosDeHallazgo(r.dato.hallazgos, perfil) : []
}

/**
 * Los avisos de Canjes, en UNA sola lectura para las tres marcas.
 *
 * Vive acá y no en `derivar.ts` porque a diferencia de los otros derivadores **necesita traer
 * datos**: los canjes no se bajan para nada más, así que no hay nada de donde derivarlos. Las
 * funciones puras siguen en `derivar.ts`; esto es sólo el acarreo.
 */
async function avisosDeCanjes(perfil: Perfil, marca: Marca): Promise<Aviso[]> {
  // Cualquiera de las tres marcas sirve para la lectura: el handler devuelve todo lo que el perfil
  // puede ver, y el `store` sólo decide qué viene ciego.
  const { canjes, personas, vencidos, sinRevisar } = await leerCanjes(marca)
  const nombrePorId = new Map(personas.map((p) => [p.id, nombrePersona(p)]))

  const propios = canjes.filter((c) => !esCiego(c)) as CanjeRow[]
  return [
    ...avisosDeCanjeAprobacion(
      propios.map((c) => ({ ...c, persona: nombrePorId.get(c.persona_id) ?? null })),
      perfil,
    ),
    ...avisosDeCanjeVencido(
      vencidos.map((v) => ({ ...v, persona: nombrePorId.get(v.persona_id) ?? 'Alguien' })),
      perfil,
      marca,
    ),
    // Sale del MISMO pedido: el resumen viaja con el listado, así que el aviso no cuesta un fetch.
    ...avisosDeContenidoSinRevisar(
      sinRevisar.map((v) => ({ ...v, persona: nombrePorId.get(v.persona_id) ?? 'Alguien' })),
      perfil,
      marca,
    ),
  ]
}

/**
 * Los insumos que hay que reponer, en UNA sola lectura.
 *
 * Va fuera del `Promise.all` por marca porque **el catálogo es de la empresa**: el depósito es uno
 * solo y la compra se hace una vez. Adentro pediría lo mismo dos veces y contaría el mismo pedido
 * dos veces.
 *
 * 🔑 **El permiso se pregunta ANTES de pedir**, como con la pauta y los reclamos: sin Insumos, esto
 * sería un 403 en cada refresco de cada persona del local, cada 3 minutos. ⚠️ Es un atajo y ⛔ no la
 * regla — la vuelve a mirar `avisosDeInsumo`.
 *
 * ⚠️ Y **la regla de «hay que reponer» no se escribe acá**: sale de `mirarTodos`, el mismo núcleo
 * que mira la pantalla. Dos lugares que la contestaran es donde el badge y la tabla empiezan a
 * decir cosas distintas.
 */
async function avisosDeInsumos(perfil: Perfil, marca: Marca): Promise<Aviso[]> {
  if (!puedeVer(perfil, marca, 'insumos')) return []
  const d = await leerInsumos(marca)
  return avisosDeInsumo(mirarTodos(d.insumos, d.movimientos, d.pedidos, d.comprasPorMarca), perfil, marca)
}

export const useAvisos = create<AvisosState>((set, get) => ({
  avisos: [],
  resumenes: [],
  cargando: false,
  cargadoEn: 0,
  nuevos: 0,

  async cargar(perfil, marca) {
    if (!perfil) {
      set({ avisos: [], resumenes: [], nuevos: 0, cargadoEn: 0, cargando: false })
      return
    }
    set({ cargando: true })
    try {
      const marcas = marcasVisibles(perfil, marca)
      const porMarca = await Promise.all(
        marcas.map(async (m) => {
          // 🔴 **Las de FOTOS se piden por LÍNEA, las internas por marca.** Sin esto la sesión de
          // fotos de Stunned existiría pero **no la vería nadie**: ésta es la lista de la que sale
          // el aviso y la pantalla `/solicitudes`, o sea por dónde el local se entera de que hay
          // algo para preparar. Una solicitud que no aparece acá no se prepara nunca.
          const [porFoto, i, fallas, reclamos] = await Promise.all([
            Promise.all(
              lineasDeMarca(m).map(async (l) => ({ l, r: await leerCajon<Solicitud>('sesionfotos', l) })),
            ),
            leerCajon<SolicitudInterna>('solicitudesinternas', m),
            // Una falla que no se pudo leer no puede tumbar el resto de los avisos.
            leerFallas(m).catch(() => []),
            // 🔑 **El permiso se pregunta ANTES de pedir, no después de recibir**: traerlos para
            // tirarlos sería un 403 en cada refresco de cada persona del local.
            // ⚠️ Esto ⛔ **no es la regla, es un atajo**: la regla vive en `avisosDeReclamo`, que
            // vuelve a mirar el mismo permiso. Si algún día los dos discreparan, el que decide es
            // el derivador ⇒ el peor caso es pedir de más, ⛔ nunca mostrarle un reclamo a quien no
            // puede abrir la pantalla.
            puedeVer(perfil, m, 'postventa')
              ? leerReclamosParaAviso(m).catch(() => ({ filas: [], hayMas: false }))
              : Promise.resolve({ filas: [], hayMas: false }),
          ])
          const solsFoto = porFoto.flatMap(({ r }) => (r.ok ? r.dato : []))
          const resumenes = [
            ...porFoto.flatMap(({ l, r }) => (r.ok ? r.dato.map((s) => resumenFoto(s, l)) : [])),
            ...(i.ok ? i.dato.map((s) => resumenInterna(s, m)) : []),
          ]
          return { m, resumenes, solsFoto, fallas, reclamos }
        }),
      )

      // ⚠️ Los canjes salen de la base MAESTRA de BDI, para las tres marcas, así que esta lectura
      // va FUERA del `Promise.all` por marca: adentro pediría lo mismo dos veces y devolvería los
      // mismos canjes cada vez, duplicando cada aviso. Con `.catch(() => …)` porque un módulo que
      // todavía no tiene sus tablas no puede tumbar el resto de los avisos.
      const [canjes, pauta, insumos] = await Promise.all([
        avisosDeCanjes(perfil, marca).catch(() => [] as Aviso[]),
        avisosDePauta(perfil).catch(() => [] as Aviso[]),
        avisosDeInsumos(perfil, marca).catch(() => [] as Aviso[]),
      ])

      const resumenes = filtrarPorFuncion(porMarca.flatMap((p) => p.resumenes), perfil)
      const avisos = ordenarAvisos([
        ...avisosDeAprobacion(resumenes, perfil, marca),
        ...avisosDeSolicitud(resumenes, perfil),
        ...porMarca.flatMap((p) => avisosDeNoDevueltos(p.solsFoto, p.m, perfil)),
        ...porMarca.flatMap((p) => avisosDeFallas(p.fallas, p.m, perfil)),
        ...porMarca.flatMap((p) => avisosDeReclamo(p.reclamos.filas, p.m, perfil, p.reclamos.hayMas)),
        ...canjes,
        ...pauta,
        ...insumos,
      ])

      set({ avisos, resumenes, nuevos: contarNuevos(avisos, vistoHasta(perfil.name)), cargadoEn: Date.now(), cargando: false })
    } catch {
      // Un refresco que falla deja lo anterior en pantalla: es un aviso, no un dato crítico.
      set({ cargando: false })
    }
  },

  recontar(usuario) {
    set({ nuevos: contarNuevos(get().avisos, vistoHasta(usuario)) })
  },

  limpiar() {
    set({ avisos: [], resumenes: [], nuevos: 0, cargadoEn: 0, cargando: false })
  },
}))
