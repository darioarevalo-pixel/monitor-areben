// Diagnóstico de las credenciales de Supabase que tiene el SERVIDOR, sin exponer ninguna.
//
// # Por qué existe
//
// Todos los handlers de `api/` escriben con `SERVICE_KEY || KEY`. Ese `||` es una red silenciosa:
// si la service key falta, el handler no falla — **cae a la anon y sigue guardando**, porque hoy no
// hay RLS. El día que RLS entre (`sql/migrate-rls.sql`), la anon deja de escribir y ese mismo
// handler pasa a fallar sin haber cambiado una línea.
//
// O sea que "¿están las dos service keys en Vercel?" es el PASO 0 de esa migración, y hasta ahora
// era una afirmación ESCRITA (un comentario en `api/_canjes.js`, una nota) y nunca EJECUTADA. Peor:
// lo escrito habla del `.env` local, que no es lo que corre en producción. Esto lo ejecuta.
//
// # Qué NO devuelve
//
// ⛔ **Ni la clave, ni un prefijo, ni su largo real.** Una service key es acceso total a la base,
// saltea RLS por diseño y no se puede revocar sin rotarla. Lo único que sale de acá es metadata que
// ya es pública o inofensiva: si la variable está, qué `role` DICE ser, y contra qué proyecto
// apunta (el `ref` ya viaja en la URL de Supabase, que está en el bundle del navegador).
//
// # Cómo se lee el rol
//
// Las keys clásicas de Supabase son JWT: el payload trae `role` (`anon` | `service_role`) y `ref`
// (el proyecto). Las nuevas son opacas con prefijo (`sb_secret_…` / `sb_publishable_…`). Se
// contemplan las dos formas porque una rotación futura puede traer las nuevas y el diagnóstico
// tiene que seguir diciendo la verdad en vez de "ilegible".

/** Las dos marcas y las variables con las que el servidor les habla. */
export const CUENTAS_ENV = [
  { marca: 'bdi', nombre: 'BDI', url: 'SUPABASE_URL', anon: 'SUPABASE_KEY', servicio: 'SUPABASE_SERVICE_KEY' },
  { marca: 'zattia', nombre: 'Zattia', url: 'ZATTIA_SUPABASE_URL', anon: 'ZATTIA_SUPABASE_KEY', servicio: 'ZATTIA_SUPABASE_SERVICE_KEY' },
]

/** El `ref` del proyecto sale del subdominio: `https://<ref>.supabase.co`. */
export function refDeUrl(url) {
  const m = /^https?:\/\/([a-z0-9-]+)\.supabase\./i.exec(String(url || ''))
  return m ? m[1] : null
}

/**
 * Qué dice ser una key, sin revelarla.
 *
 * Devuelve `{ rol, ref }`. `rol` es `'anon'` | `'service_role'` | `'ilegible'`; `ref` es el proyecto
 * al que pertenece, o null si la forma de la key no lo lleva (las nuevas opacas no lo llevan).
 */
export function leerKey(valor) {
  const v = String(valor || '')
  if (!v) return { rol: null, ref: null }

  // Keys nuevas (opacas). El rol vive en el prefijo y no hay `ref` adentro.
  if (v.startsWith('sb_secret_')) return { rol: 'service_role', ref: null }
  if (v.startsWith('sb_publishable_')) return { rol: 'anon', ref: null }

  // Keys clásicas (JWT). Sólo se mira el payload, que no es secreto: lo secreto es la firma.
  const partes = v.split('.')
  if (partes.length !== 3) return { rol: 'ilegible', ref: null }
  try {
    const json = Buffer.from(partes[1], 'base64').toString('utf8')
    const p = JSON.parse(json)
    const rol = p.role === 'anon' || p.role === 'service_role' ? p.role : 'ilegible'
    return { rol, ref: p.ref || null }
  } catch {
    return { rol: 'ilegible', ref: null }
  }
}

/**
 * El diagnóstico completo, a partir de un `env` (en prod, `process.env`).
 *
 * Por cada marca devuelve las tres variables y, sobre todo, `efectivo`: **el rol con el que los
 * handlers escriben HOY**, resolviendo el mismo `SERVICE_KEY || KEY` que ellos. Esa es la respuesta
 * del PASO 0: si `efectivo` no es `service_role`, aplicar RLS a esa marca la deja sin guardar.
 */
export function diagnosticar(env) {
  const e = env || {}

  const marcas = CUENTAS_ENV.map((c) => {
    const url = e[c.url] || ''
    const refEsperado = refDeUrl(url)

    const variable = (nombre, esperado) => {
      const valor = e[nombre]
      const presente = typeof valor === 'string' && valor.length > 0
      const { rol, ref } = leerKey(valor)
      return {
        nombre,
        presente,
        rol,
        esperado,
        ref,
        // Una key del proyecto EQUIVOCADO es el modo de falla que más cuesta ver: la variable está,
        // el rol es el correcto, y sin embargo escribe en la base de la otra marca.
        refCoincide: !presente || !ref || !refEsperado ? null : ref === refEsperado,
        ok: presente && rol === esperado && (!ref || !refEsperado || ref === refEsperado),
      }
    }

    const anon = variable(c.anon, 'anon')
    const servicio = variable(c.servicio, 'service_role')
    // El mismo `||` que hacen los handlers, resuelto acá para poder mirarlo.
    const efectivo = servicio.presente ? servicio.rol : anon.presente ? anon.rol : null

    return {
      marca: c.marca,
      nombre: c.nombre,
      url: { nombre: c.url, presente: !!url, ref: refEsperado },
      anon,
      servicio,
      efectivo,
      // Lo único que hay que mirar antes de correr `apply-rls.mjs` sobre esta marca.
      listoParaRls: efectivo === 'service_role' && servicio.ok && !!refEsperado,
    }
  })

  return { marcas, listoParaRls: marcas.every((m) => m.listoParaRls) }
}
