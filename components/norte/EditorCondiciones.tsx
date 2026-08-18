'use client'

import { useState } from 'react'
import type { Marca } from '@/lib/nav.datos'
import { guardarCondiciones } from '@/lib/norte/persistencia'
import { estadoDeCompra } from '@/lib/norte/core'
import type { CostoBloque, Cuota, ImportacionProyectada, Moneda } from '@/lib/norte/tipos'
import { Button, Card, Field, Input, Notice, Select, color, font, space } from '@/components/ui'

/**
 * El formulario que hace existir el dato que falta: **el costo y los plazos de una importación**.
 *
 * Las unidades, los modelos y la fecha de llegada NO se editan acá — son de Compras → Ingresos
 * proyectados, y duplicarlas garantizaría dos verdades. Acá va sólo lo económico.
 *
 * 🔑 **La fecha de cada cuota se puede pisar a mano, y es la razón por la que este editor existe
 * así.** «A 30 días» del 7-ago da 6-sep contando días, pero el proveedor cobra el 7-sep: en la
 * práctica «30 y 60» quiere decir «el mismo día de los dos meses que siguen». Forzar la aritmética
 * corría cada vencimiento un día, y un día antes se lee como un pago adelantado.
 */
export function EditorCondiciones({
  marca,
  importacion,
  onListo,
}: {
  marca: Marca
  importacion: ImportacionProyectada
  onListo: () => void
}) {
  const c = importacion.condiciones
  const [fechaFactura, setFechaFactura] = useState(c?.fechaFactura || '')
  const [moneda, setMoneda] = useState<Moneda>(c?.moneda || 'USD')
  /**
   * A cuánto se pesificó. Texto y no número para poder distinguir el campo **vacío** («todavía no
   * se emitieron los cheques») de un cero escrito: un `Number('')` da 0 y eso pesificaría la deuda
   * entera a cero sin que nada falle.
   */
  const [cotizacion, setCotizacion] = useState(c?.cotizacion == null ? '' : String(c.cotizacion))
  const [cuotas, setCuotas] = useState<Cuota[]>(c?.cuotas?.length ? c.cuotas : [{ dias: 30, pct: 50 }, { dias: 60, pct: 50 }])
  const [nota, setNota] = useState(c?.nota || '')
  const [confirmado, setConfirmado] = useState(Boolean(c?.confirmado))
  const [fechaIngreso, setFechaIngreso] = useState(c?.fechaIngreso || '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Una fila por bloque del ingreso, en el orden del ingreso. **El texto vacío no es un cero**: es
   * «todavía no lo sé», y por eso el estado guarda strings y no números — un 0 en pantalla afirma
   * que ese material no cuesta nada.
   */
  const [porBloque, setPorBloque] = useState<Record<string, { costo: string; unidades: string }>>(() => {
    const previos = new Map((c?.costos || []).map((x) => [x.bloqueId, x]))
    const init: Record<string, { costo: string; unidades: string }> = {}
    for (const b of importacion.bloques) {
      const p = previos.get(b.id)
      init[b.id] = {
        costo: p ? String(p.costo) : '',
        unidades: p && p.unidades !== null && p.unidades !== undefined ? String(p.unidades) : '',
      }
    }
    return init
  })

  /** `null` = sin pesificar. ⛔ No se usa `|| null`: un 0 escrito a mano no es «no lo sé». */
  const cotizacionNum = cotizacion.trim() === '' ? null : Number(cotizacion) || 0

  const costos: CostoBloque[] = importacion.bloques.map((b) => ({
    bloqueId: b.id,
    nombre: b.nombre,
    costo: Number(porBloque[b.id]?.costo) || 0,
    unidades: (porBloque[b.id]?.unidades || '').trim() === '' ? null : Number(porBloque[b.id].unidades) || 0,
  }))

  /**
   * El estado se calcula con el MISMO motor que la pantalla de atrás, sobre lo que hay escrito
   * ahora. Así el editor no tiene su propia idea de qué falta: si el peldaño cambia al guardar, es
   * porque cambió el dato, no la cuenta.
   */
  const estado = estadoDeCompra({
    ...importacion,
    condiciones: { ingresoId: importacion.id, fechaFactura, costos, moneda, cuotas, nota, confirmado, fechaIngreso, cotizacion: cotizacionNum },
  })
  const suma = cuotas.reduce((a, x) => a + (Number(x.pct) || 0), 0)
  const huerfanos = (c?.costos || []).filter((x) => !importacion.bloques.some((b) => b.id === x.bloqueId))

  function setCuota(i: number, campo: keyof Cuota, valor: string) {
    setCuotas((prev) =>
      prev.map((x, j) => {
        if (j !== i) return x
        if (campo === 'fecha') return { ...x, fecha: valor || undefined }
        return { ...x, [campo]: Number(valor) || 0 }
      }),
    )
  }

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      await guardarCondiciones(marca, {
        ingresoId: importacion.id,
        fechaFactura,
        // Sólo viajan las filas con algo escrito. Una fila vacía es «todavía no lo sé» y no se
        // manda; un 0 escrito a mano sí viaja, y el motor lo lee igual como «falta el costo» —
        // ⛔ ese umbral se decide en UN lugar (`estadoDeCompra`), no acá.
        costos: costos.filter((x) => (porBloque[x.bloqueId]?.costo || '').trim() !== ''),
        moneda,
        cotizacion: cotizacionNum,
        cuotas,
        nota,
        confirmado,
        fechaIngreso,
      })
      onListo()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
      setGuardando(false)
    }
  }

  return (
    <Card style={{ marginTop: space[3], background: color.bg2 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontWeight: 600 }}>
          {importacion.desc} · {importacion.unidades.toLocaleString('es-AR')} unidades
        </div>

        {error && <Notice tone="danger">{error}</Notice>}

        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          <Field label="Fecha de la factura" hint="No la de llegada: los plazos cuentan desde acá">
            <Input type="date" value={fechaFactura} onChange={(e) => setFechaFactura(e.target.value)} />
          </Field>
          <Field label="Moneda" hint="Es una por factura, no por material">
            <Select value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
            </Select>
          </Field>
          {/* 🔑 Va sólo en USD: en ARS la deuda ya está en pesos y preguntar el cambio sería pedir
              un dato que no existe. El texto dice CUÁNDO se sabe, que es lo que nadie adivina. */}
          {moneda === 'USD' && (
            <Field label="Pesificada a" hint="El dólar al que se emitieron los cheques. Vacío = todavía no se emitieron">
              <Input
                type="number"
                value={cotizacion}
                onChange={(e) => setCotizacion(e.target.value)}
                placeholder="1380"
                style={{ width: 120 }}
              />
            </Field>
          )}
          <Field label="Fecha de ingreso" hint="La real, la que se firma con el tilde">
            <Input type="date" value={fechaIngreso} onChange={(e) => setFechaIngreso(e.target.value)} />
          </Field>
        </div>

        <label style={{ display: 'flex', gap: space[2], alignItems: 'center', fontSize: font.md }}>
          <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
          <span>
            <strong>Ingreso confirmado.</strong>{' '}
            <span style={{ color: color.mut }}>
              Sin esto la compra proyecta contra la llegada estimada, y no entra al calendario de pagos.
            </span>
          </span>
        </label>

        <div>
          <div style={{ fontSize: font.md, fontWeight: 600, marginBottom: space[2] }}>
            Costo por material
          </div>
          <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[2] }}>
            Los materiales y sus unidades son los bloques de Compras → Ingresos proyectados. Acá va sólo el precio.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            {importacion.bloques.map((b) => (
              <div key={b.id} style={{ display: 'flex', gap: space[2], alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <Field label={b.nombre.trim() || 'Bloque sin nombre'} hint={`${b.unidades.toLocaleString('es-AR')} unidades`}>
                  <Input
                    type="number"
                    step="0.01"
                    value={porBloque[b.id]?.costo ?? ''}
                    onChange={(e) => setPorBloque((p) => ({ ...p, [b.id]: { ...p[b.id], costo: e.target.value } }))}
                    placeholder="1.08"
                    style={{ width: 120 }}
                  />
                </Field>
                <Field label="Unidades facturadas" hint="Vacío = las del pedido">
                  <Input
                    type="number"
                    value={porBloque[b.id]?.unidades ?? ''}
                    onChange={(e) => setPorBloque((p) => ({ ...p, [b.id]: { ...p[b.id], unidades: e.target.value } }))}
                    placeholder="—"
                    style={{ width: 120 }}
                  />
                </Field>
              </div>
            ))}
          </div>
          {huerfanos.length > 0 && (
            <Notice tone="warning">
              Hay {huerfanos.length === 1 ? 'un costo cargado' : `${huerfanos.length} costos cargados`} de un material que
              ya no está en el ingreso ({huerfanos.map((h) => h.nombre || 'sin nombre').join(', ')}). No suma al total.
              Guardar acá lo borra.
            </Notice>
          )}
        </div>

        <div>
          <div style={{ fontSize: font.md, fontWeight: 600, marginBottom: space[2] }}>Cuotas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            {cuotas.map((cu, i) => (
              <div key={i} style={{ display: 'flex', gap: space[2], alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <Field label="Días">
                  <Input type="number" value={cu.dias} onChange={(e) => setCuota(i, 'dias', e.target.value)} style={{ width: 80 }} />
                </Field>
                <Field label="%">
                  <Input type="number" value={cu.pct} onChange={(e) => setCuota(i, 'pct', e.target.value)} style={{ width: 80 }} />
                </Field>
                <Field label="Fecha pactada" hint="Pisa a los días">
                  <Input type="date" value={cu.fecha || ''} onChange={(e) => setCuota(i, 'fecha', e.target.value)} />
                </Field>
                <Button
                  size="sm"
                  variant="outline"
                  tone="danger"
                  onClick={() => setCuotas((p) => p.filter((_, j) => j !== i))}
                >
                  Quitar
                </Button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: space[2], display: 'flex', gap: space[3], alignItems: 'center' }}>
            <Button size="sm" variant="outline" onClick={() => setCuotas((p) => [...p, { dias: 90, pct: 0 }])}>
              Agregar cuota
            </Button>
            <span style={{ fontSize: font.sm, color: suma === 100 ? color.mut : color.warning }}>
              Suman {suma}%{suma !== 100 && ' — no llega a 100, se guarda igual'}
            </span>
          </div>
        </div>

        <Field label="Nota">
          <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="lo que haga falta recordar" />
        </Field>

        <div style={{ display: 'flex', gap: space[3], alignItems: 'center' }}>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
          <span style={{ fontSize: font.md, color: color.mut }}>
            {estado.peldano === 'incompleta' ? (
              <>Falta {estado.falta}</>
            ) : (
              <>
                Total: {moneda} {Math.round(estado.total).toLocaleString('es-AR')} sobre{' '}
                {estado.unidades.toLocaleString('es-AR')} unidades ·{' '}
                {estado.peldano === 'firme'
                  ? 'entra al calendario de pagos'
                  : `estimado desde ${estado.desde} — falta ${estado.falta}`}
              </>
            )}
          </span>
        </div>
      </div>
    </Card>
  )
}
