import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 🔴 **El store no puede publicar los datos de una marca bajo el nombre de la otra.**
 *
 * Se vio caminando producción el 18-ago-2026: con «BDI Accesorios» en el selector, el contador
 * decía 6/6 y el sync 17/8 03:34 — los dos de **Zattia**. Sin un error, sin un log, y con la
 * pantalla entera pareciendo sana.
 *
 * `useDatosMonitor` tiene un guard para exactamente esto (`estado === 'listo' && marcaCargada ===
 * marca`) y su docstring dice por qué: «mientras cambia de marca podría tener los datos de la
 * anterior, y una tabla con esos números sería un A/B falso». El guard no alcanzaba, así que lo que
 * se prueba acá es **el estado del store**, que es lo que el guard mira.
 */

const leerCache = vi.fn()
vi.mock('@/lib/cache', () => ({
  leerCache: (...a: unknown[]) => leerCache(...a),
  guardarCache: async () => ({ ok: true }),
  mapaColorManual: () => ({}),
}))
const traerDatos = vi.fn()
vi.mock('@/lib/datos', () => ({
  desdeVentas: () => '2025-01-01',
  traerDatos: (...a: unknown[]) => traerDatos(...a),
}))
// El payload lleva de qué marca es, y el ETL lo pasa a los «datos». Es la única forma de afirmar
// que lo publicado NO es de la otra: `DatosETL` no dice su marca en ningún campo.
vi.mock('@/lib/etl/computar', () => ({
  computarDatos: (p: { de: string }) => ({ de: p.de }),
}))

const { useMonitorStore } = await import('@/store/useMonitorStore')

const entrada = (de: string) => ({ timestamp: Date.now(), data: { de, colorManual: [] }, marca: de })
const estado = () => useMonitorStore.getState() as unknown as { marca: string | null; estado: string; datos: { de: string } | null }

/** Lo que `useDatosMonitor` le entregaría a la pantalla si la sesión está en `marca`. */
const loQueVeLaPantalla = (marca: string) => {
  const s = estado()
  return s.estado === 'listo' && s.marca === marca ? s.datos : null
}

beforeEach(() => {
  leerCache.mockReset()
  traerDatos.mockReset()
  useMonitorStore.getState().limpiar()
})

