/**
 * Lógica pura de la gestión de usuarios/permisos. Port de las funciones `usu*` del
 * legacy (index.html:9441-9501), sin DOM: el toggle de permisos (con la relación
 * padre/sub), la validación antes de guardar, y el alta de un usuario nuevo.
 *
 * La fuente de las secciones/subs es `PERM_CAT` de `lib/nav` (la misma del menú).
 */

import { PERM_CAT, type Marca } from '@/lib/nav'
import { FUNCIONES, funcionQueDa, KEYS_PARA_TODOS, marcaExcluir, type Funcion } from '@/lib/permisos'
import type { UsuarioConfig } from './tipos'

/** Las dos marcas, en el orden en que se muestran siempre. */
export const MARCAS: readonly Marca[] = ['bdi', 'zattia']

/** Un usuario nuevo, vacío (sin permisos ni funciones). Port de usuAgregar. */
export function nuevoUsuario(): UsuarioConfig {
  return { name: '', pass: '', email: '', admin: false, cuenta: null, acceso: { bdi: {}, zattia: {} }, funcion: [] }
}

/**
 * Asegura que `acceso.bdi` / `acceso.zattia` y `funcion` existan (el legacy los rellena al
 * cargar), y recuerda con qué nombre llegó cada fila: al guardar, es lo que permite
 * renombrar a alguien sin perderle la contraseña (el servidor la busca por ese nombre).
 */
export function normalizar(u: UsuarioConfig): UsuarioConfig {
  const acceso = { ...(u.acceso || {}) }
  acceso.bdi = acceso.bdi || {}
  acceso.zattia = acceso.zattia || {}
  return { ...u, acceso, funcion: Array.isArray(u.funcion) ? u.funcion : [], nameOriginal: u.nameOriginal ?? u.name }
}

/** Marca/desmarca una función del usuario (lista sin duplicados). Devuelve un usuario nuevo (inmutable). */
export function toggleFuncion(u: UsuarioConfig, f: Funcion, val: boolean): UsuarioConfig {
  const actual = Array.isArray(u.funcion) ? u.funcion : []
  const funcion = val ? [...new Set([...actual, f])] : actual.filter((x) => x !== f)
  return { ...u, funcion }
}

/**
 * De dónde le viene a este usuario el acceso a `key` en `brand`. Es lo que la pantalla
 * de Config necesita mostrar para que se entienda por qué algo está tildado:
 *
 * - `admin`     → es administrador, ve todo.
 * - `explicito` → se lo tildaron a él.
 * - `funcion`   → lo trae su función (Local, Marketing, …). No hace falta tildarlo.
 * - `todos`     → es de las que ve todo el equipo (`KEYS_PARA_TODOS`). Tampoco hace falta tildarlo.
 * - `excluido`  → su función se lo daría, pero se lo quitaron a propósito.
 * - `no`        → no lo tiene.
 *
 * 🔴 **`todos` no es cosmético: sin él, Config MIENTE.** Esta función es la que dibuja el
 * «no ve esta sección» de la tabla de acciones, y quedó contestando distinto que `puedeVer` el día
 * que la puerta abierta pasó a estar en la decisión. Dos lugares que contestan la misma pregunta
 * divergen, y acá el que se lee es éste — es la pantalla donde se decide quién ve qué.
 */
export type OrigenPermiso = 'admin' | 'explicito' | 'funcion' | 'todos' | 'excluido' | 'no'

export function origenPermiso(u: UsuarioConfig, brand: Marca, key: string): OrigenPermiso {
  if (u.admin) return 'admin'
  const b = u.acceso?.[brand] || {}
  const porFuncion = !!funcionQueDa(u, key)
  if (b[marcaExcluir(key)]) return 'excluido'
  if (b[key]) return 'explicito'
  if (porFuncion) return 'funcion'
  // Va último y no antes que `explicito`: si además se lo tildaron a mano, lo honesto es mostrar
  // que hay un tilde puesto. `todos` es lo que contesta cuando no hay nada más que lo explique.
  return KEYS_PARA_TODOS.has(key) ? 'todos' : 'no'
}

/**
 * Marca/desmarca un permiso de un usuario en una marca. Mantiene el comportamiento del
 * legacy (usuTogglePerm) —marcar un SUB marca el PADRE; desmarcar un PADRE borra sus
 * subs— y le suma la capa de funciones:
 *
 * - destildar algo que **viene por función** no borra nada (no hay nada que borrar):
 *   deja la EXCEPCIÓN `-key`, que es lo único que puede ganarle a la función;
 * - volver a tildarlo saca la excepción, y solo agrega el permiso explícito si la
 *   función no se lo daba ya (así la config no se llena de tildes redundantes).
 *
 * ⚠️ Las secciones que ve todo el equipo (`KEYS_PARA_TODOS`) se comportan **igual que las que trae
 * la función**, y tiene que ser así: destildar una borrando `b[key]` no borraría nada —no hay tilde
 * puesto—, la persona la seguiría viendo y la casilla volvería sola a marcarse al redibujar. Lo
 * único que le gana a un default es la excepción.
 */
