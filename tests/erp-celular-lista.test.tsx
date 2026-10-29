// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ListaTrabajo, partesDeTarjeta, type ColumnaLista } from '@/components/ui/ListaTrabajo'
import { BuscadorLista, FiltroOpciones } from '@/components/ui/PiezasLista'
import { esMovilCon } from '@/lib/movil'
import { esMovil } from '@/lib/caja/movil'

/**
 * 📱 **El ERP en el celular, tanda 1** (Bruno, 29-oct; artifact `diseno/celular/erp-celular.html`): abajo de 900 px cada
 * fila de `ListaTrabajo` es una TARJETA con el título, el dato grande y los chicos; la columna `oculta` ⛔ aparece, ⛔ hay
 * tilde (en el celular no se trabaja en lote) y la compu queda igual. Los filtros se juntan en el botón «Filtros».
 */

type Fila = { id: string; cliente: string; total: string; numero: string; canal: string; vendio: string; local: number }
const FILAS: Fila[] = [
  { id: 'v1', cliente: 'Luciana Ferreyra', total: '$ 58.900', numero: '#1284', canal: 'Local', vendio: 'VENDEDORA-OCULTA', local: 3 },
  { id: 'v2', cliente: 'Camila Ibarra', total: '$ 71.980', numero: '#1280', canal: 'Tienda Nube', vendio: 'OTRA-OCULTA', local: 0 },
]
const COLS: ColumnaLista[] = [
  { key: 'numero', titulo: 'Nº', ancho: '56px', movil: 'chico' },
  { key: 'cliente', titulo: 'Cliente', ancho: 'minmax(130px, 1fr)', movil: 'titulo' },
  { key: 'canal', titulo: 'Origen', ancho: '120px', movil: 'chico' },
  { key: 'total', titulo: 'Total', ancho: '104px', derecha: true, movil: 'dato' },
  { key: 'local', titulo: 'Local', ancho: '64px', derecha: true, movil: 'chico' },
  { key: 'vendio', titulo: 'Vendió', ancho: '120px', movil: 'oculta' },
]

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); window.history.replaceState(null, '', '/') })

async function montar(el: React.ReactElement, url = '/erp/ventas') {
  window.history.replaceState(null, '', url)
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(el) })
}
const lista = (columnas = COLS, onAbrir = vi.fn()) => (
  <ListaTrabajo
    columnas={columnas} filas={FILAS} claveDe={(f) => f.id} celda={(f, k) => String(f[k as keyof Fila])} etiquetaFila={(f) => `la venta ${f.numero}`}
    seleccion={new Set()} onSeleccion={() => {}} onAbrir={onAbrir}
  />
)
const tarjetas = () => [...host.querySelectorAll('[role="listitem"]')]

