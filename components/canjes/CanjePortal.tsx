'use client'

/**
 * Lo que ve la CREADORA cuando abre el link que le mandamos por WhatsApp. Sin login, en el celular,
 * entre otras cosas, y con la paciencia justa.
 *
 * Vive dentro del catch-all (`app/[[...seccion]]/page.tsx`, key `canje`) y no en una ruta propia de
 * Next porque una ruta nueva sería una función serverless más y el proyecto está en el tope del plan
 * Hobby: pasarse frena TODOS los deploys en silencio. Mismo criterio que `ReclamoPublico`.
 *
 * Tres decisiones, todas por la misma razón —que termine—:
 *   - **Lo mínimo y nada más.** Los datos son ocho campos; no carga el cumplimiento ni ve un solo
 *     número de los nuestros. Cada campo de más es gente que abandona a la mitad.
 *   - **Abre prellenado** con lo que ya está en su ficha. A partir del segundo canje sólo tiene que
 *     leer y confirmar, y el mensaje de WhatsApp se lo dice (`mensajeLinkDatos`).
 *   - **Se guarda todo junto, una vez.** Al revés que las fotos de un reclamo, acá no hay nada que
 *     se pierda si se corta: es un formulario corto y el botón está siempre a la vista.
 *
 * **El contenido (21-ago-2026).** Una vez que el pedido llegó, el mismo link es por donde ella nos
 * pasa las fotos y los videos. Antes se le pedía que los dejara en una carpeta de Drive y eso se
 * trababa por permisos de Google: terminaba llegando por WhatsApp. La pantalla está en
 * `PortalContenido`; acá se queda el estado, porque la lista se refresca al subir cada archivo.
 *
 * **La vitrina (tanda 2).** Si el canje tiene una colgada, antes de los datos elige productos: la
 * grilla de fotos, las opciones de cada uno tal como las tiene la tienda, y arriba cuánto le queda.
 * Va primero porque es la parte que engancha, y la dirección después, que es el trámite. Los dos
 * pasos se mandan **en un solo request**: si fueran dos, abandonar en el medio le dejaría la
 * elección cerrada y la dirección sin cargar.
 *
 * ⚠️ El tope se dibuja acá pero **lo hace cumplir el servidor**, con la lista real. Lo de esta
 * pantalla es para que no llegue hasta el error.
 *
 * Lo que se edita se escribe en la **persona**, no en el canje: la dirección se muda una vez cada
 * tres años y sirve para todas las marcas. El canje sólo se queda con las marcas de tiempo
 * (`datos_confirmados_at`, `seleccion_cerrada_at`), que son lo que distingue "nunca lo miró" de "lo
 * miró y estaba bien".
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PortalContenido, type ArchivoSubido } from '@/components/canjes/PortalContenido'
import { PortalVitrina, type Eleccion, type Opcion, type ProductoVitrina, type Vitrina } from '@/components/canjes/PortalVitrina'
import type { ClaseMedia } from '@/lib/media'

const API = '/api/postventa?recurso=canje'

type Datos = {
  nombre: string | null
  apellido: string | null
  telefono: string | null
  email: string | null
  dni: string | null
  calle: string | null
  numero: string | null
  piso: string | null
  depto: string | null
  cp: string | null
  localidad: string | null
  provincia: string | null
  direccion_nota: string | null
  talles?: { remera: string | null; pantalon: string | null; calzado: string | null }
  modelo_celular?: string | null
}

type Elegido = { nombre: string; variante: string; cantidad: number; pvp?: number | null }

/**
 * Por dónde va el pedido. Llega armado del servidor —incluido el link al correo— para no arrastrar
 * `lib/reclamos/tipos.ts` al bundle público.
 *
 * De los intentos de entrega sólo viene la fecha: la nota que escribió el equipo es interna.
 */
type Envio = {
  via: string | null
  seguimiento: string | null
  trackingUrl: string | null
  entregadoAt: string | null
  intentos: { at: string }[]
}