export function togglePerm(u: UsuarioConfig, brand: Marca, key: string, val: boolean): UsuarioConfig {
  const b: Record<string, boolean> = { ...(u.acceso?.[brand] || {}) }
  const excl = marcaExcluir(key)
  const vieneSolo = !key.includes('.') && (!!funcionQueDa(u, key) || KEYS_PARA_TODOS.has(key))

  if (val) {
    delete b[excl]
    if (!vieneSolo) b[key] = true
  } else {
    delete b[key]
    if (vieneSolo) b[excl] = true
  }

  const padre = key.split('.')[0]
  if (key.includes('.')) {
    // Un sub no sirve sin su padre: si el padre no viene por función, se tilda.
    if (val && !funcionQueDa(u, padre)) b[padre] = true
    if (val) delete b[marcaExcluir(padre)]
  } else {
    const cat = PERM_CAT.find((c) => c.key === padre)
    if (cat?.subs && !val) cat.subs.forEach((s) => delete b[`${padre}.${s.key}`])
  }
  return { ...u, acceso: { ...u.acceso, [brand]: b } }
}

/**
 * Copia los permisos de una marca a la otra (pisa lo que haya en destino).
 *
 * Existe porque el permiso es por marca y casi todo el mundo trabaja igual en las dos:
 * sin esto, dar de alta a alguien es tildar la misma lista dos veces, y ahí es donde
 * aparecen las diferencias que después nadie entiende ("en BDI lo ve y en Zattia no").
 */
export function copiarPermisos(u: UsuarioConfig, origen: Marca, destino: Marca): UsuarioConfig {
  return { ...u, acceso: { ...u.acceso, [destino]: { ...(u.acceso?.[origen] || {}) } } }
}

/**
 * Valida la config antes de guardar: al menos un admin, nadie sin nombre, nadie sin forma
 * de entrar, sin nombres repetidos. Devuelve el mensaje de error o `null` si está OK.
 *
 * "Forma de entrar" reemplaza al viejo "todos necesitan contraseña", que dejó de tener
 * sentido dos veces: las contraseñas ya no viajan al navegador (así que acá casi siempre
 * están vacías aunque existan), y desde el ingreso con Google una persona puede no tener
 * ninguna. Lo que no puede pasar es que alguien quede sin mail Y sin contraseña: esa
 * cuenta no entra por ningún lado.
 */
export function validar(users: UsuarioConfig[]): string | null {
  if (!users.some((u) => u.admin)) return 'Tiene que quedar al menos un administrador.'
  if (users.some((u) => !u.name)) return 'Todos los usuarios necesitan un nombre.'
  const sinAcceso = users.find((u) => !u.email && !u.pass && !u.tienePass)
  if (sinAcceso) return `"${sinAcceso.name}" no tiene con qué entrar: ponele un mail (para Google) o una contraseña.`
  const nombres = users.map((u) => (u.name || '').trim())
  if (new Set(nombres).size !== nombres.length) return 'Hay nombres de usuario repetidos.'
  return null
}

/** ¿La checkbox de `key` está marcada para `brand`? (admin, función y puerta abierta también). */
export function tienePermiso(u: UsuarioConfig, brand: Marca, key: string): boolean {
  const o = origenPermiso(u, brand, key)
  return o === 'admin' || o === 'explicito' || o === 'funcion' || o === 'todos'
}

/**
 * Copia a otra persona: permisos, funciones, marca fija y admin. **NO** copia la identidad
 * (nombre, mail, contraseña).
 *
 * Es el atajo real del alta —"que quede igual que Candela"—, y es distinto de
 * `copiarPermisos`, que copia de una marca a la otra DENTRO de la misma persona. Sin esto,
 * dar de alta a la segunda persona de un puesto es volver a tildar la misma lista de cero, y
 * ahí es donde aparecen las diferencias que después nadie sabe explicar.
 *
 * Copia `admin` a propósito: si el molde es un administrador, la copia también lo es, y eso
 * tiene que verse en el resumen antes de guardar en vez de descubrirse después.
 */
export function copiarDeUsuario(destino: UsuarioConfig, origen: UsuarioConfig): UsuarioConfig {
  return {
    ...destino,
    admin: origen.admin,
    cuenta: origen.cuenta,
    funcion: [...(origen.funcion ?? [])],
    acceso: { bdi: { ...(origen.acceso?.bdi || {}) }, zattia: { ...(origen.acceso?.zattia || {}) } },
  }
}