describe('ListaTrabajo en el celular', () => {
  it('cada fila es una tarjeta: título, dato grande y chicos; la oculta ⛔ aparece ni hay tilde', async () => {
    await montar(lista(), '/erp/ventas?movil=1')
    expect(tarjetas()).toHaveLength(2)
    const t = tarjetas()[0]
    expect(t.querySelector('[data-movil="titulo"]')?.textContent).toBe('Luciana Ferreyra')
    expect(t.querySelector('[data-movil="dato"]')?.textContent).toBe('$ 58.900')
    // Los de texto a la izquierda con «·»; el número (`derecha`) con su nombre, para que «3» diga qué es.
    expect(t.textContent).toContain('#1284 · Local')
    expect(t.textContent).toContain('Local 3')
    expect(host.textContent).not.toContain('OCULTA')
    expect(host.querySelector('input[type="checkbox"]')).toBeNull()
    expect(host.querySelector('[role="table"]')).toBeNull()
  })

  it('tocar la tarjeta abre la ficha de ESA fila', async () => {
    const abrir = vi.fn()
    await montar(lista(COLS, abrir), '/erp/ventas?movil=1')
    await act(async () => { tarjetas()[1].querySelector('button')!.click() })
    expect(abrir).toHaveBeenCalledWith(FILAS[1])
  })

  it('en la compu queda la tabla de siempre, con todas las columnas y el tilde', async () => {
    await montar(lista(), '/erp/ventas?movil=0')
    expect(tarjetas()).toHaveLength(0)
    expect(host.querySelectorAll('[role="row"]')).toHaveLength(3)
    expect(host.textContent).toContain('VENDEDORA-OCULTA')
    expect(host.querySelector('input[type="checkbox"]')).not.toBeNull()
  })

  it('una lista que todavía ⛔ declaró `movil` sigue como tabla también en el celular', async () => {
    await montar(lista(COLS.map(({ movil: _, ...c }) => c)), '/erp/ventas?movil=1')
    expect(tarjetas()).toHaveLength(0)
    expect(host.querySelector('[role="table"]')).not.toBeNull()
  })

  it('reparte las columnas: un solo título y un solo dato; chicos de texto a la izquierda, números a la derecha', () => {
    const p = partesDeTarjeta(COLS)
    expect(p.titulo?.key).toBe('cliente')
    expect(p.dato?.key).toBe('total')
    expect(p.izquierda.map((c) => c.key)).toEqual(['numero', 'canal'])
    expect(p.derecha.map((c) => c.key)).toEqual(['local'])
  })
})

describe('Los filtros en el celular', () => {
  const buscador = (onCambio = vi.fn()) => (
    <BuscadorLista
      valor="" onCambio={() => {}} etiqueta="Buscar en las ventas" placeholder="Cliente" filtrosActivos={1}
      filtros={<FiltroOpciones etiqueta="Período" opciones={[['mes', 'Este mes'], ['7d', 'Últimos 7 días']]} valor="7d" onCambio={onCambio} />}
    />
  )
  it('en la compu el filtro es el select de siempre, al lado del buscador', async () => {
    await montar(buscador(), '/erp/ventas?movil=0')
    expect(host.querySelector('select[aria-label="Período"]')).not.toBeNull()
    expect([...host.querySelectorAll('button')].some((b) => b.textContent?.startsWith('Filtros'))).toBe(false)
  })

  it('en el celular se junta en «Filtros», con cuántos hay puestos, y se elige con botones en la hoja', async () => {
    const onCambio = vi.fn()
    await montar(buscador(onCambio), '/erp/ventas?movil=1')
    expect(host.querySelector('select')).toBeNull()
    const boton = [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Filtros'))!
    expect(boton.getAttribute('aria-label')).toBe('Filtros (1 puestos)')
    await act(async () => { boton.click() })
    const opcion = [...document.body.querySelectorAll('[role="radio"]')].find((b) => b.textContent === 'Este mes') as HTMLButtonElement
    expect(opcion.getAttribute('aria-checked')).toBe('false')
    await act(async () => { opcion.click() })
    expect(onCambio).toHaveBeenCalledWith('mes')
  })
})

describe('La regla de «es celular»', () => {
  const pantalla = (ancho: number, tactil = false, search = '') => ({ search, ancho, tactil })
  it('el ERP: 900 px o menos, con mouse o con dedo (la misma medida que pasa el menú abajo)', () => {
    const erp = { hasta: 900, pideTactil: false }
    expect(esMovilCon(erp, pantalla(390))).toBe(true)
    expect(esMovilCon(erp, pantalla(900))).toBe(true)
    expect(esMovilCon(erp, pantalla(1280))).toBe(false)
    expect(esMovilCon(erp, pantalla(390, false, '?movil=0'))).toBe(false)
  })
  it('la Caja sigue pidiendo pantalla chica Y táctil (⛔ cambió al mudar la regla)', () => {
    expect(esMovil(pantalla(390, false))).toBe(false)
    expect(esMovil(pantalla(390, true))).toBe(true)
    expect(esMovil(pantalla(800, true))).toBe(false)
  })
})
