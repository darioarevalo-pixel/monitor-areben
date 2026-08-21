'use client'

/**
 * **Traer piezas desde Google Drive**, sin que los bytes toquen una función de Vercel.
 *
 * # Por qué esto no gastó ninguna de las 12 funciones
 *
 * El plan viejo decía «Drive necesita OAuth ⇒ un callback ⇒ una ruta nueva», y con 9 de 12 funciones
 * usadas eso era caro. No hace falta: el **Google Picker** con el scope `drive.file` saca el token
 * **en el browser** (popup de Identity Services, sin `redirect_uri`), y los bytes se bajan de
 * `googleapis.com` directo al browser y de ahí van al Blob por la cañería que ya existe. **Cero
 * funciones nuevas, cero rutas nuevas.**
 *
 * 🔑 **`drive.file` no es un scope sensible**: sólo ve los archivos que la persona eligió a mano en
 * el Picker. Por eso no dispara la verificación de Google que sí exige `drive.readonly` — y como la
 * pantalla de consentimiento del proyecto es **Interna** (sólo cuentas de `arebensrl.com`), tampoco
 * hay revisión que esperar.
 *
 * # ⛔ Va en el proyecto de Google Cloud que YA existe: `Areben Identidad`
 *
 * Es donde vive el OAuth del SSO de las tres apps. Reusarlo ahorra la pantalla de consentimiento
 * entera. **El Client ID del SSO NO se toca**: ese lo usa Supabase para el login con Google de
 * dashboard, producción y monitor. Acá va uno **nuevo al lado**, de tipo «Aplicación web».
 *
 * # Por qué las claves van literales
 *
 * Mismo criterio que `lib/identidad.ts` y `lib/cuentas.ts`: las tres viajan en el browser por
 * definición —el Client ID va en la URL del consentimiento y la clave de API va en cada llamada del
 * Picker—, así que `NEXT_PUBLIC_*` no esconde nada (Next las inlinea en el bundle igual) y sólo
 * agrega un modo de falla: si la variable falta en Vercel, la app deploya y el botón no anda sin que
 * nadie sepa por qué. Además el proyecto vive en el Vercel de Darío.
 *
 * La clave de API se restringe **por sitio** (`monitor.arebensrl.com`) y **a la Picker API**: eso es
 * lo que la hace inservible fuera de acá, no el hecho de esconderla.
 */

import { nombreDeDrive, tamanioDeDrive, type DocDrive } from '@/lib/drive/archivos'
import { mimeDePieza } from '@/lib/meta-ads/pieza'

/* ── Las credenciales ──────────────────────────────────────────────────────── */

/**
 * El Client ID de OAuth de `Areben Identidad`, creado el 11-ago-2026 como «Monitor · Picker de
 * Drive». Es **uno nuevo al lado** del que ya existía: ⛔ el del SSO (`Areben SSO`) no se toca, que
 * es el que usa Supabase para el login con Google de dashboard, producción y monitor.
 *
 * 🔴 **Los dos clientes del proyecto empiezan igual**, con el número `219989173598-`, y en la lista
 * de la consola se ve sólo ese prefijo: `219989173598-lck5…`. Ese es el del **SSO** y no es éste.
 * Confundirlos no rompe el login —el Picker sólo lo lee— pero da
 * *«no registered origin · Error 401: invalid_client»*, un cartel que suena a origen mal cargado y
 * manda a revisar la lista de orígenes, que está bien. Si aparece: mirá **cuál de los dos** es.
 *
 * ⚠️ Google generó además un **secreto de cliente** junto con esto. **Acá no se usa** —el Picker
 * saca el token en el browser, sin backend— y por eso no está en el repo.
 */
export const DRIVE_CLIENT_ID = '219989173598-2o46hp1kg31llgsvlvj8tceqmcvuin3v.apps.googleusercontent.com'

