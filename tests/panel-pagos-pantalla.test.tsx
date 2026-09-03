import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * La pestaña "Pagos" del panel de WhatsApp, del lado de la pantalla.
 *
 * 🔑 **El oráculo es qué dice cuando todavía no sabe nada.** Es el mismo defecto que ya se pagó en
 * la lista del día (`crm-panel-agenda.test.tsx`): una pantalla que anuncia "no hay nada" mientras
 * en realidad no terminó de leer se lee como una buena noticia, y nadie la reporta.
 *
 * ⚠️ Es render, no interacción: `renderToStaticMarkup` no corre efectos, así que lo que se ve acá
 * es el primer pintado. Para los casos con datos se reemplazan los dos hooks, que son la única
 * puerta por la que esta pantalla habla con el servidor.
 */

const acreedores = vi.hoisted(() => ({ valor: { acreedores: [] as unknown[], aviso: null, cargando: false, error: null, recargar: () => {} } }))
const compromisos = vi.hoisted(() => ({
  valor: {
    compromisos: [] as unknown[],
    puede: { ver: true, prometer: true, confirmar: true },
    cargando: false,
    error: null,
    recargar: () => {},
  },
}))

vi.mock('@/components/acreedores/useAcreedores', () => ({ useAcreedores: () => acreedores.valor }))
vi.mock('@/components/acreedores/useCompromisos', () => ({ useCompromisos: () => compromisos.valor }))

const { Pagos } = await import('@/components/panel/Pagos')

// Cada caso arranca del mismo lugar: si no, el orden de los `it` decide el resultado.
beforeEach(() => {
  acreedores.valor = { acreedores: [], aviso: null, cargando: false, error: null, recargar: () => {} }
  compromisos.valor = {
    compromisos: [],
    puede: { ver: true, prometer: true, confirmar: true },
    cargando: false,
    error: null,
    recargar: () => {},
  }
})

const promesa = (extra: Record<string, unknown>) => ({
  id: 'x', acreedor_id: 'a1', acreedor_nombre: 'El contador',
  cuenta_alias: 'contador.mp', cuenta_cbu: null, cuenta_banco: null, cuenta_titular: null,
  cliente_id: '77', cliente_store: 'bdi', cliente_nombre: 'Nazarena Luciani',
  titular_real: null, monto: 120000, monto_confirmado: null, estado: 'prometido',
  fecha_prometida: null, notas: null, operacion_id: 'op', pagos_dashboard: null, viene_de: null,
  creado_en: '2026-09-01T10:00:00Z', creado_por: null, confirmado_en: null, confirmado_por: null,
  ...extra,
})

describe('Pagos · antes de tener los datos', () => {
  it('dice que está buscando, NO que no hay ninguna transferencia esperando', () => {
    compromisos.valor = { ...compromisos.valor, cargando: true }
    const html = renderToStaticMarkup(<Pagos cliente={null} onVerCliente={null} />)
    expect(html).toContain('Buscando')
    expect(html).not.toContain('No hay ninguna transferencia')
  })
})

describe('Pagos · la lista de trabajo', () => {
  it('🔑 pone arriba lo que falta confirmar, que es lo que depende de nosotros', () => {
    compromisos.valor = {
      ...compromisos.valor,
      compromisos: [
        promesa({ id: 'p', estado: 'prometido', monto: 50000, cliente_nombre: 'Cliente que promete' }),
        promesa({ id: 't', estado: 'transferido', monto: 80000, cliente_nombre: 'Cliente que transfirió' }),
      ],
    }
    const html = renderToStaticMarkup(<Pagos cliente={null} onVerCliente={null} />)
    expect(html.indexOf('Falta confirmar')).toBeGreaterThan(-1)
    expect(html.indexOf('Falta confirmar')).toBeLessThan(html.indexOf('Esperando que transfieran'))
    // Y el total es lo abierto de las dos listas juntas.
    expect(html).toContain('130.000')
  })

  it('sin chat abierto sigue mostrando la lista, y sólo se cae el formulario', () => {
    compromisos.valor = { ...compromisos.valor, compromisos: [promesa({})] }
    const html = renderToStaticMarkup(<Pagos cliente={null} onVerCliente={null} />)
    expect(html).toContain('Abrí el chat de un cliente')
    expect(html).toContain('Nazarena Luciani')
  })

  it('una promesa vencida lo dice con los días, no con la fecha cruda', () => {
    const ayer = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    compromisos.valor = { ...compromisos.valor, compromisos: [promesa({ fecha_prometida: ayer })] }
    const html = renderToStaticMarkup(<Pagos cliente={null} onVerCliente={null} />)
    expect(html).toContain('vencida hace 1 día')
  })
})

describe('Pagos · los permisos los decide el servidor', () => {
  it('sin permiso de confirmar no aparece el botón que mueve plata', () => {
    compromisos.valor = {
      ...compromisos.valor,
      puede: { ver: true, prometer: true, confirmar: false },
      compromisos: [promesa({ estado: 'transferido' })],
    }
    const html = renderToStaticMarkup(<Pagos cliente={null} onVerCliente={null} />)
    expect(html).not.toContain('Ya entró')
    // Pero lo que no mueve plata sigue estando.
    expect(html).toContain('Se cayó')
  })

  it('sin permiso de ver no se dibuja nada de la lista', () => {
    compromisos.valor = {
      ...compromisos.valor,
      puede: { ver: false, prometer: false, confirmar: false },
      compromisos: [promesa({})],
    }
    const html = renderToStaticMarkup(<Pagos cliente={null} onVerCliente={null} />)
    expect(html).not.toContain('Nazarena Luciani')
    expect(html).toContain('Se activa en Usuarios')
  })
})
