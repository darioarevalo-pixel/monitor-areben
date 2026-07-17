import type { Marca } from './nav.generated'

/**
 * Las dos cuentas de Supabase. Port de CUENTAS (index.html:1899).
 *
 * **Por qué las anon keys quedan literales acá.** Hasta la Fase 3 este archivo
 * tenía solo el nombre visible, y decía que duplicar las keys "sería consagrar el
 * problema". La capa de datos las necesita, así que hay que resolverlo, y la
 * respuesta es: no hay dónde mejor esconderlas todavía.
 *
 * Moverlas a `NEXT_PUBLIC_*` no esconde nada — Next inlinea esas variables en el
 * bundle que descarga el browser, así que quedarían igual de públicas que hoy en
 * el HTML. Lo único que agregaría es un modo de falla nuevo: si la env var falta
 * en Vercel, la app deploya y no lee datos.
 *
 * La exposición real no son estas keys sino que no hay RLS: con la anon key
 * cualquiera lee ventas, clientes, costos e inventario de las dos marcas. Eso lo
 * arregla la Fase S (RLS + rotar las keys); hasta que RLS exista, esconder la key
 * es teatro. Cuando se roten, se rotan acá y en el legacy en el MISMO commit: si
 * los dos mundos apuntan a claves distintas, el iframe deja de leer.
 */
export type Cuenta = {
  nombre: string
  url: string
  key: string
  /** Workflow de GitHub Actions que sincroniza esta marca (para "última actualización"). */
  syncWorkflow: string
}

export const CUENTAS: Record<Marca, Cuenta> = {
  bdi: {
    nombre: 'BDI Accesorios',
    url: 'https://srqzzffmiiescffabtlc.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNycXp6ZmZtaWllc2NmZmFidGxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNzg1NDksImV4cCI6MjA5MDk1NDU0OX0.UJGWTPCXhhxv2Q-4twUBvOivPLUk0SSQvyvtEkDmWLg',
    syncWorkflow: 'sync-diario.yml',
  },
  zattia: {
    nombre: 'Zattia',
    url: 'https://avmdktmyseonacxycimz.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2bWRrdG15c2VvbmFjeHljaW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTUzNDcsImV4cCI6MjA5MTA3MTM0N30.mqm1dhY2HUHlSUHyTfNjA7MphjicbKJqFo6jc_guTRo',
    syncWorkflow: 'sync-diario-zattia.yml',
  },
}

/** Repo donde corren los workflows de sync. Port de GH_REPO (index.html:1897). */
export const GH_REPO = 'darioarevalo-pixel/monitor-areben'