type Vista = {
  numero: string
  marca: string
  pide: 'talles' | 'modelo_celular'
  /** Lo retira en el local: no se le pide el domicilio, porque no hay a dónde mandar nada. */
  retiroLocal: boolean
  despachado: boolean
  confirmadoAt: string | null
  envio: Envio | null
  datos: Datos
  /** Lo que ella ya subió. La arma el servidor de `canje_evidencias`, filtrada por `subido_por`. */
  contenido: ArchivoSubido[]
  /** Pista para la pantalla; el tope de verdad lo hace cumplir el servidor, dos veces. */
  puedeSubir: boolean
  /** La carpeta del Blob, armada por el servidor. ⛔ No se calcula acá. */
  carpetaContenido: string
  /**
   * ¿Ya tiene buzón? **No es `despachado`**: con envío se abre cuando el pedido llegó, y con retiro
   * en el local desde que aceptó. Lo decide el servidor con la misma regla con la que después acepta
   * o rechaza el archivo (`buzonAbierto`, en `lib/canjes/reglas.core.js`).
   */
  buzonAbierto: boolean
  vitrina: Vitrina | null
  elegidos: Elegido[]
}

/** Los estilos son propios y no el kit del Monitor: esto lo abre alguien de afuera, en un teléfono. */
const caja: React.CSSProperties = {
  maxWidth: 520, margin: '0 auto', padding: 20,
  fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1c1c1e',
}
const label: React.CSSProperties = { display: 'block', fontSize: 14, color: '#374151', marginBottom: 4 }
const input: React.CSSProperties = {
  width: '100%', padding: 12, fontSize: 16, borderRadius: 10,
  border: '1px solid #d1d5db', fontFamily: 'inherit', background: '#fff', color: '#1c1c1e',
}
const bloque: React.CSSProperties = { marginBottom: 14 }
const fila: React.CSSProperties = { display: 'flex', gap: 10 }