describe('el store nunca publica los datos de la otra marca', () => {
  it('🔴 mientras cambia de marca, la pantalla NO recibe los datos de la anterior', async () => {
    leerCache.mockResolvedValue(entrada('bdi'))
    await useMonitorStore.getState().cargar('bdi', true)
    expect(loQueVeLaPantalla('bdi')).toEqual({ de: 'bdi' })

    // Zattia, con el caché lento: es la ventana del `await leerCache`, donde el defecto vivía.
    let soltar: () => void = () => {}
    leerCache.mockImplementation(() => new Promise((r) => { soltar = () => r(entrada('zattia')) }))
    const enCurso = useMonitorStore.getState().cargar('zattia', true)
    await Promise.resolve()
    await Promise.resolve()

    // 🔴 ACÁ estaba el bug: el rótulo ya decía Zattia y los datos seguían siendo los de BDI.
    expect(loQueVeLaPantalla('zattia'), 'la pantalla de Zattia recibió datos de BDI').not.toEqual({ de: 'bdi' })

    // Las DOS mitades del arreglo, cada una por su lado: cualquiera de las dos sola ya taparía la
    // fuga —por eso ninguna la caza si se prueba sólo lo que llega a la pantalla— pero las dos
    // dicen algo distinto. `datos: null` saca el payload ajeno del store, que si no queda ahí como
    // un arma cargada para el próximo que lo lea sin preguntar; `estado: 'cargando'` es lo que
    // hace que el estado no MIENTA —y lo que mueve el spinner del botón de las secciones—.
    expect(estado().datos, 'el payload de la otra marca se quedó en el store').toBeNull()
    expect(estado().estado, 'el store dice «listo» sin tener nada cargado').toBe('cargando')

    soltar()
    await enCurso
    expect(loQueVeLaPantalla('zattia')).toEqual({ de: 'zattia' })
  })

  /**
   * La otra puerta del mismo defecto: no la ventana del `await`, sino **la carrera**. Bruno vuelve a
   * la marca de antes mientras la primera bajada sigue en vuelo, y ésa publica tarde.
   */
  it('🔴 una carga en vuelo que llega TARDE no pisa a la marca que ya se publicó', async () => {
    let soltarZattia: () => void = () => {}
    leerCache.mockImplementation(() => new Promise((r) => { soltarZattia = () => r(entrada('zattia')) }))
    const zattiaEnVuelo = useMonitorStore.getState().cargar('zattia', true)
    await Promise.resolve()

    // El usuario se vuelve a BDI y BDI llega primero.
    leerCache.mockResolvedValue(entrada('bdi'))
    await useMonitorStore.getState().cargar('bdi', true)
    expect(loQueVeLaPantalla('bdi')).toEqual({ de: 'bdi' })

    // Y recién ahora contesta la de Zattia.
    soltarZattia()
    await zattiaEnVuelo
    expect(loQueVeLaPantalla('bdi'), 'la carga vieja de Zattia pisó a BDI').toEqual({ de: 'bdi' })
  })

  /**
   * El cartel de progreso es el mismo caso más chico: «bajando venta_detalles» de una marca que ya
   * nadie está mirando, encima de la que sí.
   */
  it('el progreso de una carga descartada no mueve el cartel de la marca que quedó', async () => {
    leerCache.mockResolvedValue(null)
    let avisar: ((s: string) => void) | null = null
    let soltar: () => void = () => {}
    traerDatos.mockImplementation(({ onProgress }: { onProgress?: (s: string) => void }) => {
      avisar = onProgress ?? null
      return new Promise((r) => { soltar = () => r({ de: 'zattia', colorManual: [] }) })
    })
    const zattiaEnVuelo = useMonitorStore.getState().cargar('zattia', true)
    // 🔴 Se espera a que `traerDatos` HAYA SIDO LLAMADO, no un par de microtasks a ojo. La primera
    // versión de este test hacía un solo `await Promise.resolve()` y `avisar` seguía en `null`:
    // el `avisar?.(…)` de abajo era un no-op y la aserción pasaba **por vacío**. Lo cazó un mutante
    // que sobrevivió.
    for (let i = 0; i < 20 && !avisar; i++) await Promise.resolve()
    expect(avisar, 'traerDatos no llegó a arrancar: el resto del test no probaría nada').not.toBeNull()

    traerDatos.mockResolvedValue({ de: 'bdi', colorManual: [] })
    await useMonitorStore.getState().cargar('bdi', true)

    avisar!('bajando venta_detalles de Zattia')
    expect(useMonitorStore.getState().progreso, 'el progreso de la carga descartada movió el cartel').toBeNull()

    soltar()
    await zattiaEnVuelo
  })

  /**
   * El camino 2 —caché vencido: se muestra lo viejo y se refresca atrás— tiene su propio `await`
   * después de publicar, así que es una tercera puerta para lo mismo.
   */
  it('el refresco de fondo de una marca que ya se dejó no pisa a la que quedó', async () => {
    let soltarRed: () => void = () => {}
    // Caché vencido de Zattia: publica lo viejo y sale a refrescar.
    leerCache.mockImplementation(async (_m: string, ignorar: boolean) => (ignorar ? { ...entrada('zattia'), timestamp: 0 } : null))
    traerDatos.mockImplementation(() => new Promise((r) => { soltarRed = () => r({ de: 'zattia-fresco', colorManual: [] }) }))
    const zattiaEnVuelo = useMonitorStore.getState().cargar('zattia', true)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    // El usuario se vuelve a BDI antes de que conteste la red.
    leerCache.mockResolvedValue(entrada('bdi'))
    await useMonitorStore.getState().cargar('bdi', true)
    expect(loQueVeLaPantalla('bdi')).toEqual({ de: 'bdi' })

    soltarRed()
    await zattiaEnVuelo
    expect(loQueVeLaPantalla('bdi'), 'el refresco de fondo de Zattia pisó a BDI').toEqual({ de: 'bdi' })
  })

  /**
   * No-regresión de la otra punta: **un fallo NO borra lo que se estaba viendo.** Es la regla que ya
   * estaba escrita en el camino 2 —«el refresco de fondo que falla no rompe nada: se sigue viendo
   * lo viejo»— y es lo que se pierde si la limpieza de `datos` se aplica también cuando la marca no
   * cambió.
   */
  it('reintentar la misma marca después de un error no borra lo que había', async () => {
    leerCache.mockResolvedValue(entrada('bdi'))
    await useMonitorStore.getState().cargar('bdi', true)

    leerCache.mockResolvedValue(null)
    traerDatos.mockRejectedValue(new Error('se cayó la red'))
    await useMonitorStore.getState().cargar('bdi', true, true)
    expect(estado().estado).toBe('error')
    expect(estado().datos, 'un fallo de la misma marca borró lo que se estaba viendo').toEqual({ de: 'bdi' })
  })

  // No-regresión: refrescar la MISMA marca sigue funcionando igual. El guard nuevo compara contra
  // la marca pedida, así que un `forzar` sobre la que ya está no puede descartarse a sí mismo.
  it('refrescar la misma marca a mano sigue publicando', async () => {
    leerCache.mockResolvedValue(entrada('bdi'))
    await useMonitorStore.getState().cargar('bdi', true)

    leerCache.mockResolvedValue(null)
    traerDatos.mockResolvedValue({ de: 'bdi-fresco', colorManual: [] })
    await useMonitorStore.getState().cargar('bdi', true, true)
    expect(loQueVeLaPantalla('bdi')).toEqual({ de: 'bdi-fresco' })
  })
})