/** Un sub-permiso sacado de su sección, con todo lo que hace falta para mostrarlo suelto. */
export type SubPlano = {
  /** La clave tal como se guarda en `acceso`: `canjes.aprobar`. */
  clave: string
  seccion: string
  seccionLabel: string
  label: string
  info?: string
  brands: Marca[]
  area: string
}

/**
 * Los sub-permisos de todas las secciones, en una lista chata.
 *
 * Existen para mostrarlos **afuera** de la matriz. Adentro eran filas `↳` colgando de una
 * sección que a su vez cuelga de un área plegada: tres niveles de profundidad para llegar a
 * "puede aprobar canjes", que es exactamente el permiso que hay que decidir a conciencia.
 * Un sub **nunca** lo trae la función (ver `puedeSub` en el core de permisos), así que si no
 * se tilda a mano no lo tiene nadie — y no se tildaba porque no se veía.
 *
 * Sale de `PERM_CAT`, que es la fuente del menú: no hay una segunda lista que mantener.
 */
export const SUBS_PLANOS: SubPlano[] = PERM_CAT.flatMap((c) =>
  (c.subs ?? []).map((s) => ({
    clave: `${c.key}.${s.key}`,
    seccion: c.key,
    seccionLabel: c.label,
    label: s.label,
    info: s.info,
    // El sub puede existir en menos marcas que su sección (Tienda Nube: "Categorías por
    // modelo" es sólo de BDI). Si no dice nada, vale para las mismas que la sección.
    brands: s.brands ?? c.brands,
    area: c.area,
  })),
)

export type ResumenUsuario = {
  esAdmin: boolean
  /** Rótulos de las funciones ("Local", "Marketing"), en el orden de `FUNCIONES`. */
  funciones: string[]
  /** En qué marcas trabaja. La cuenta fija la acota a una. */
  marcas: Marca[]
  /** Cuántas secciones ve sobre cuántas existen, por marca. */
  secciones: Record<Marca, { tiene: number; total: number }>
  /** Los sub-permisos que tiene, ya redactados ("Canjes: Puede aprobar canjes"). */
  extras: string[]
  /** Las secciones que su función le daría y se le quitaron. */
  excepciones: string[]
}

/**
 * Qué ve esta persona, en números y en castellano.
 *
 * Es lo que se muestra en el encabezado de su ficha y al final del alta guiada. La pregunta que
 * contesta —"¿qué termina viendo?"— antes sólo se podía responder abriendo once áreas plegadas y
 * contando tildes a ojo, así que en la práctica no se respondía.
 *
 * Cuenta con `tienePermiso`, el mismo que pinta cada casilla de la matriz: si el resumen y la
 * matriz no coincidieran, el resumen no serviría para auditar.
 */
export function resumenUsuario(u: UsuarioConfig): ResumenUsuario {
  const marcas = u.cuenta ? [u.cuenta] : [...MARCAS]
  const secciones = Object.fromEntries(
    MARCAS.map((m) => {
      const deLaMarca = PERM_CAT.filter((c) => c.brands.includes(m))
      return [m, { tiene: deLaMarca.filter((c) => tienePermiso(u, m, c.key)).length, total: deLaMarca.length }]
    }),
  ) as ResumenUsuario['secciones']

  // Los extras y las excepciones se listan una sola vez aunque estén en las dos marcas: el
  // resumen contesta "qué puede hacer", no "en cuál de las dos". El detalle está abajo.
  const enAlgunaMarca = (clave: string, brands: Marca[]) =>
    marcas.some((m) => brands.includes(m) && tienePermiso(u, m, clave))

  return {
    esAdmin: u.admin,
    funciones: FUNCIONES.filter((f) => (u.funcion ?? []).includes(f.key)).map((f) => f.label),
    marcas,
    secciones,
    // Sin caso especial para el admin: `tienePermiso` ya le da todo y `origenPermiso` le
    // devuelve 'admin' antes que 'excluido', así que le salen los 32 extras y cero excepciones.
    // Es lo correcto —ve todo— y la ficha igual lo resuelve con un cartel en vez de la lista.
    extras: SUBS_PLANOS.filter((s) => enAlgunaMarca(s.clave, s.brands)).map((s) => `${s.seccionLabel}: ${s.label}`),
    excepciones: PERM_CAT.filter((c) =>
      marcas.some((m) => c.brands.includes(m) && origenPermiso(u, m, c.key) === 'excluido'),
    ).map((c) => c.label),
  }
}
