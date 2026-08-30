'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cerrarMemo, guardarCampo, leerFotoViva, leerMemo, sellarSenales } from '@/lib/memo/cliente'
import { hoyAr, semanaDe, type Bloque, type Campo, type Foto, type MemoSemana, type Senales } from '@/lib/memo/tipos'
import type { Accionable } from '@/lib/gerencial/tipos'

/**
 * El estado de UN memo: la semana, sus campos y su foto.
 *
 * La foto se resuelve distinto según el estado, y esa es la regla del módulo:
 *   - **cerrado** → la foto guardada, tal cual quedó. No se recalcula NUNCA. Si se recalculara, el
 *     memo de agosto mostraría la venta que la base tenga hoy, y el histórico dejaría de serlo.
 *   - **abierto** → se calcula en vivo y la pantalla la marca como parcial.
 */
/**
 * Una caja de datos SELLADA con la semana de la que salieron.
 *
 * 🔴 **El número de pedido evita que la respuesta vieja PISE a la nueva, pero no evita que la
 * pantalla siga mostrando lo viejo mientras la nueva viaja.** Son dos agujeros distintos y el
 * segundo también se ve razonable: el 29-ago-2026 Bruno reportó que al cambiar de semana "el estado
 * queda del anterior por unos segundos". El estado, la firma del cierre y el botón de cerrar viven
 * FUERA del esqueleto de carga —el título tiene que responder al instante—, así que lo que se
 * dibujaba era el título de una semana con el estado de otra.
 *
 * ⇒ El dato viaja con su `id`, y el hook **no devuelve lo que no es de la semana que se pide**.
 * Nadie tiene que acordarse de limpiar nada al cambiar de semana: no se puede leer lo ajeno.
 */
type Caja<T> = { id: string; dato: T }

/** Lo guardado, **sólo si es de la semana que se está mirando**. Si no, `null` = "todavía no sé". */
export function deLaSemana<T>(caja: Caja<T> | null, id: string): T | null {
  return caja && caja.id === id ? caja.dato : null
}

