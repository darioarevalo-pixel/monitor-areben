'use client'

import { useState } from 'react'
import type { Marca } from '@/lib/nav.datos'
import { guardarCondiciones } from '@/lib/norte/persistencia'
import type { Cuota, ImportacionProyectada, Moneda } from '@/lib/norte/tipos'
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
  const [costoUnitario, setCostoUnitario] = useState(String(c?.costoUnitario ?? ''))
  const [moneda, setMoneda] = useState<Moneda>(c?.moneda || 'USD')
  const [unidades, setUnidades] = useState(c?.unidades === null || c?.unidades === undefined ? '' : String(c.unidades))
  const [cuotas, setCuotas] = useState<Cuota[]>(c?.cuotas?.length ? c.cuotas : [{ dias: 30, pct: 50 }, { dias: 60, pct: 50 }])
  const [nota, setNota] = useState(c?.nota || '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const suma = cuotas.reduce((a, x) => a + (Number(x.pct) || 0), 0)
  const unidadesEfectivas = unidades.trim() === '' ? importacion.unidades : Number(unidades) || 0
  const total = unidadesEfectivas * (Number(costoUnitario) || 0)

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
        costoUnitario: Number(costoUnitario) || 0,
        moneda,
        // '' significa «usá el total vivo del KV». Un 0 explícito es otra cosa y se respeta.
        unidades: unidades.trim() === '' ? null : Number(unidades) || 0,
        cuotas,
        nota,
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
          <Field label="Costo unitario">
            <Input
              type="number"
              step="0.01"
              value={costoUnitario}
              onChange={(e) => setCostoUnitario(e.target.value)}
              placeholder="1.08"
            />
          </Field>
          <Field label="Moneda">
            <Select value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
            </Select>
          </Field>
          <Field label="Unidades facturadas" hint={`Vacío = las ${importacion.unidades.toLocaleString('es-AR')} del pedido`}>
            <Input type="number" value={unidades} onChange={(e) => setUnidades(e.target.value)} placeholder="—" />
          </Field>
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
            Total: {moneda} {Math.round(total).toLocaleString('es-AR')}
          </span>
        </div>
      </div>
    </Card>
  )
}
