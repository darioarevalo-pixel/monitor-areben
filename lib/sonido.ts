/**
 * **Avisar sin la pantalla**: un pitido, una vibración y, cuando hace falta, una palabra.
 *
 * 🔑 **Por qué existe** (20-sep-2026, lo pidió Bruno para el chequeo de exhibición): *«que haga el
 * pitido y además diga uno, como para que la persona que escaneó tenga el celular cerca pero no
 * esté viéndolo constantemente, y así el flujo sea mucho más rápido»*. Quien camina el local tiene
 * **el lector en una mano y la prenda en la otra**: mirar el teléfono después de cada escaneo es lo
 * que hace lento el recorrido. El oído queda libre, así que la respuesta va por ahí.
 *
 * 🔴 **Y por eso los tonos ⛔ no son decoración: son el mensaje.** Si «anduvo» y «mirá la pantalla»
 * suenan parecido, la persona sigue caminando y deja atrás la prenda que había que resolver. Los
 * cinco avisos se distinguen **sin mirar**: agudo corto = anduvo · dos agudos = van dos · medio
 * largo = ojo con ésta · grave = no figura · dos tonos que SUBEN = tenés que mirar.
 *
 * 🔑 **Ya estaba copiado dos veces** —`ConteoEstandar.tsx` y `ConteoLocalBdi.tsx`—, y las copias ya
 * se habían despegado: el error de una pita a 200 Hz y el de la otra a 300, con vibraciones
 * distintas. Escribir una tercera era garantizar que «el pitido de error» quiera decir una cosa
 * distinta en cada pantalla del local.
 * ✅ `ConteoEstandar.tsx` ya se trajo (26-sep-2026, lo pidió Bruno para el conteo del local de la
 * feria): la voz dice cuántas van de ese talle. ▶️ **`ConteoLocalBdi.tsx` sigue con lo suyo.**
 * Lo que sigue se escribió cuando eran las dos: ⛔ No se hizo en el mismo commit a
 * propósito: son las pantallas que **ajustan stock**, tienen su propia ficha
 * (`docs/secciones/conteo-deposito.md`) y el sonido les cambiaría de un día para el otro a quien ya
 * lo tiene aprendido. Es un cambio de cinco minutos el día que se las camine con alguien del local
 * escuchando.
 *
 * ⚠️ **Todo esto falla de maneras que ⛔ no son un error**: sin audio, con el teléfono en silencio,
 * sin permiso, sin voces instaladas. Cada puerta traga lo suyo — **un recorrido ⛔ no se frena
 * porque el teléfono no pueda pitar**.
 */

export type Aviso = 'ok' | 'suma' | 'ojo' | 'no' | 'mira'

/** Frecuencia (Hz), duración (s) y, si son dos, el segundo tono. Lo que distingue un aviso del otro. */
const TONOS: Record<Aviso, { hz: number; ms: number; luego?: { hz: number; ms: number } }> = {
  // Agudo y corto: es el que más se repite, y tiene que desaparecer atrás del trabajo.
  ok: { hz: 880, ms: 90 },
  // Dos agudos: "van dos". Se reconoce como "lo de siempre, pero pasó algo más".
  suma: { hz: 880, ms: 70, luego: { hz: 1175, ms: 90 } },
  // Medio y más largo: la prenda está, pero algo no cierra (el sistema la tiene en cero).
  ojo: { hz: 520, ms: 260 },
  // Grave: no figura. El único que suena "mal", y tiene que sonar mal.
  no: { hz: 200, ms: 300 },
  // Dos tonos que SUBEN = una pregunta. Es el que obliga a levantar la vista.
  mira: { hz: 660, ms: 110, luego: { hz: 990, ms: 160 } },
}

/** Vibración por aviso, para el bolsillo y para el local ruidoso. Android; iOS la ignora. */
const VIBRA: Record<Aviso, number | number[]> = {
  ok: 45,
  suma: [40, 50, 40],
  ojo: [120, 60, 120],
  no: [90, 60, 90],
  mira: [60, 40, 60, 40, 60],
}

let ctx: AudioContext | null = null

/**
 * 🔴 **El interruptor de silencio del iPhone apaga el pitido y deja pasar la voz**, y ésa es
 * exactamente la falla que reportó Bruno la primera noche (20-sep-2026): *«se escucha bien, pero no
 * escucho los pitidos»*. ⛔ No son el mismo camino de audio — la voz del sistema suena igual con el
 * teléfono en silencio, y **todo lo que pasa por Web Audio, no**.
 *
 * `audioSession.type = 'playback'` es lo que le dice a Safari que esto es contenido que **la
 * persona vino a escuchar**, y entonces ⛔ no lo silencia el interruptor. Existe desde Safari 16.4;
 * donde ⛔ no existe, esta línea ⛔ no hace nada y no molesta.
 */