export function useMemoSemanal(id: string) {
  const [caja, setCaja] = useState<Caja<{ memo: MemoSemana; campos: Campo[] }> | null>(null)
  const [cajaFoto, setCajaFoto] = useState<Caja<Foto> | null>(null)
  const [puedeEscribir, setPuedeEscribir] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [calculando, setCalculando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * 🔴 **El número de pedido, y por qué el módulo no funciona sin él.**
   *
   * Las flechas cambian de semana en un clic y la foto viva es la consulta cara del monitor (dos
   * semanas de `venta_detalles` en las dos bases, segundos). Sin este contador, la respuesta de la
   * semana que el usuario ya dejó atrás llega tarde y se dibuja abajo del encabezado de la semana
   * nueva: la venta de agosto con cara de septiembre. **No hay error, no hay aviso y el número se
   * ve perfectamente razonable** — que es el modo de fallar que este módulo entero viene a evitar.
   * Y no es un caso raro: si la semana nueva contesta más rápido que la vieja (pasa, son consultas
   * de distinto tamaño), la vieja pisa a la nueva y ahí se queda.
   *
   * Vale para las dos respuestas, no sólo la foto: con el acta llegando tarde, los textos de una
   * semana se ven bajo otra y `guardar` los escribiría en la que está en pantalla — copiando el
   * acta de una semana a la otra.
   *
   * Cada carga toma un número; cuando vuelve, sólo escribe si sigue siendo la última.
   */
  const pedido = useRef(0)

  const cargar = useCallback(async () => {
    const mio = ++pedido.current
    const vigente = () => pedido.current === mio

    setCargando(true)
    setError(null)
    try {
      const d = await leerMemo(id)
      if (!vigente()) return
      setCaja({ id, dato: { memo: d.memo, campos: d.campos } })
      setPuedeEscribir(d.puede.escribir)

      if (d.memo.estado === 'cerrado' && d.memo.foto) {
        setCajaFoto({ id, dato: d.memo.foto })
      } else {
        // La foto viva es la consulta cara del módulo (dos semanas de `venta_detalles` en las dos
        // bases). Va aparte para que el memo se pueda leer y escribir aunque los números tarden.
        setCalculando(true)
        leerFotoViva(id)
          .then((f) => { if (vigente()) setCajaFoto({ id, dato: f }) })
          .catch((e) => { if (vigente()) setError(e.message) })
          .finally(() => { if (vigente()) setCalculando(false) })
      }
    } catch (e) {
      if (vigente()) setError(e instanceof Error ? e.message : 'No se pudo leer el memo.')
    } finally {
      if (vigente()) setCargando(false)
    }
  }, [id])

  useEffect(() => {
    // El setState va dentro del IIFE async y no en el cuerpo del effect, para no disparar renders
    // en cascada — mismo patrón que `useGerencial` e Inicio.
    void (async () => {
      await cargar()
    })()
  }, [cargar])

  /** Guarda un campo y refleja el resultado del SERVIDOR (que es quien pone el autor y la hora). */
  const guardar = useCallback(
    async (bloque: Bloque, clave: string, texto: string) => {
      const r = await guardarCampo(id, bloque, clave, texto)
      // ⚠️ Si mientras se guardaba se cambió de semana, la caja ya es de otra: se deja como está.
      // El texto se guardó en la semana correcta (el POST lleva su `id`), y la pantalla que está a
      // la vista no tiene por qué mostrarlo.
      setCaja((prev) => {
        if (!prev || prev.id !== id) return prev
        const otros = prev.dato.campos.filter(
          (c) => !(c.bloque === bloque && c.clave === clave && c.autor === r.autor),
        )
        const campos = [...otros, { bloque, clave, autor: r.autor, texto, updated_at: r.updated_at }]
        return { id, dato: { memo: prev.dato.memo, campos } }
      })
    },
    [id],
  )

  const sellar = useCallback(
    async (senales: Senales) => {
      await sellarSenales(id, senales)
      await cargar()
    },
    [id, cargar],
  )

  const cerrar = useCallback(async () => {
    const r = await cerrarMemo(id)
    setCajaFoto({ id, dato: r.foto })
    await cargar()
  }, [id, cargar])

  const guardado = deLaSemana(caja, id)

  return {
    memo: guardado?.memo ?? null,
    campos: guardado?.campos ?? [],
    foto: deLaSemana(cajaFoto, id),
    puedeEscribir,
    // 🔴 Mientras no haya datos DE ESTA semana la pantalla sigue cargando, aunque la lectura
    // anterior haya terminado: sin esto el cuerpo se dibuja vacío bajo el título nuevo.
    cargando: cargando || (guardado === null && error === null),
    calculando,
    error,
    recargar: cargar,
    guardar,
    sellar,
    cerrar,
  }
}

/**
 * Resume los accionables del panel Gerencial en las señales que guarda el memo.
 *
 * 🔴 **Los de área `ads` quedan afuera, y no es un olvido.** Ese detector atribuye por totales de
 * CUENTA y las tres líneas se pautean desde la misma cuenta publicitaria: su propio encabezado dice
 * que la regex "cae a `bdi` cuando no matchea, que es justo el modo de fallar más peligroso — el
 * número se ve razonable estando mal". Congelar eso en un memo es enterrar un número equivocado con
 * fecha. La pauta del memo ya viene por LÍNEA, del snapshot diario, que es la atribución que no
 * miente.
 */
export function resumirSenales(accionables: Accionable[]): Senales {
  const items = accionables
    .filter((a) => a.area !== 'ads')
    .map((a) => ({ area: a.area, severidad: a.severidad, marca: a.marca, titulo: a.titulo, valor: a.valor }))
  return {
    items,
    conteo: {
      critico: items.filter((i) => i.severidad === 'critico').length,
      atencion: items.filter((i) => i.severidad === 'atencion').length,
      oportunidad: items.filter((i) => i.severidad === 'oportunidad').length,
    },
  }
}

/** La semana de hoy, en hora de Buenos Aires. Una sola puerta al reloj. */
export function semanaHoy() {
  return semanaDe(hoyAr())
}

/**
 * Autoguardado de un campo de texto: 1,5 s después de dejar de escribir, y también al salir del
 * campo. Los dos, porque cada uno tapa el agujero del otro — el debounce pierde lo último si se
 * cierra la pestaña rápido, y el blur no dispara nunca si la persona escribe y se va con el
 * teclado.
 */
export function useAutoguardado(guardar: (texto: string) => Promise<void>, inicial: string) {
  const [texto, setTexto] = useState(inicial)
  const [estado, setEstado] = useState<'limpio' | 'guardando' | 'guardado' | 'error'>('limpio')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ultimoGuardado = useRef(inicial)

  // Si el memo se recarga (otra persona escribió, o se cambió de semana), el valor de afuera manda
  // — salvo que haya algo tipeado sin guardar, que no se puede pisar.
  useEffect(() => {
    if (ultimoGuardado.current === texto) {
      ultimoGuardado.current = inicial
      setTexto(inicial)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo cuando cambia el valor de afuera
  }, [inicial])

  const mandar = useCallback(
    async (v: string) => {
      if (v === ultimoGuardado.current) return
      setEstado('guardando')
      try {
        await guardar(v)
        ultimoGuardado.current = v
        setEstado('guardado')
      } catch {
        setEstado('error')
      }
    },
    [guardar],
  )

  const alEscribir = useCallback(
    (v: string) => {
      setTexto(v)
      setEstado('limpio')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void mandar(v), 1500)
    },
    [mandar],
  )

  const alSalir = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    void mandar(texto)
  }, [mandar, texto])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return { texto, estado, alEscribir, alSalir }
}