/**
 * La clave de API, creada el 11-ago-2026 como «Monitor · Picker de Drive».
 *
 * Está restringida **por sitio** (los tres orígenes del monitor, con `/*`) y **a la Google Picker
 * API sola**: eso es lo que la hace inservible en otra página, no el hecho de esconderla. Va
 * literal por el mismo motivo que las de `lib/identidad.ts` — viaja en cada llamada del Picker.
 */
export const DRIVE_API_KEY = 'AIzaSyBs6XoKZ9WwYgkM7zLNFBfj7kOIUZ8ccKo'

/**
 * El **número** del proyecto `areben-identidad` (no el id de texto). El Picker lo exige como
 * `setAppId`: es lo que le dice a Drive a qué app darle acceso a los archivos elegidos.
 */
export const DRIVE_APP_ID = '219989173598'

/** Lo mínimo que hace falta: ver y bajar **sólo** los archivos que la persona elija en el Picker. */
const SCOPE = 'https://www.googleapis.com/auth/drive.file'

/** ¿Están cargadas las credenciales? Sin esto el botón no se ofrece, en vez de fallar al apretarlo. */
export function hayDrive(): boolean {
  return !!DRIVE_CLIENT_ID && !!DRIVE_API_KEY
}

/* ── Los dos scripts de Google ─────────────────────────────────────────────── */

interface ClienteToken {
  callback: (r: { access_token?: string; expires_in?: number; error?: string }) => void
  error_callback?: (e: { type?: string; message?: string }) => void
  requestAccessToken: (opts?: { prompt?: string }) => void
}

interface Constructor<T> { new (...args: unknown[]): T }

interface VistaPicker {
  setIncludeFolders: (v: boolean) => VistaPicker
  /** ⚠️ En `true` la vista pasa a mostrar **unidades compartidas**, no «Mi unidad». */
  setEnableDrives: (v: boolean) => VistaPicker
  /** `false` = los que NO son tuyos, o sea «Compartidos conmigo». */
  setOwnedByMe: (v: boolean) => VistaPicker
}

interface ArmadorPicker {
  addView: (v: VistaPicker) => ArmadorPicker
  enableFeature: (f: string) => ArmadorPicker
  setOAuthToken: (t: string) => ArmadorPicker
  setDeveloperKey: (k: string) => ArmadorPicker
  setAppId: (a: string) => ArmadorPicker
  setOrigin: (o: string) => ArmadorPicker
  setCallback: (cb: (data: Record<string, unknown>) => void) => ArmadorPicker
  build: () => { setVisible: (v: boolean) => void }
}

interface GoogleGlobal {
  accounts: { oauth2: { initTokenClient: (o: Record<string, unknown>) => ClienteToken } }
  picker: {
    PickerBuilder: Constructor<ArmadorPicker>
    DocsView: Constructor<VistaPicker>
    ViewId: Record<string, string>
    Feature: Record<string, string>
    Action: Record<string, string>
    Response: Record<string, string>
    Document: Record<string, string>
  }
}

interface GapiGlobal { load: (nombre: string, cb: (() => void) | { callback: () => void; onerror?: () => void }) => void }

declare global {
  interface Window { gapi?: GapiGlobal; google?: GoogleGlobal }
}

/**
 * Carga un `<script>` una sola vez. La promesa se guarda, así que dos clics seguidos comparten la
 * misma carga en vez de meter dos etiquetas y pisarse.
 */
const cargas = new Map<string, Promise<void>>()

function cargarScript(src: string): Promise<void> {
  const guardada = cargas.get(src)
  if (guardada) return guardada
  const p = new Promise<void>((listo, falla) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => listo()
    s.onerror = () => {
      // Sin esto, un bloqueador de anuncios deja la promesa colgada para siempre y el botón se queda
      // en «Abriendo Drive…» sin decir nada.
      cargas.delete(src)
      falla(new Error('No se pudo cargar Google Drive. ¿Hay algún bloqueador de anuncios activo?'))
    }
    document.head.appendChild(s)
  })
  cargas.set(src, p)
  return p
}