function sesionDeAudio() {
  try {
    const s = (navigator as unknown as { audioSession?: { type: string } }).audioSession
    if (s && s.type !== 'playback') s.type = 'playback'
  } catch {
    /* navegador sin sesión de audio */
  }
}

/**
 * El audio del navegador arranca **bloqueado** hasta que la persona toca algo, y el Enter del lector
 * ⛔ no siempre alcanza para desbloquearlo. Por eso esto se llama desde el botón que empieza el
 * recorrido, que es un toque de verdad: sin ese enganche, el primer escaneo del día ⛔ no suena.
 */
export function prepararSonido(): void {
  try {
    sesionDeAudio()
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!ctx) ctx = new AC()
    if (ctx.state !== 'running') void ctx.resume()
    // La voz también quiere su permiso, y pedirlo con algo vacío ⛔ no dice nada por el parlante.
    window.speechSynthesis?.getVoices()
  } catch {
    /* sin audio: el recorrido sigue igual */
  }
}

/** Para que la pantalla pueda **decir** por qué no se oye, en vez de dejar a alguien probando a ciegas. */
export type EstadoSonido = 'listo' | 'bloqueado' | 'sin-audio'

export function estadoSonido(): EstadoSonido {
  if (!ctx) return 'sin-audio'
  return ctx.state === 'running' ? 'listo' : 'bloqueado'
}

/**
 * 🔑 **El volumen es más alto de lo que parece necesario a propósito.** Esto se oye en un local con
 * música y gente, con el teléfono en el bolsillo o colgando del cuello, y compitiendo contra el
 * click del propio lector. Un pitido que hay que buscar ⛔ no sirve: la persona termina mirando la
 * pantalla, que es lo que se vino a evitar.
 */
const VOLUMEN = 0.25

function tono(hz: number, ms: number, enMs: number) {
  if (!ctx) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'square'
  o.frequency.value = hz
  const t = ctx.currentTime + enMs / 1000
  // La rampa corta saca el "clic" del corte seco, que con 100 escaneos seguidos cansa.
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(VOLUMEN, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000)
  o.connect(g)
  g.connect(ctx.destination)
  o.start(t)
  o.stop(t + ms / 1000 + 0.02)
}

/**
 * 🔴 **Reanudar es ASÍNCRONO, y hasta que termina el reloj del audio está congelado.** Ésta era la
 * otra mitad del bug de la primera noche: `prepararSonido()` pedía el `resume()` y el pitido se
 * programaba **en el mismo suspiro**, contra un `currentTime` que todavía ⛔ no corría ⇒ el tono
 * quedaba agendado en un instante que ya pasó y ⛔ no sonaba nunca. La voz ⛔ no depende de este
 * reloj, y por eso se oía sola: **un aviso a medias es peor que ninguno**, porque parece que anduvo.
 *
 * ⚠️ Es un `then` y ⛔ no un `await`: quien llama está atendiendo un escaneo y ⛔ no puede esperar.
 */
export function pitar(aviso: Aviso): void {
  try {
    prepararSonido()
    if (!ctx) return
    const t = TONOS[aviso]
    const emitir = () => {
      tono(t.hz, t.ms, 0)
      if (t.luego) tono(t.luego.hz, t.luego.ms, t.ms + 30)
    }
    if (ctx.state === 'running') emitir()
    else void ctx.resume().then(emitir).catch(() => {})
  } catch {
    /* sin audio */
  }
}

export function vibrar(aviso: Aviso): void {
  try {
    navigator.vibrate?.(VIBRA[aviso])
  } catch {
    /* sin vibración */
  }
}

/**
 * Dice una palabra corta por el parlante.
 *
 * 🔴 **Cancela lo anterior antes de hablar, y eso ⛔ no es un detalle.** El lector dispara cada
 * segundo y medio y la voz tarda medio segundo: encolando, a los diez escaneos estaría cantando el
 * número de hace quince segundos — **mintiendo con toda confianza** sobre la prenda que la persona
 * tiene en la mano. Siempre gana **el último escaneo**, que es el único que importa.
 *
 * ⚠️ Corto a propósito: «uno», «dos», «no figura». Una frase ⛔ no llega a terminar antes del
 * escaneo siguiente.
 */
export function decir(texto: string): void {
  try {
    const s = window.speechSynthesis
    if (!s || !texto) return
    s.cancel()
    const u = new SpeechSynthesisUtterance(texto)
    u.lang = 'es-AR'
    u.rate = 1.15
    s.speak(u)
  } catch {
    /* sin voz */
  }
}

/** Las tres puertas juntas, que es como se usa siempre: pitido + vibración + la palabra. */
export function avisar(aviso: Aviso, voz?: string): void {
  pitar(aviso)
  vibrar(aviso)
  if (voz) decir(voz)
}
