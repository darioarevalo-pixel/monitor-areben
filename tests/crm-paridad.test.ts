import { describe, it, expect } from 'vitest'
import {
  calcularAgregado,
  contarKpis,
  filtrarOrdenar,
  normalizeArgPhone,
  resumenCompras,
  segmentoCliente,
  estadoSeguimiento,
  diasDesde,
  addDiasISO,
  diasHasta,
} from '@/lib/crm/core'
import type { ClienteCRM } from '@/lib/crm/tipos'
import { cargarCRMLegacy, leerFixtureCRM } from './legacy-crm'

/**
 * Paridad del CRM: el legacy (index.html) contra el port a TypeScript, con los
 * MISMOS datos reales de Supabase y del KV.
 *
 * Es la prueba que habilita a conectar el port. Mientras esto no dé verde, el CRM
 * de Next no muestra un número en producción.
 *
 * El fixture no está en el repo (son ventas, teléfonos y nombres de clientes
 * reales). Se baja con:
 *   node scripts/crm-kv.mjs --dump && node scripts/crm-fixture.mjs
 *
 * **Reloj congelado a propósito**: `diasDesde` usa la hora exacta de TODAY, así
 * que con el reloj real el legacy y el port miran instantes distintos y la
 * diferencia parece un bug del port sin serlo. Congelado, además, el test es
 * reproducible.
 */
const AHORA = new Date('2026-07-17T12:00:00.000Z')

const fx = leerFixtureCRM()

