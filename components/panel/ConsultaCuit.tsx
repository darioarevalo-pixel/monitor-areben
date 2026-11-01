'use client'
/**
 * «Consultar un CUIT» (Bruno 31-oct): cualquier CUIT, sin ficha — el padrón de ARCA (razón social, condición, domicilio)
 * y la situación en el BCRA, juntos. Sólo lee: ⛔ guarda nada. Si uno de los dos falla, el otro se muestra igual.
 */
import { useState } from 'react'
import { Button, Field, Input, Modal } from '@/components/ui'
import { color, font } from '@/components/ui/tokens'
import { leerBcraCuit, leerPadronPanel, type BcraDelPanel, type PadronDelPanel } from '@/lib/erp/cliente'
import { ResumenBcra } from './Bcra'

const CONDICION: Record<string, string> = { ri: 'Responsable inscripto (sale factura A)', monotributo: 'Monotributo (sale factura A)', exento: 'Exento (sale factura B)', consumidor: 'Consumidor final (sale factura B)' }
const ROTULO = { fontSize: 11, fontWeight: 700, color: color.mut2, textTransform: 'uppercase' as const, letterSpacing: 0.4 }
const mensaje = (e: unknown, def: string) => (e instanceof Error ? e.message : def)

export function ConsultaCuit({ onCerrar }: { onCerrar: () => void }) {
  const [doc, setDoc] = useState('')
  const [arca, setArca] = useState<PadronDelPanel | 'cargando' | { error: string } | null>(null)
  const [bcra, setBcra] = useState<BcraDelPanel | 'cargando' | { error: string } | null>(null)
  const cuit = doc.replace(/\D/g, '')
  async function consultar() {
    setArca('cargando'); setBcra('cargando')
    await Promise.all([
      leerPadronPanel(cuit).then(setArca, (e) => setArca({ error: mensaje(e, 'No se pudo consultar ARCA.') })),
      leerBcraCuit(cuit).then(setBcra, (e) => setBcra({ error: mensaje(e, 'No se pudo consultar el BCRA.') })),
    ])
  }
  const cargando = arca === 'cargando' || bcra === 'cargando'
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Consultar un CUIT" pie={<Button variant="outline" onClick={onCerrar}>Cerrar</Button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="CUIT">
          <div style={{ display: 'flex', gap: 6 }}>
            <Input value={doc} inputMode="numeric" placeholder="30-12345678-9" onChange={(e) => setDoc(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && cuit.length === 11 && !cargando) void consultar() }} />
            <Button size="sm" variant="solid" tone="brand" disabled={cuit.length !== 11 || cargando} onClick={() => void consultar()}>{cargando ? 'Consultando…' : 'Consultar'}</Button>
          </div>
        </Field>
        {arca && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={ROTULO}>ARCA</div>
            {arca === 'cargando' ? <div style={{ fontSize: font.sm, color: color.mut2 }}>Consultando ARCA…</div>
              : 'error' in arca ? <div style={{ fontSize: font.sm, color: color.dangerInk }}>{arca.error}</div>
                : !arca.prendido ? <div style={{ fontSize: font.sm, color: color.mut2 }}>La búsqueda en ARCA está apagada.</div>
                  : (
                    <>
                      <div style={{ fontSize: font.sm, fontWeight: 700 }}>{arca.razonSocial || 'Sin razón social'}</div>
                      {arca.condicion && <div style={{ fontSize: font.sm }}>{CONDICION[arca.condicion] ?? arca.condicion}</div>}
                      {arca.domicilio && <div style={{ fontSize: font.sm, color: color.mut2 }}>{arca.domicilio}</div>}
                      {arca.estadoClave && arca.estadoClave !== 'ACTIVO' && <div style={{ fontSize: font.sm, color: color.warningInk }}>El CUIT figura {arca.estadoClave.toLowerCase()} en ARCA.</div>}
                      {arca.avisos.map((a) => <div key={a} style={{ fontSize: font.xs, color: color.warningInk }}>{a}</div>)}
                    </>
                  )}
          </div>
        )}
        {bcra && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={ROTULO}>Situación crediticia</div>
            {bcra !== 'cargando' && 'error' in bcra && !('prendido' in bcra)
              ? <div style={{ fontSize: font.sm, color: color.dangerInk }}>{bcra.error}</div>
              : <ResumenBcra r={bcra as BcraDelPanel | 'cargando'} />}
          </div>
        )}
      </div>
    </Modal>
  )
}