async function cargarPicker(): Promise<GoogleGlobal['picker']> {
  await cargarScript('https://apis.google.com/js/api.js')
  const gapi = window.gapi
  if (!gapi) throw new Error('No se pudo cargar Google Drive.')
  await new Promise<void>((listo, falla) => {
    gapi.load('picker', { callback: () => listo(), onerror: () => falla(new Error('No se pudo cargar el selector de Drive.')) })
  })
  const picker = window.google?.picker
  if (!picker) throw new Error('No se pudo cargar el selector de Drive.')
  return picker
}

/* ── El token ──────────────────────────────────────────────────────────────── */

let cliente: ClienteToken | null = null

/**
 * Dónde vive el token entre recargas.
 *
 * 🔑 **`sessionStorage` y no una variable de módulo.** Guardado sólo en memoria, cada F5 lo perdía y
 * el botón volvía a abrir el popup de Google — «cada vez que actualizo tengo que iniciar sesión»,
 * medido por Bruno el 11-ago-2026. El token dura una hora; la variable duraba lo que durara la
 * página, que armando una tanda son minutos.
 *
 * ⛔ **`sessionStorage` y no `localStorage`, a propósito**: se borra al cerrar la pestaña. Un token
 * de acceso no tiene por qué sobrevivir a la pestaña que lo pidió, y de todas formas vence en una
 * hora — persistirlo más tiempo sería guardar algo que ya no sirve.
 */
const CLAVE_TOKEN = 'monitor-drive-token'

function tokenGuardado(): string | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE_TOKEN)
    if (!crudo) return null
    const g = JSON.parse(crudo) as { token?: string; vence?: number }
    return g?.token && Number(g.vence) > Date.now() ? g.token : null
  } catch {
    // Sin sessionStorage (modo privado, permisos raros) se pide el token cada vez. Molesta, anda.
    return null
  }
}

function guardarToken(token: string, segundos: number): void {
  try {
    // El minuto de margen evita el caso feo: un token que se cree vigente y vence a mitad de la
    // bajada de un video de 90 MB, que es cuando más caro sale volver a empezar.
    const vence = Date.now() + Math.max(0, segundos - 60) * 1000
    sessionStorage.setItem(CLAVE_TOKEN, JSON.stringify({ token, vence }))
  } catch {
    /* si no se puede guardar, el único costo es volver a pedirlo */
  }
}

/**
 * Un access token con `drive.file`, reusado hasta un minuto antes de vencer.
 *
 * ⚠️ **El popup lo tiene que disparar un clic.** Por eso esto se llama desde el `onClick` y no desde
 * un efecto: llamado fuera del gesto, el navegador lo bloquea y Google contesta
 * `popup_failed_to_open`, que acá se traduce a un cartel que nombra el bloqueo.
 */
export async function pedirToken(): Promise<string> {
  const vigente = tokenGuardado()
  if (vigente) return vigente

  await cargarScript('https://accounts.google.com/gsi/client')
  const oauth2 = window.google?.accounts?.oauth2
  if (!oauth2) throw new Error('No se pudo cargar el ingreso de Google.')

  if (!cliente) {
    cliente = oauth2.initTokenClient({ client_id: DRIVE_CLIENT_ID, scope: SCOPE, callback: () => {} })
  }
  const c = cliente

  return new Promise<string>((listo, falla) => {
    c.callback = (r) => {
      if (r.error || !r.access_token) return falla(new Error(motivoDeGoogle(r.error)))
      guardarToken(r.access_token, r.expires_in || 3600)
      listo(r.access_token)
    }
    c.error_callback = (e) => falla(new Error(motivoDeGoogle(e?.type)))
    // `prompt: ''` deja que Google resuelva sin mostrar nada cuando el permiso ya está dado. La
    // primera vez muestra el consentimiento igual, que es lo que se quiere.
    c.requestAccessToken({ prompt: '' })
  })
}

