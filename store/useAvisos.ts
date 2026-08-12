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
 * consulta nada nuevo salvo las fallas.
 */

import { create } from 'zustand'
import { leerCajon } from '@/lib/solicitudes/cajon'
import { leerFallas } from '@/lib/postventa/fallas/cliente'
import { marcasVisibles } from '@/lib/inicio/core'
import { filtrarPorFuncion, resumenFoto, resumenInterna, type ResumenSolicitud } from '@/lib/solicitudes/overview'
import { avisosDeAprobacion, avisosDeCanjeAprobacion, avisosDeCanjeVencido, avisosDeFallas, avisosDeNoDevueltos, avisosDeSolicitud, contarNuevos, ordenarAvisos } from '@/lib/notificaciones/derivar'
import { esCiego, leerCanjes } from '@/lib/canjes/cliente'
import { nombrePersona, type CanjeRow } from '@/lib/canjes/tipos'
import { vistoHasta } from '@/lib/notificaciones/visto'
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
 * Los avisos de Canjes, en UNA sola lectura para las tres marcas.
 *
 * Vive acá y no en `derivar.ts` porque a diferencia de los otros derivadores **necesita traer
 * datos**: los canjes no se bajan para nada más, así que no hay nada de donde derivarlos. Las
 * funciones puras siguen en `derivar.ts`; esto es sólo el acarreo.
 */
async function avisosDeCanjes(perfil: Perfil, marca: Marca): Promise<Aviso[]> {
  // Cualquiera de las tres marcas sirve para la lectura: el handler devuelve todo lo que el perfil
  // puede ver, y el `store` sólo decide qué viene ciego.
  const { canjes, personas, vencidos } = await leerCanjes(marca)
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
  ]
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
          const [f, i, fallas] = await Promise.all([
            leerCajon<Solicitud>('sesionfotos', m),
            leerCajon<SolicitudInterna>('solicitudesinternas', m),
            // Una falla que no se pudo leer no puede tumbar el resto de los avisos.
            leerFallas(m).catch(() => []),
          ])
          const solsFoto = f.ok ? f.dato : []
          const resumenes = [
            ...solsFoto.map((s) => resumenFoto(s, m)),
            ...(i.ok ? i.dato.map((s) => resumenInterna(s, m)) : []),
          ]
          return { m, resumenes, solsFoto, fallas }
        }),
      )

      // ⚠️ Los canjes salen de la base MAESTRA de BDI, para las tres marcas, así que esta lectura
      // va FUERA del `Promise.all` por marca: adentro pediría lo mismo dos veces y devolvería los
      // mismos canjes cada vez, duplicando cada aviso. Con `.catch(() => …)` porque un módulo que
      // todavía no tiene sus tablas no puede tumbar el resto de los avisos.
      const canjes = await avisosDeCanjes(perfil, marca).catch(() => [] as Aviso[])

      const resumenes = filtrarPorFuncion(porMarca.flatMap((p) => p.resumenes), perfil)
      const avisos = ordenarAvisos([
        ...avisosDeAprobacion(resumenes, perfil, marca),
        ...avisosDeSolicitud(resumenes, perfil),
        ...porMarca.flatMap((p) => avisosDeNoDevueltos(p.solsFoto, p.m, perfil)),
        ...porMarca.flatMap((p) => avisosDeFallas(p.fallas, p.m, perfil)),
        ...canjes,
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