if (!fx) {
  describe('paridad del CRM', () => {
    it.skip("falta tests/fixtures/crm/crm-bdi.json — corré 'node scripts/crm-kv.mjs --dump && node scripts/crm-fixture.mjs'", () => {})
  })
} else {
  const { crmSeg, crmTelOverride } = fx.ctx
  const clientes = fx.clientes

  /** Los dos modos del select de canal: son las dos ramas de cargarCRM. */
  const MODOS = [
    { nombre: 'mayorista (el default)', ventas: fx.mayorista.ventas },
    { nombre: 'todos los canales', ventas: fx.todos.ventas },
  ]

  describe.each(MODOS)('paridad del CRM · $nombre', ({ ventas }) => {
    const legacy = cargarCRMLegacy({ today: AHORA, crmRows: ventas, crmClientes: clientes, crmSeg, crmTelOverride })

    const activosLegacy = legacy.calcularAgregadoCRM() as ClienteCRM[]
    const descartadosLegacy = legacy.leerDescartados()
    const port = calcularAgregado({ ventas, clientes, crmSeg, crmTelOverride, today: AHORA })

    // Ordenar por id: el legacy sale en orden de aparición del Map, y comparar
    // listas ordenadas distinto diría "todo mal" por una razón que no importa.
    const porId = (l: ClienteCRM[]) => l.slice().sort((a, b) => a.id - b.id)

    it('devuelve los mismos clientes activos', () => {
      expect(porId(port.activos).map((c) => c.id)).toEqual(porId(activosLegacy).map((c) => c.id))
    })

    it('no pierde los descartados (el legacy los dejaba en un global)', () => {
      expect(porId(port.descartados).map((c) => c.id)).toEqual(porId(descartadosLegacy).map((c) => c.id))
    })

    // Campo por campo: un toEqual del objeto entero dice "algo cambió" y nada más.
    const CAMPOS: (keyof ClienteCRM)[] = [
      'id', 'name', 'email', 'phone', 'city', 'province', 'first_sale', 'last_sale',
      'dias_ultimo', 'dias_primero', 'total_sales', 'total_amount', 'avg_ticket',
      'cadencia', 'ultimo_contacto', 'proximo_contacto', 'seg_estado', 'dias_proximo', 'notas',
    ]
    it.each(CAMPOS)('coincide el campo %s en todos los clientes', (campo) => {
      const a = porId(activosLegacy).map((c) => c[campo])
      const b = porId(port.activos).map((c) => c[campo])
      expect(b).toEqual(a)
    })

    it('coincide el detalle de ventas de cada cliente', () => {
      const ids = (l: ClienteCRM[]) => porId(l).map((c) => c.ventas.map((v) => v.id))
      expect(ids(port.activos)).toEqual(ids(activosLegacy))
    })

    it('coincide el segmento de cada cliente', () => {
      const a = porId(activosLegacy).map((c) => legacy.segmentoCliente(c))
      const b = porId(port.activos).map((c) => segmentoCliente(c))
      expect(b).toEqual(a)
    })

    it('coinciden los KPIs de las tarjetas', () => {
      // Recalculados con el legacy, tal como los cuenta renderCRM (13654-13663).
      const esperado = { top: Math.min(20, activosLegacy.length), activos: 0, riesgo: 0, dormidos: 0, nuevos: 0, sinTel: 0, contactar: 0 }
      for (const c of activosLegacy) {
        const s = legacy.segmentoCliente(c)
        if (s === 'activos') esperado.activos++
        else if (s === 'riesgo') esperado.riesgo++
        else if (s === 'dormidos') esperado.dormidos++
        else if (s === 'nuevos') esperado.nuevos++
        if (!legacy.normalizeArgPhone(c.phone)) esperado.sinTel++
        if (c.seg_estado === 'vencido' || c.seg_estado === 'pendiente') esperado.contactar++
      }
      expect(contarKpis(port.activos)).toEqual(esperado)
    })

    it('coincide estadoSeguimiento cliente por cliente', () => {
      const ids = Object.keys(crmSeg)
      const a = ids.map((id) => legacy.estadoSeguimiento(id))
      const b = ids.map((id) => estadoSeguimiento(id, crmSeg, AHORA))
      expect(b).toEqual(a)
    })
  })

  describe('filtrarOrdenar · las ramas del filtro de la tabla', () => {
    const ventas = fx.mayorista.ventas
    const legacy = cargarCRMLegacy({ today: AHORA, crmRows: ventas, crmClientes: clientes, crmSeg, crmTelOverride })
    const activosLegacy = legacy.calcularAgregadoCRM() as ClienteCRM[]
    const port = calcularAgregado({ ventas, clientes, crmSeg, crmTelOverride, today: AHORA })

    // Replica de renderCRMTabla (13695-13744) sobre la lista del legacy.
    function filtrarLegacy(lista: ClienteCRM[], q: string, seg: string, sort: { col: string; dir: number }) {
      let out = lista.slice()
      if (seg === 'top') { out.sort((a, b) => b.total_amount - a.total_amount); out = out.slice(0, 20) }
      else if (seg === 'sin-tel') out = out.filter((c) => !legacy.normalizeArgPhone(c.phone))
      else if (seg === 'contactar') {
        out = out.filter((c) => c.seg_estado === 'vencido' || c.seg_estado === 'pendiente' || c.seg_estado === 'semana')
        const ord: Record<string, number> = { vencido: 0, pendiente: 1, semana: 2 }
        out.sort((a, b) => ord[a.seg_estado] - ord[b.seg_estado] || (a.dias_proximo ?? 0) - (b.dias_proximo ?? 0))
      } else if (seg !== 'todos') out = out.filter((c) => legacy.segmentoCliente(c) === seg)
      if (q) out = out.filter((c) => (c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.phone || '').includes(q))
      if (seg !== 'contactar') {
        const { col, dir } = sort
        out.sort((a, b) => {
          let av: string | number, bv: string | number
          if (col === 'name') { av = (a.name || '').toLowerCase(); bv = (b.name || '').toLowerCase() }
          else if (col === 'contact') { av = (a.email || a.phone || '').toLowerCase(); bv = (b.email || b.phone || '').toLowerCase() }
          else if (col === 'city') { av = (a.city || '').toLowerCase(); bv = (b.city || '').toLowerCase() }
          else if (col === 'last_sale') { av = a.last_sale || ''; bv = b.last_sale || '' }
          else if (col === 'proximo') {
            av = a.proximo_contacto || (a.seg_estado === 'pendiente' ? '0000-00-00' : '9999-12-31')
            bv = b.proximo_contacto || (b.seg_estado === 'pendiente' ? '0000-00-00' : '9999-12-31')
            if (a.seg_estado === 'none') av = '~'
            if (b.seg_estado === 'none') bv = '~'
          } else { av = (a as unknown as Record<string, number>)[col] || 0; bv = (b as unknown as Record<string, number>)[col] || 0 }
          if (av < bv) return -dir
          if (av > bv) return dir
          return 0
        })
      }
      return out
    }

    const SEGMENTOS = ['todos', 'top', 'sin-tel', 'contactar', 'activos', 'riesgo', 'dormidos', 'nuevos', 'otros']
    it.each(SEGMENTOS)('el segmento %s da las mismas filas en el mismo orden', (seg) => {
      const sort = { col: 'total_amount', dir: -1 }
      const a = filtrarLegacy(activosLegacy, '', seg, sort).map((c) => c.id)
      const b = filtrarOrdenar(port.activos, { q: '', seg, sort }).map((c) => c.id)
      expect(b).toEqual(a)
    })

    const COLUMNAS = ['name', 'contact', 'city', 'last_sale', 'proximo', 'total_amount', 'total_sales', 'avg_ticket', 'dias_ultimo']
    it.each(COLUMNAS)('ordenar por %s da el mismo orden en las dos direcciones', (col) => {
      for (const dir of [1, -1]) {
        const sort = { col, dir }
        const a = filtrarLegacy(activosLegacy, '', 'todos', sort).map((c) => c.id)
        const b = filtrarOrdenar(port.activos, { q: '', seg: 'todos', sort }).map((c) => c.id)
        expect(b).toEqual(a)
      }
    })

    it('el buscador filtra igual', () => {
      const sort = { col: 'total_amount', dir: -1 }
      // Un término que exista de verdad en los datos, no uno inventado.
      const q = (activosLegacy.find((c) => c.name && c.name.length > 4)?.name || 'a').slice(0, 4).toLowerCase()
      const a = filtrarLegacy(activosLegacy, q, 'todos', sort).map((c) => c.id)
      const b = filtrarOrdenar(port.activos, { q, seg: 'todos', sort }).map((c) => c.id)
      expect(b).toEqual(a)
      expect(b.length).toBeGreaterThan(0) // si filtra todo, el test no probó nada
    })
  })

  describe('resumenCompras · el modal del cliente más grande', () => {
    const { clienteId, detalles } = fx.resumenCompras
    const ventas = fx.mayorista.ventas.filter((v: { client_id: number }) => String(v.client_id) === String(clienteId))
    const legacy = cargarCRMLegacy({ today: AHORA, crmRows: fx.mayorista.ventas, crmClientes: clientes, crmSeg, crmTelOverride })

    // El legacy devuelve HTML. Se compara la SUSTANCIA (qué productos, qué
    // números), no el markup: el port devuelve datos y el HTML lo arma React.
    const html = legacy.renderResumenCompras({ ventas }, detalles)
    const port = resumenCompras(ventas, detalles)

    it('encuentra la misma "última compra"', () => {
      const m = html.match(/Última compra · (\d{2}\/\d{2}\/\d{4})/)
      expect(m).not.toBeNull()
      const [d, mes, a] = (m as RegExpMatchArray)[1].split('/')
      expect(port.ultima).not.toBeNull()
      // El legacy formatea con fmtFecha (new Date(iso) → local); acá se compara la fecha ISO.
      expect(`${a}-${mes}-${d}`).toBe(port.ultima?.fecha)
    })

    it('el top de productos coincide en nombre, unidades y veces', () => {
      // Filas del segundo <table> del HTML: producto | unidades | veces | precio
      const tabla = html.split('Lo que más te compró')[1] || ''
      const filas = [...tabla.matchAll(/<tr><td>(.*?)<\/td><td style="text-align:right;">(\d+)<\/td><td style="text-align:right;">(\d+)<\/td>/g)]
      expect(filas.length).toBe(port.top.length)
      filas.forEach((f, i) => {
        expect(Number(f[2])).toBe(port.top[i].unidades)
        expect(Number(f[3])).toBe(port.top[i].veces)
      })
    })

    it('el top tiene datos de verdad (si no, el test de arriba no prueba nada)', () => {
      expect(port.top.length).toBeGreaterThan(0)
      expect(port.top[0].unidades).toBeGreaterThan(0)
    })
  })

  describe('helpers de fecha y teléfono', () => {
    const legacy = cargarCRMLegacy({ today: AHORA, crmRows: [], crmClientes: {}, crmSeg, crmTelOverride })

    it('normalizeArgPhone coincide sobre los 653 teléfonos reales', () => {
      const tels = Object.values(crmTelOverride) as string[]
      expect(tels.length).toBeGreaterThan(100)
      expect(tels.map((t) => normalizeArgPhone(t))).toEqual(tels.map((t) => legacy.normalizeArgPhone(t)))
    })

    it('diasDesde coincide sobre todas las fechas de venta reales', () => {
      const fechas = [...new Set(fx.mayorista.ventas.map((v: { date_sale: string }) => v.date_sale))] as string[]
      expect(fechas.length).toBeGreaterThan(10)
      expect(fechas.map((f) => diasDesde(f, AHORA))).toEqual(fechas.map((f) => legacy.diasDesde(f)))
    })

    it('addDiasISO y diasHasta coinciden sobre las cadencias reales', () => {
      const isos = Object.values(crmSeg)
        .map((s) => (s as { ultimo_contacto?: string }).ultimo_contacto)
        .filter(Boolean) as string[]
      expect(isos.length).toBeGreaterThan(0)
      for (const n of [7, 15, 30]) {
        expect(isos.map((i) => addDiasISO(i, n))).toEqual(isos.map((i) => legacy.addDiasISO(i, n)))
      }
      expect(isos.map((i) => diasHasta(i, AHORA))).toEqual(isos.map((i) => legacy.diasHasta(i)))
    })
  })
}
