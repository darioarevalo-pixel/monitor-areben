/**
 * Guardar en el cuaderno del CRM sin hacer esperar a la pantalla (Darío, 25-oct-2026: «cuando cargo
 * la info de despacho, demora una banda en que quede cargada»).
 *
 * Medido ese día con Camila Ciesco: cada guardado relee el mapa entero (0,7-0,8 s) y lo reescribe
 * entero (0,8-1 s), y recién ahí la pantalla mostraba el dato — 1,6 a 1,8 s con el cuadro mostrando
 * lo de ANTES y los botones apagados. Ahora el cambio se ve al instante y el guardado va por detrás.
 *
 * 🔴 **Los guardados van EN FILA, de a uno.** Cada uno relee y reescribe el mapa entero
 * (`guardarConRelectura`): dos a la vez leerían el mismo mapa y el segundo borraría al primero.
 * Antes lo impedía el botón apagado; ahora lo impide esta fila.
 *
 * Lo que se ve es siempre **lo último que confirmó el servidor + lo que todavía está en la fila**.
 * Si uno falla, sale de la fila y la pantalla vuelve a mostrar lo confirmado (con los demás
 * pendientes encima): el dato no queda dibujado como guardado cuando no lo está.
 */
export type Resultado<M> = { ok: true; mapa: M } | { ok: false; motivo: string }
export type Cambio<M> = (m: M) => M

export type Fila<M> = {
  /** Lo que leyó el servidor (al abrir, al pasar de día). Los pendientes se vuelven a aplicar encima. */
  fijarBase: (m: M) => void
  /** Lo confirmado con los pendientes aplicados: lo que hay que dibujar. */
  vista: () => M
  /** Se ve ya (`pintar`) y se guarda cuando le toque. Resuelve cuando el servidor contestó. */
  encolar: (fn: Cambio<M>) => Promise<Resultado<M>>
  pendientes: () => number
}

export function filaDeGuardado<M>(base0: M, guardar: (fn: Cambio<M>) => Promise<Resultado<M>>, pintar: (vista: M) => void): Fila<M> {
  let base = base0
  let pend: Cambio<M>[] = []
  let cola: Promise<unknown> = Promise.resolve()
  const vista = () => pend.reduce((m, f) => f(m), base)

  return {
    fijarBase(m) {
      base = m
      if (pend.length) pintar(vista())
    },
    vista,
    pendientes: () => pend.length,
    encolar(fn) {
      pend = [...pend, fn]
      pintar(vista())
      const p = cola.then(async (): Promise<Resultado<M>> => {
        let r: Resultado<M>
        try {
          r = await guardar(fn)
        } catch (e) {
          r = { ok: false, motivo: e instanceof Error ? e.message : String(e) }
        }
        pend = pend.filter((f) => f !== fn)
        if (r.ok) base = r.mapa
        pintar(vista())
        return r
      })
      cola = p
      return p
    },
  }
}