function motivoDeGoogle(tipo?: string): string {
  if (tipo === 'popup_failed_to_open') return 'El navegador bloqueó la ventana de Google. Permitile los pop-ups a esta página y probá de nuevo.'
  if (tipo === 'popup_closed') return 'Se cerró la ventana de Google sin dar el permiso.'
  if (tipo === 'access_denied') return 'Google no dio el permiso para leer los archivos elegidos.'
  return tipo ? `Google contestó «${tipo}».` : 'No se pudo pedir el permiso a Google.'
}

/** Se olvida el token guardado. Se llama cuando Drive contesta 401 en plena bajada. */
export function olvidarTokenDrive(): void {
  try {
    sessionStorage.removeItem(CLAVE_TOKEN)
  } catch {
    /* si no se puede borrar es porque tampoco se pudo guardar */
  }
}

/* ── Elegir ────────────────────────────────────────────────────────────────── */

export interface Elegidos {
  token: string
  docs: DocDrive[]
}

/**
 * Abre el Picker y devuelve lo elegido. `docs: []` es «se cerró sin elegir nada», que **no es un
 * error**: no hay nada que avisar cuando alguien se arrepiente.
 */
export async function elegirDeDrive(): Promise<Elegidos> {
  const token = await pedirToken()
  const picker = await cargarPicker()

  return new Promise<Elegidos>((listo) => {
    const vista = (id: string) => new picker.DocsView(picker.ViewId[id]).setIncludeFolders(true)

    const armado = new picker.PickerBuilder()
      // 🔴 **Las cuatro vistas son cuatro LUGARES distintos de Drive, y ninguna ve las otras.** Un
      // archivo que vive en una carpeta que te compartieron NO aparece en «Videos», por más que sea
      // un video: esa vista es «Mi unidad» y nada más.
      //
      // 🔴 **`setEnableDrives(true)` NO agrega las unidades compartidas: REEMPLAZA el lugar.** Con
      // eso puesto en las dos primeras, el Picker abría con dos solapas llamadas «Shared drives» y
      // un «No videos» sobre un Drive lleno. Medido en prod el 11-ago-2026.
      //
      // ⚠️ El nombre de cada solapa lo pone el tipo de vista y **no se puede cambiar**: `setLabel`
      // está deprecado. Por eso cada una usa un `ViewId` distinto — dos vistas del mismo tipo salen
      // con el mismo nombre y no hay forma de distinguirlas.
      .addView(vista('DOCS_VIDEOS'))
      .addView(vista('DOCS_IMAGES'))
      // Lo que te compartieron: la carpeta la creó otro y por eso no está en «Mi unidad».
      .addView(new picker.DocsView(picker.ViewId.DOCS_IMAGES_AND_VIDEOS).setIncludeFolders(true).setOwnedByMe(false))
      // Las unidades compartidas del equipo, que son un lugar aparte de todo lo anterior.
      .addView(new picker.DocsView(picker.ViewId.DOCS).setIncludeFolders(true).setEnableDrives(true))
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(token)
      .setDeveloperKey(DRIVE_API_KEY)
      // Sin `setAppId` el Picker abre igual y los archivos elegidos **no quedan accesibles**: es lo
      // que le dice a Drive a qué app darle el permiso por archivo del scope `drive.file`.
      .setAppId(DRIVE_APP_ID)
      .setOrigin(window.location.origin)
      .setCallback((data) => {
        const accion = String(data[picker.Response.ACTION] || '')
        if (accion !== picker.Action.PICKED) {
          if (accion === picker.Action.CANCEL) listo({ token, docs: [] })
          return
        }
        const crudos = (data[picker.Response.DOCUMENTS] as Record<string, unknown>[]) || []
        listo({
          token,
          docs: crudos.map((d) => ({
            id: String(d[picker.Document.ID] || ''),
            name: String(d[picker.Document.NAME] || ''),
            mimeType: String(d[picker.Document.MIME_TYPE] || ''),
            sizeBytes: d[picker.Document.SIZE_BYTES] as string | undefined,
          })),
        })
      })
      .build()

    armado.setVisible(true)
  })
}

/* ── Bajar los bytes ───────────────────────────────────────────────────────── */