function Campo({
  titulo, valor, onChange, placeholder, tipo, opcional, ancho,
}: {
  titulo: string
  valor: string
  onChange: (v: string) => void
  placeholder?: string
  tipo?: string
  opcional?: boolean
  ancho?: number
}) {
  return (
    <div style={{ ...bloque, flex: ancho ?? 1 }}>
      <label style={label}>
        {titulo}
        {opcional && <span style={{ color: '#9ca3af' }}> (opcional)</span>}
      </label>
      <input
        style={input}
        value={valor}
        type={tipo || 'text'}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export function CanjePortal({ token }: { token: string | null }) {
  const [vista, setVista] = useState<Vista | null>(null)
  const [cargando, setCargando] = useState(true)
  const [noExiste, setNoExiste] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  /** `elegir` sólo existe si hay vitrina abierta; si no, el link es el de siempre. */
  const [paso, setPaso] = useState<'elegir' | 'datos'>('datos')
  const [carrito, setCarrito] = useState<Eleccion[]>([])

  // El setState va dentro del await y no en el cuerpo del effect: el linter del repo rechaza el
  // setState síncrono ahí (dispara renders en cascada). Mismo patrón que el resto de las secciones.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (!token) { if (vivo) { setNoExiste(true); setCargando(false) } return }
      try {
        const r = await fetch(`${API}&token=${encodeURIComponent(token)}&nc=${Date.now()}`)
        const d = r.ok ? await r.json().catch(() => null) : null
        if (!vivo) return
        if (!d?.ok) { setNoExiste(true); return }
        const v = d.canje as Vista
        setVista(v)
        // Arranca eligiendo sólo si hay algo que elegir. Sin vitrina —o ya cerrada— el link es
        // exactamente el de antes: un formulario de datos y un botón.
        if (v.vitrina?.abierta && v.vitrina.items.length) setPaso('elegir')
        // El nombre y el apellido arrancan **vacíos la primera vez**: son los datos del ENVÍO y lo
        // que hay en la ficha lo tipeó el equipo al darla de alta, así que un error de ahí sale
        // impreso en la etiqueta. Si ya confirmó una vez, se prellenan como el resto: esos datos ya
        // son suyos y hacerla escribirlos de nuevo en cada visita sería un castigo.
        const suyos = v.confirmadoAt != null
        setForm({
          nombre: (suyos && v.datos.nombre) || '',
          apellido: (suyos && v.datos.apellido) || '',
          telefono: v.datos.telefono || '',
          email: v.datos.email || '',
          dni: v.datos.dni || '',
          calle: v.datos.calle || '',
          numero: v.datos.numero || '',
          piso: v.datos.piso || '',
          depto: v.datos.depto || '',
          cp: v.datos.cp || '',
          localidad: v.datos.localidad || '',
          provincia: v.datos.provincia || '',
          direccion_nota: v.datos.direccion_nota || '',
          remera: v.datos.talles?.remera || '',
          pantalon: v.datos.talles?.pantalon || '',
          calzado: v.datos.talles?.calzado || '',
          modelo_celular: v.datos.modelo_celular || '',
        })
      } catch {
        if (vivo) setError('No se pudo conectar. Probá de nuevo en un minuto.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [token])

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  /**
   * Registra un archivo que ya está en el Blob y lo suma a la grilla en el momento.
   *
   * 🔑 **Va uno por uno, apenas cada archivo termina de subir.** No hay `onUploadCompleted` (ver el
   * encabezado de `api/blob-upload.js`): el que le avisa al servidor que el archivo existe es este
   * fetch. Si tira, el hook marca esa fila como fallada y ella reintenta — lo que ya subió antes
   * queda guardado igual, que es todo el punto de no juntarlos y mandarlos al final.
   */
  const registrarContenido = useCallback(async ({ url, clase }: { url: string; clase: ClaseMedia }) => {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, accion: 'contenido', url, tipo: clase === 'video' ? 'video' : 'imagen' }),
    })
    const d = await r.json().catch(() => null)
    if (!r.ok || !d?.ok) throw new Error(d?.error || 'No se pudo guardar ese archivo.')
    setVista((v) => (v ? { ...v, contenido: [...v.contenido, d.archivo as ArchivoSubido] } : v))
  }, [token])

  /**
   * Sacar uno que subió mal. **La fila se saca recién cuando el servidor confirmó**, no antes: acá
   * el optimismo se paga con una foto que desaparece de su pantalla y sigue estando en la nuestra,
   * y ella no tiene forma de enterarse.
   */
  const borrarContenido = useCallback(async (id: number) => {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, accion: 'contenido-borrar', evidencia_id: id }),
    })
    const d = await r.json().catch(() => null)
    if (!r.ok || !d?.ok) throw new Error(d?.error || 'No se pudo eliminar ese archivo.')
    setVista((v) => (v ? { ...v, contenido: v.contenido.filter((a) => a.id !== id) } : v))
  }, [token])

  const vitrina = vista?.vitrina || null
  /** Sólo se manda `elecciones` si de verdad estaba eligiendo: si no, el guardado es el de siempre. */
  const eligiendo = !!vitrina?.abierta && vitrina.items.length > 0

  const porItem = useMemo(
    () => new Map((vitrina?.items || []).map((i) => [i.id, i])),
    [vitrina],
  )

  /**
   * Cuánto le queda. Es el mismo cálculo que hace el servidor con `seVaDelTope`, adelantado acá
   * para que no llegue hasta el error: en unidades cuenta bultos, en monto cuenta plata, y en los
   * dos casos parte de lo que el servidor ya dio por consumido.
   */
  const usado = useMemo(() => {
    if (!vitrina) return 0
    const propio = carrito.reduce((a, e) => {
      if (vitrina.modo === 'unidades') return a + e.cantidad
      return a + (Number(porItem.get(e.item_id)?.pvp) || 0) * e.cantidad
    }, 0)
    return vitrina.usado + propio
  }, [vitrina, carrito, porItem])

  const restante = vitrina?.tope == null ? null : vitrina.tope - usado

  /**
   * ¿Cuántos más de este producto entran en lo que queda? En monto depende del precio; en unidades,
   * del lugar. Es un número y no un sí/no porque la hoja tiene un `+` que se tiene que cortar solo.
   *
   * El tope de 99 es sólo para que el `+` no sea infinito cuando no hay tope o el producto no tiene
   * precio: quién puede llevarse cuánto lo decide el acuerdo, no esta pantalla.
   */
  const cuantosEntran = (item: ProductoVitrina) => {
    if (restante == null) return 99
    if (vitrina?.modo === 'unidades') return Math.max(0, restante)
    const pvp = Number(item.pvp) || 0
    if (pvp <= 0) return restante >= 0 ? 99 : 0
    return Math.max(0, Math.floor(restante / pvp))
  }

  const sumar = (item: ProductoVitrina, opcion: Opcion, cantidad: number) => {
    const suman = Math.min(Math.max(1, cantidad), cuantosEntran(item))
    if (suman < 1) return
    setCarrito((c) => {
      // Otra igual suma cantidad en vez de agregar un renglón: puede llevarse tres de lo mismo.
      const i = c.findIndex((e) => e.item_id === item.id && e.opcion_id === opcion.id)
      if (i < 0) return [...c, { item_id: item.id, opcion_id: opcion.id, cantidad: suman }]
      return c.map((e, n) => (n === i ? { ...e, cantidad: e.cantidad + suman } : e))
    })
  }

  const restar = (e: Eleccion) => setCarrito((c) => c
    .map((x) => (x.item_id === e.item_id && x.opcion_id === e.opcion_id ? { ...x, cantidad: x.cantidad - 1 } : x))
    .filter((x) => x.cantidad > 0))

  const nombreDeLaOpcion = (e: Eleccion) => {
    const item = porItem.get(e.item_id)
    const o = item?.opciones.find((x) => x.id === e.opcion_id)
    return (o?.valores || []).filter(Boolean).join(' · ')
  }

  /**
   * ¿Se le pregunta el dato de la ficha (el modelo del celular o los talles)?
   *
   * **Con vitrina, no**: ya lo dijo eligiendo la variante, y una pregunta de más es gente que
   * abandona. Esto revierte a propósito la decisión de la tanda 2 —"se pide igual porque sirve para
   * el próximo canje"—; el campo sigue estando en el panel y ahora se llena con lo que eligió de
   * verdad, que es mejor dato que lo que hubiera tipeado. Sin vitrina el link queda como estaba.
   *
   * Mira `elegidos` además de `vitrina` para que tampoco reaparezca cuando vuelve a entrar con la
   * selección ya cerrada.
   */
  const pideFicha = !vista?.vitrina && !(vista?.elegidos || []).length

  const guardar = async () => {
    if (!vista) return
    setGuardando(true)
    setError(null)
    try {
      const datos: Record<string, unknown> = {
        nombre: form.nombre, apellido: form.apellido, telefono: form.telefono, email: form.email,
        dni: form.dni, calle: form.calle, numero: form.numero, piso: form.piso, depto: form.depto,
        cp: form.cp, localidad: form.localidad, provincia: form.provincia,
        direccion_nota: form.direccion_nota,
      }
      // Sólo el dato que esta marca pide, y sólo si se lo mostramos: mandar una clave que el
      // formulario no dibujó le pisaría la ficha con un vacío. El servidor acompaña —sólo exige el
      // dato si la clave vino—, así que con vitrina simplemente no viaja.
      if (pideFicha) {
        if (vista.pide === 'talles') {
          datos.talles = { remera: form.remera, pantalon: form.pantalon, calzado: form.calzado }
        } else {
          datos.modelo_celular = form.modelo_celular
        }
      }

      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Los productos y los datos van juntos, en un solo request: dos llamadas dejarían la
        // elección cerrada y la dirección sin cargar si abandona en el medio.
        body: JSON.stringify({ token, accion: 'guardar', datos, ...(eligiendo ? { elecciones: carrito } : {}) }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo guardar.')
      setGuardado(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) return <div style={caja}>Cargando…</div>

  if (noExiste) {
    return (
      <div style={{ ...caja, textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Este link ya no está disponible</h1>
        <p style={{ color: '#6b7280', lineHeight: 1.5 }}>
          Puede que haya vencido o que la acción ya esté cerrada. Escribinos y te pasamos uno nuevo.
        </p>
      </div>
    )
  }

  if (guardado) {
    return (
      <div style={{ ...caja, textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>¡Listo, gracias!</h1>
        <p style={{ color: '#6b7280', lineHeight: 1.5 }}>
          {eligiendo
            // Se lo decimos acá y no antes: avisarle que no va a poder cambiar mientras elige la
            // frena, y lo que hace falta es que elija.
            ? 'Ya tenemos tu pedido y tus datos. Lo preparamos y te avisamos por acá cuando salga. Si necesitás cambiar algo, escribinos.'
            : 'Ya tenemos tus datos. Preparamos el pedido y te avisamos por acá cuando salga.'}
        </p>
        {/* Con retiro en el local el buzón ya está abierto, y esta pantalla es donde queda parada
            después de mandar sus datos: sin esto lo perdería hasta la próxima vez que abriera el
            link, que puede ser nunca. */}
        {vista?.buzonAbierto && (
          <PortalContenido
            token={token}
            carpeta={vista.carpetaContenido}
            archivos={vista.contenido}
            puedeSubir={vista.puedeSubir}
            onSubido={registrarContenido}
            onBorrar={borrarContenido}
          />
        )}
      </div>
    )
  }

  // Ya despachado: los datos no cambian nada, y dejarla editarlos sería hacerle creer que el pedido
  // cambia de rumbo. Se le dice, en vez de un link que no anda.
  if (vista?.despachado) {
    const e = vista.envio
    const llego = !!e?.entregadoAt
    return (
      <div style={{ ...caja, textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>{llego ? 'Tu pedido llegó' : 'Tu pedido ya salió'}</h1>

        {/* El dato que ella vino a buscar. Antes esta pantalla sólo decía "ya salió", que es
            justamente lo que la obliga a escribir para preguntar por dónde va. */}
        {e?.via && (
          <p style={{ color: '#374151', lineHeight: 1.5, marginBottom: 8 }}>
            Va por <strong>{e.via}</strong>
            {e.seguimiento ? <> · seguimiento <strong>{e.seguimiento}</strong></> : null}
          </p>
        )}
        {e?.trackingUrl && (
          <p style={{ marginBottom: 12 }}>
            <a href={e.trackingUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5' }}>
              Seguir el envío
            </a>
          </p>
        )}

        {/* Los intentos, sólo la fecha. Explican la demora sin que tenga que preguntar, y sin
            pasarle la nota interna de quien lo anotó. */}
        {!llego && e?.intentos.length ? (
          <p style={{ color: '#6b7280', lineHeight: 1.5, marginBottom: 12 }}>
            {e.intentos.length === 1
              ? `Pasaron a entregártelo el ${e.intentos[0].at.slice(0, 10)} y no te encontraron.`
              : `Pasaron a entregártelo ${e.intentos.length} veces y no te encontraron.`}
            {' '}Si querés, escribinos y coordinamos un horario.
          </p>
        ) : null}

        <p style={{ color: '#6b7280', lineHeight: 1.5 }}>
          Los datos quedaron como estaban. Si algo no coincide, escribinos y lo vemos.
        </p>

        {/* El buzón del contenido. El corte lo decide el servidor (`buzonAbierto`) y no esta
            pantalla: con envío se abre cuando el pedido llegó —antes no tiene nada que mandarnos y
            pedírselo sería apurarla— y con retiro en el local, desde que aceptó. ⚠️ Antes el corte
            era `llego` acá adentro, y eso dejaba a las de retiro sin buzón hasta que alguien del
            mostrador marcaba la entrega. */}
        {vista.buzonAbierto && (
          <PortalContenido
            token={token}
            carpeta={vista.carpetaContenido}
            archivos={vista.contenido}
            puedeSubir={vista.puedeSubir}
            onSubido={registrarContenido}
            onBorrar={borrarContenido}
          />
        )}
      </div>
    )
  }

  // ── Paso 1: elegir ────────────────────────────────────────────────────────────
  // Va antes de los datos porque es la parte que engancha. El botón de abajo no manda nada: la
  // pasa al formulario, y recién ahí se guarda todo junto. La pantalla vive en `PortalVitrina`;
  // acá se queda el estado, que es lo que el paso 2 también necesita.
  if (paso === 'elegir' && vitrina) {
    return (
      <div style={caja}>
        <PortalVitrina
          marca={vista?.marca || ''}
          vitrina={vitrina}
          carrito={carrito}
          restante={restante}
          cuantosEntran={cuantosEntran}
          sumar={sumar}
          restar={restar}
          onSeguir={() => setPaso('datos')}
        />
      </div>
    )
  }

  const yaConfirmo = !!vista?.confirmadoAt

  return (
    <div style={caja}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>
        {yaConfirmo ? 'Tus datos' : `¡Hola! Somos ${vista?.marca}`}
      </h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
        {yaConfirmo
          ? 'Ya nos los pasaste. Si cambió algo, editalo y volvé a confirmar.'
          : 'Necesitamos estos datos para mandarte el pedido. Son dos minutos.'}
      </p>

      {/* Lo que eligió, arriba de todo: es la razón por la que está llenando esto. Si ya lo mandó
          (`vista.elegidos`) se muestra igual, en lectura — al mandar se cierra. */}
      {(carrito.length > 0 || (vista?.elegidos || []).length > 0) && (
        <div style={{ background: '#f5f5f7', borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <strong style={{ fontSize: 15 }}>Tu pedido</strong>
            {eligiendo && (
              <button
                onClick={() => setPaso('elegir')}
                style={{ border: 'none', background: 'none', color: '#4f46e5', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
              >
                Cambiar
              </button>
            )}
          </div>
          {(carrito.length
            ? carrito.map((e) => ({
              clave: `${e.item_id}-${e.opcion_id}`,
              nombre: porItem.get(e.item_id)?.nombre || '',
              variante: nombreDeLaOpcion(e),
              cantidad: e.cantidad,
            }))
            : (vista?.elegidos || []).map((e, n) => ({
              clave: `${n}-${e.nombre}`, nombre: e.nombre, variante: e.variante, cantidad: e.cantidad,
            }))
          ).map((e) => (
            <div key={e.clave} style={{ fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
              {e.cantidad > 1 ? `${e.cantidad}× ` : ''}{e.nombre}
              {e.variante ? <span style={{ color: '#6b7280' }}> · {e.variante}</span> : null}
            </div>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>Cómo contactarte</h2>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 10, lineHeight: 1.5 }}>
        {vista?.retiroLocal
          ? 'Poné tu nombre y apellido como figuran en tu DNI: con eso te lo entregamos en el local.'
          : 'Poné tu nombre y apellido como figuran en tu DNI: es el que va en la etiqueta del envío.'}
      </p>
      <div style={fila}>
        <Campo titulo="Nombre" valor={form.nombre} onChange={set('nombre')} />
        <Campo titulo="Apellido" valor={form.apellido} onChange={set('apellido')} />
      </div>
      <Campo titulo="Teléfono" valor={form.telefono} onChange={set('telefono')} tipo="tel" placeholder="11 5555 5555" />
      <Campo titulo="Email" valor={form.email} onChange={set('email')} tipo="email" />
      <Campo
        titulo="DNI"
        valor={form.dni}
        onChange={set('dni')}
        tipo="tel"
        placeholder={vista?.retiroLocal ? 'Para identificarte al retirarlo' : 'Lo pide el correo para entregarte'}
      />

      {/* El domicilio sólo si se le manda. Si lo retira en el local no hay a dónde despachar nada, y
          pedirle la dirección es pedirle un dato que nadie va a usar. El servidor tampoco lo exige. */}
      {vista?.retiroLocal ? (
        <p style={{ color: '#6b7280', fontSize: 14, margin: '20px 0 0', lineHeight: 1.5 }}>
          <b style={{ color: '#374151' }}>Lo retirás en el local.</b> Ahí elegís lo que te llevás y te
          lo entregamos en el momento — no hace falta que nos pases una dirección.
        </p>
      ) : (
        <>
          <h2 style={{ fontSize: 16, margin: '24px 0 10px' }}>A dónde te lo mandamos</h2>
          <div style={fila}>
            <Campo titulo="Calle" valor={form.calle} onChange={set('calle')} ancho={2} />
            <Campo titulo="Altura" valor={form.numero} onChange={set('numero')} />
          </div>
          <div style={fila}>
            <Campo titulo="Piso" valor={form.piso} onChange={set('piso')} opcional />
            <Campo titulo="Depto" valor={form.depto} onChange={set('depto')} opcional />
            <Campo titulo="Código postal" valor={form.cp} onChange={set('cp')} />
          </div>
          <div style={fila}>
            <Campo titulo="Localidad" valor={form.localidad} onChange={set('localidad')} />
            <Campo titulo="Provincia" valor={form.provincia} onChange={set('provincia')} />
          </div>
          <Campo
            titulo="Alguna referencia"
            valor={form.direccion_nota}
            onChange={set('direccion_nota')}
            placeholder="Entre calles, portero, horarios…"
            opcional
          />
        </>
      )}

      {!pideFicha ? null : vista?.pide === 'talles' ? (
        <>
          <h2 style={{ fontSize: 16, margin: '24px 0 4px' }}>Tus talles</h2>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 10 }}>
            Completá los que uses. Con uno alcanza.
          </p>
          <div style={fila}>
            <Campo titulo="Remera" valor={form.remera} onChange={set('remera')} placeholder="M" />
            <Campo titulo="Pantalón" valor={form.pantalon} onChange={set('pantalon')} placeholder="38" />
            <Campo titulo="Calzado" valor={form.calzado} onChange={set('calzado')} placeholder="39" />
          </div>
        </>
      ) : (
        <>
          <h2 style={{ fontSize: 16, margin: '24px 0 4px' }}>Tu celular</h2>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 10 }}>
            El modelo exacto, así la funda te calza.
          </p>
          <Campo
            titulo="Modelo"
            valor={form.modelo_celular}
            onChange={set('modelo_celular')}
            placeholder="iPhone 13 Pro, Samsung S23…"
          />
        </>
      )}

      {/* 🔴 Acá vivía «dejanos las fotos y los videos en esta carpeta», con el link de Drive de la
          marca. Se sacó el 21-ago-2026: **ella ya no va a Drive**, sube desde este mismo link
          (`PortalContenido`), y esa carpeta es ahora el archivo definitivo del equipo — el botón
          «Mandar a Drive» de la ficha la usa. El cartel no molestaba porque `drive_url` estaba en
          `null` en las tres marcas; cargarla, que es lo que pide la tanda 2, lo habría revivido y
          la habría mandado de nuevo al lugar que no funcionaba. */}

      {error && (
        <div style={{ background: '#fef2f2', color: '#991b1b', padding: 12, borderRadius: 10, marginTop: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      <button
        onClick={() => void guardar()}
        disabled={guardando}
        style={{
          width: '100%', padding: '15px', fontSize: 16, fontWeight: 600, borderRadius: 10, marginTop: 20,
          border: 'none', cursor: guardando ? 'not-allowed' : 'pointer',
          background: guardando ? '#d1d5db' : '#4f46e5', color: '#fff',
        }}
      >
        {guardando ? 'Guardando…' : eligiendo ? 'Confirmar mi pedido' : yaConfirmo ? 'Confirmar' : 'Enviar mis datos'}
      </button>

      {/*
        El buzón, abajo del formulario. Acá `buzonAbierto` **sólo puede ser cierto con retiro en el
        local**: con envío se abre recién cuando el pedido llegó, y para entonces esta pantalla ya no
        se dibuja (la reemplaza «Tu pedido llegó»). O sea que no hay dos buzones, hay uno en cada
        momento en que existe.

        Va después del botón a propósito: lo primero que tiene que hacer es mandarnos sus datos.
      */}
      {vista?.buzonAbierto && (
        <PortalContenido
          token={token}
          carpeta={vista.carpetaContenido}
          archivos={vista.contenido}
          puedeSubir={vista.puedeSubir}
          onSubido={registrarContenido}
          onBorrar={borrarContenido}
        />
      )}
    </div>
  )
}