/**
 * Baja un archivo de Drive y lo devuelve como `File`, listo para la misma subida que un archivo
 * arrastrado. **Medido el 11-ago-2026**: el preflight de `www.googleapis.com` contesta 200 al origen
 * `https://monitor.arebensrl.com` con el header `authorization`, y expone `Content-Length` — que es
 * lo que permite mostrar el avance en vez de un «bajando…» que no se mueve.
 *
 * ⚠️ **El `type` del File se pone con el MIME de la tabla, deducido de la extensión** (lo hace
 * `useSubirPiezas`), no con el que informa Drive: el servidor del Blob acepta una lista corta y un
 * archivo de Drive puede llegar como `application/octet-stream`.
 */
export async function bajarDeDrive(
  doc: DocDrive,
  token: string,
  onAvance?: (pct: number | null) => void,
): Promise<{ ok: true; file: File } | { ok: false; motivo: string }> {
  const nom = nombreDeDrive(doc.name, doc.mimeType)
  if (!nom.ok) return { ok: false, motivo: nom.motivo }

  let r: Response
  try {
    r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(doc.id)}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    return { ok: false, motivo: 'Se cortó la conexión con Drive.' }
  }

  if (!r.ok) {
    // 🔴 **401 y 403 NO son lo mismo, y juntarlos costó una vuelta entera.** Con los dos traducidos
    // a «se venció el permiso», un 403 de *«Google Drive API has not been used in project…»*
    // —o sea, una API apagada en la consola— mandaba a volver a elegir el archivo, que es
    // exactamente lo que no iba a arreglarlo nunca. Sólo el 401 es un token vencido.
    const dijo = await motivoDeDrive(r)
    if (r.status === 401) {
      olvidarTokenDrive()
      return { ok: false, motivo: `Se venció el permiso de Drive. Volvé a elegir el archivo.${dijo}` }
    }
    return { ok: false, motivo: `Drive no dejó bajar «${doc.name}» (${r.status}).${dijo}` }
  }

  const total = Number(r.headers.get('content-length')) || tamanioDeDrive(doc)
  const cuerpo = r.body

  // Sin `body` legible (un navegador viejo) se baja de una: se pierde el avance, no el archivo.
  const bytes = cuerpo ? await leerConAvance(cuerpo, total, onAvance) : await r.blob()

  // El `type` sale de la tabla y de la extensión, NO del que informó Drive: el permiso del Blob
  // acepta una lista corta y un archivo de Drive puede llegar como `application/octet-stream`.
  return { ok: true, file: new File([bytes], nom.nombre, { type: mimeDePieza(nom.nombre) || '' }) }
}

/**
 * Lo que Drive dijo, tal cual, para pegarlo al cartel.
 *
 * 🔑 **El texto de Google se muestra sin traducir a propósito.** Dice cosas como *«Google Drive API
 * has not been used in project 219989173598 before or it is disabled»*, que es feo de leer y es
 * **la instrucción exacta** de qué hay que ir a tocar. Reemplazarlo por un «no se pudo bajar» es
 * quedarse con lo lindo y tirar lo único que servía.
 */
export async function motivoDeDrive(r: Response): Promise<string> {
  try {
    const t = await r.text()
    const j = JSON.parse(t) as { error?: { message?: string } }
    const m = j?.error?.message || t
    return m ? ` Google dijo: «${String(m).slice(0, 300)}»` : ''
  } catch {
    return ''
  }
}

export async function leerConAvance(
  cuerpo: ReadableStream<Uint8Array>,
  total: number,
  onAvance?: (pct: number | null) => void,
): Promise<Blob> {
  const lector = cuerpo.getReader()
  const partes: BlobPart[] = []
  let leidos = 0
  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    if (value) {
      partes.push(value as BlobPart)
      leidos += value.length
      // `null` cuando Drive no dijo el tamaño: la pantalla muestra «bajando…» sin inventar un número.
      onAvance?.(total > 0 ? Math.min(99, Math.round((leidos / total) * 100)) : null)
    }
  }
  return new Blob(partes)
}
