'use client'

/**
 * **Cuentas a pagar** — la mitad de "A quién le debemos" que NO sale del dashboard.
 *
 * # Para qué está
 *
 * Hay cosas que se pagan igual que una deuda con el contador —"en vez de pagarme a mí, transferí a
 * esta cuenta"— y que el dashboard no conoce como acreedor: la cuota del crédito, las bolsas, el
 * alquiler. Conectar cada una al dashboard es el camino largo (la cuota de un préstamo vive en otra
 * tabla, con otro tipo de pago). Acá la cuenta se abre a mano y se usa con el mismo circuito de
 * compromisos de siempre.
 *
 * # 🔑 La cuenta se prende con un monto y se apaga sola
 *
 * La ficha —nombre y a dónde transferir— es permanente, pero está **dormida** mientras nadie le
 * cargue cuánto hay que juntar. Con un monto cargado se le puede pedir plata a un cliente; cuando
 * lo confirmado llega a ese número, la cuenta se apaga y vuelve a quedar libre.
 *
 * ⛔ **No es un ciclo mensual** (lo definió Bruno, 21-sep-2026): un mes la cuota se paga así y al
 * siguiente por débito. Una cuenta que se renovara sola estaría pidiendo plata para algo que ya
 * nadie está juntando.
 *
 * # ⛔ Lo que esta plata NO hace
 *
 * No le escribe un peso al dashboard. **El pago de verdad se sigue cargando allá como siempre**:
 * esto registra quién puso qué para juntarlo. Es el precio de que sea barata, y es lo que la deja
 * andar con el dashboard caído.
 *
 * # 🔑 Una fila por cuenta, y las quietas plegadas (25-sep-2026)
 *
 * Son ~30 cuentas que se usan **una vez por mes**: casi todas están quietas casi siempre. Arriba van
 * las que están juntando; las quietas quedan plegadas abajo, con el **«Activar» en la
 * fila misma**, porque ése es el gesto de todos los meses y no tiene que costar abrir nada.
 * Buscar por nombre despliega las quietas que coinciden. Ver `FilaDestino.tsx`.
 */

import { useState } from 'react'
import {
  Badge, Barra, BuscarInput, Button, Card, EmptyState, Field, Input, Modal, Notice, color, font, formatMoney, space,
} from '@/components/ui'
import { CuentaLinea } from './CuentaLinea'
import { Compromisos } from './Compromisos'
import { EstadoCompromisos, FilaDestino, TituloGrupo } from './FilaDestino'
import { useCuentas } from './useCuentas'
import { destinoDeCuenta } from '@/lib/compromisos/destino'
import { mostrar as plata, paraEditar, parsearMonto, type Compromiso } from '@/lib/compromisos/core'
import type { PuedeCompromisos } from '@/lib/compromisos/cliente'
import {
  archivarCuenta, cambiarMonto, cerrarObjetivo, crearCuenta, editarCuenta, empezarAJuntar,
  type CuentaManual, type DatosCuenta,
} from '@/lib/cuentas/cliente'

/** Con menos que esto el buscador es un casillero más para mirar. */
const BUSCAR_DESDE = 8

function fechaCorta(iso: string | null): string | null {
  if (!iso) return null
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function CuentasManuales({ compromisos, puedeCompromisos, onCambioCompromisos }: {
  /** Todos los compromisos: cada cuenta filtra los suyos. Los pide la sección una sola vez. */
  compromisos: Compromiso[]
  puedeCompromisos: PuedeCompromisos
  onCambioCompromisos: () => void
}) {
  const { cuentas, puede, cargando, error, recargar } = useCuentas()
  const [editando, setEditando] = useState<CuentaManual | 'nueva' | null>(null)
  const [verArchivadas, setVerArchivadas] = useState(false)
  const [verQuietas, setVerQuietas] = useState(false)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [buscar, setBuscar] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [falla, setFalla] = useState<string | null>(null)

  const archivadas = cuentas.filter((c) => c.archivada)
  const deSiempre = cuentas.filter((c) => !c.archivada)
  const q = normalizar(buscar.trim())
  const coincide = (c: CuentaManual) =>
    !q || normalizar(`${c.nombre} ${c.para_que ?? ''} ${c.cuenta_alias ?? ''}`).includes(q)

  const alaVista = (verArchivadas ? archivadas : deSiempre).filter(coincide)
  const juntando = alaVista.filter((c) => !c.archivada && c.objetivo)
  const quietas = alaVista.filter((c) => c.archivada || !c.objetivo)
  // Buscando, las quietas que coinciden se muestran solas: esconderlas es buscar y no encontrar.
  const quietasAbiertas = verArchivadas || verQuietas || !!q || juntando.length === 0

  async function correr(fn: () => Promise<string | void>) {
    setFalla(null)
    try {
      const msg = await fn()
      if (msg) setAviso(msg)
      recargar()
    } catch (e) {
      setFalla(e instanceof Error ? e.message : 'No se pudo.')
    }
  }

  if (cargando) return null

  const fila = (c: CuentaManual) => (
    <Cuenta
      key={c.id}
      cuenta={c}
      puedeAdministrar={puede.administrar}
      compromisos={compromisos}
      puedeCompromisos={puedeCompromisos}
      abierta={abierta === c.id}
      onToggle={() => setAbierta(abierta === c.id ? null : c.id)}
      onEditar={() => setEditando(c)}
      onCambio={() => { recargar(); onCambioCompromisos() }}
      correr={correr}
    />
  )

  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <div style={{ display: 'grid' }}>
          <h2 style={{ fontSize: font.lg, margin: 0 }}>Cuentas a pagar</h2>
          <span className="muted" style={{ fontSize: font.sm }}>
            Lo que no está en el dashboard: la cuota del crédito, las bolsas, el alquiler.
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
          {deSiempre.length >= BUSCAR_DESDE && (
            <div style={{ width: 220 }}>
              <BuscarInput value={buscar} onChange={setBuscar} placeholder="Buscar una cuenta…" />
            </div>
          )}
          {archivadas.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => { setVerArchivadas((v) => !v); setAbierta(null) }}>
              {verArchivadas ? 'Ver las de siempre' : `Ver las archivadas (${archivadas.length})`}
            </Button>
          )}
          {puede.administrar && (
            <Button size="sm" variant="soft" onClick={() => setEditando('nueva')}>Crear una cuenta</Button>
          )}
        </div>
      </div>

      {error && <Notice tone="danger"><span>{error}</span></Notice>}
      {falla && <Notice tone="danger"><span>{falla}</span></Notice>}
      {aviso && <Notice tone="success"><span>{aviso}</span></Notice>}

      {alaVista.length === 0 ? (
        <EmptyState
          title={
            q ? `Ninguna cuenta se llama «${buscar.trim()}»`
              : verArchivadas ? 'No hay ninguna cuenta archivada'
                : 'Todavía no hay ninguna cuenta'
          }
          hint={
            q || verArchivadas
              ? undefined
              : 'Una cuenta es a dónde pedirle a un cliente que transfiera: la cuota del crédito, las bolsas. Se crea una vez y se activa cada vez que hay que pagarla.'
          }
        />
      ) : (
        // La primera fila no lleva borde arriba: el de la card ya separa.
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ marginTop: -1 }}>
            {juntando.length > 0 && (
              <>
                <TituloGrupo n={juntando.length}>Activas</TituloGrupo>
                {juntando.map(fila)}
              </>
            )}
            {quietas.length > 0 && (
              <>
                {verArchivadas ? (
                  <TituloGrupo n={quietas.length}>Archivadas</TituloGrupo>
                ) : (
                  <button
                    type="button"
                    onClick={() => setVerQuietas((v) => !v)}
                    disabled={!!q || juntando.length === 0}
                    style={{
                      // ⛔ `height: auto`: `.shell-content button` le fija la altura de un control.
                      height: 'auto', width: '100%', textAlign: 'left', cursor: 'pointer',
                      background: 'transparent', border: 'none', borderTop: `1px solid ${color.line}`,
                      padding: `${space[2]}px ${space[4]}px`, display: 'flex', gap: space[2], alignItems: 'baseline',
                    }}
                  >
                    <span style={{ fontSize: font.xs, fontWeight: 700, color: color.mut, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }}>
                      {quietasAbiertas ? '▾' : '▸'} En pausa · {quietas.length}
                    </span>
                  </button>
                )}
                {quietasAbiertas && quietas.map(fila)}
              </>
            )}
          </div>
        </Card>
      )}

      <Modal
        abierto={!!editando}
        onCerrar={() => setEditando(null)}
        titulo={editando === 'nueva' ? 'Cuenta nueva' : 'Editar la cuenta'}
      >
        {editando && (
          <FormCuenta
            cuenta={editando === 'nueva' ? null : editando}
            onGuardar={async (datos) => {
              await correr(async () => {
                if (editando === 'nueva') await crearCuenta(datos)
                else await editarCuenta(editando.id, datos)
                setEditando(null)
              })
            }}
            onCancelar={() => setEditando(null)}
          />
        )}
      </Modal>
    </div>
  )
}

// ─── Una cuenta ───────────────────────────────────────────────────────────────

function Cuenta({ cuenta, puedeAdministrar, compromisos, puedeCompromisos, abierta, onToggle, onEditar, onCambio, correr }: {
  cuenta: CuentaManual
  puedeAdministrar: boolean
  compromisos: Compromiso[]
  puedeCompromisos: PuedeCompromisos
  abierta: boolean
  onToggle: () => void
  onEditar: () => void
  onCambio: () => void
  correr: (fn: () => Promise<string | void>) => Promise<void>
}) {
  const [montoAbierto, setMontoAbierto] = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)
  const o = cuenta.objetivo
  const destino = destinoDeCuenta(cuenta)
  const tieneCuenta = !!(cuenta.cuenta_alias || cuenta.cuenta_cbu)
  const bancaria = {
    id: cuenta.id,
    alias: cuenta.cuenta_alias,
    cbu: cuenta.cuenta_cbu,
    banco: cuenta.cuenta_banco,
    titular: cuenta.cuenta_titular,
    sugerida: true,
  }

  return (
    <>
    <FilaDestino
      nombre={cuenta.nombre}
      detalle={o?.nota || cuenta.para_que || undefined}
      abierto={abierta}
      onToggle={onToggle}
      cuenta={tieneCuenta ? bancaria : null}
      monto={
        o ? (
          <div style={{ display: 'grid', gap: 3 }}>
            <span>
              Falta <b style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(o.falta)}</b>{' '}
              <span className="muted" style={{ fontSize: font.xs }}>de {formatMoney(o.monto)}</span>
            </span>
            <Barra pct={o.monto > 0 ? (o.juntado / o.monto) * 100 : 0} tono={color.success} ancho={150} />
          </div>
        ) : (
          <span style={{ color: color.mut2 }}>{cuenta.archivada ? 'Archivada' : 'En pausa'}</span>
        )
      }
      estado={o ? <EstadoCompromisos destinoId={cuenta.id} compromisos={compromisos} /> : null}
      accion={
        puedeAdministrar && !o && !cuenta.archivada ? (
          <Button size="sm" variant="soft" onClick={() => setMontoAbierto(true)}>Activar</Button>
        ) : undefined
      }
    >
      <div style={{ display: 'grid', gap: space[3] }}>
        {o && cuenta.para_que && o.nota && (
          <p className="muted" style={{ fontSize: font.sm, margin: 0 }}>{cuenta.para_que}</p>
        )}

        {tieneCuenta ? (
          <CuentaLinea sinChapa cuenta={bancaria} />
        ) : (
          <p className="muted" style={{ fontSize: font.sm, margin: 0 }}>
            No tiene alias ni CBU cargado. Sin eso no hay qué pasarle al cliente: se carga con Editar.
          </p>
        )}

        {o && (
          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'center', fontSize: font.base }}>
            {/* Pedido y Disponible los dice el bloque de compromisos, justo abajo. */}
            <span>Acreditado <b>{plata(o.juntado)}</b> de {plata(o.monto)}</span>
          </div>
        )}

        {destino && (
          <Compromisos
            destino={destino}
            compromisos={compromisos}
            puede={puedeCompromisos}
            onCambio={onCambio}
          />
        )}

        {cuenta.historial.length > 0 && (
          <div>
            <Button size="sm" variant="ghost" onClick={() => setVerHistorial((v) => !v)}>
              {verHistorial ? 'Ocultar historial' : `Ver historial (${cuenta.historial.length})`}
            </Button>
            {verHistorial && (
              <ul style={{ display: 'grid', gap: space[1], listStyle: 'none', padding: 0, margin: `${space[2]}px 0 0` }}>
                {cuenta.historial.map((h) => (
                  <li key={h.id} style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', fontSize: font.base }}>
                    <Badge tone={h.estado === 'completo' ? 'success' : 'neutral'}>
                      {h.estado === 'completo' ? 'Pagada' : 'Pausada'}
                    </Badge>
                    <b>{plata(h.juntado)}</b>
                    <span className="muted">de {plata(h.monto)}</span>
                    {h.nota && <span>· {h.nota}</span>}
                    <span className="muted">· {fechaCorta(h.cerrado_en)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {puedeAdministrar && (
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', borderTop: `1px solid ${color.line}`, paddingTop: space[3] }}>
            {o && (
              <>
                <Button size="sm" variant="soft" onClick={() => setMontoAbierto(true)}>Editar monto</Button>
                {/* Las dos salidas a mano. La normal la hace sola el sistema cuando se acredita
                    la última transferencia. */}
                <Button
                  size="sm"
                  variant="soft"
                  onClick={() => correr(async () => {
                    const r = await cerrarObjetivo(o.id, 'completo')
                    onCambio()
                    return r.abiertos > 0
                      ? `Listo, ${cuenta.nombre} quedó pagada. Ojo: quedan ${r.abiertos} pedidos abiertos; cancelalos si ya no van.`
                      : `Listo, ${cuenta.nombre} quedó pagada.`
                  })}
                >
                  Marcar pagada
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => correr(async () => {
                    const r = await cerrarObjetivo(o.id, 'cancelado')
                    onCambio()
                    return r.abiertos > 0
                      ? `${cuenta.nombre} quedó en pausa. Quedan ${r.abiertos} pedidos abiertos: cancelalos si ya no van.`
                      : `${cuenta.nombre} quedó en pausa.`
                  })}
                >
                  Pausar
                </Button>
              </>
            )}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: space[2] }}>
              <Button size="sm" variant="ghost" onClick={onEditar}>Editar</Button>
              {!o && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => correr(async () => {
                    await archivarCuenta(cuenta.id, !cuenta.archivada)
                    return cuenta.archivada ? `${cuenta.nombre} volvió a la lista.` : `${cuenta.nombre} quedó archivada.`
                  })}
                >
                  {cuenta.archivada ? 'Sacar de archivadas' : 'Archivar'}
                </Button>
              )}
            </span>
          </div>
        )}
      </div>
    </FilaDestino>

      {/* Fuera de la fila: el «Activar» lo abre con la fila CERRADA. */}
      <Modal
        abierto={montoAbierto}
        onCerrar={() => setMontoAbierto(false)}
        titulo={o ? `Editar monto · ${cuenta.nombre}` : `Activar ${cuenta.nombre}`}
      >
        <FormMonto
          objetivo={o}
          onGuardar={async (monto, nota) => {
            await correr(async () => {
              if (o) await cambiarMonto(o.id, monto, nota)
              else await empezarAJuntar(cuenta.id, monto, nota)
              setMontoAbierto(false)
              return o ? undefined : `${cuenta.nombre} quedó activa por ${formatMoney(monto)}.`
            })
          }}
          onCancelar={() => setMontoAbierto(false)}
        />
      </Modal>
    </>
  )
}

// ─── La ficha ─────────────────────────────────────────────────────────────────

function FormCuenta({ cuenta, onGuardar, onCancelar }: {
  cuenta: CuentaManual | null
  onGuardar: (d: DatosCuenta) => Promise<void>
  onCancelar: () => void
}) {
  const [nombre, setNombre] = useState(cuenta?.nombre ?? '')
  const [paraQue, setParaQue] = useState(cuenta?.para_que ?? '')
  const [alias, setAlias] = useState(cuenta?.cuenta_alias ?? '')
  const [cbu, setCbu] = useState(cuenta?.cuenta_cbu ?? '')
  const [banco, setBanco] = useState(cuenta?.cuenta_banco ?? '')
  const [titular, setTitular] = useState(cuenta?.cuenta_titular ?? '')
  const [guardando, setGuardando] = useState(false)

  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <Field label="¿Cómo se llama?" hint="Es lo que se va a ver al elegir a dónde transferir.">
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Cuota del crédito" autoFocus />
      </Field>
      <Field label="¿Para qué es? (opcional)">
        <Input value={paraQue} onChange={(e) => setParaQue(e.target.value)} placeholder="Ej: el crédito del Galicia, vence el 10" />
      </Field>
      <Field label="Alias" hint="Es lo que se le pasa al cliente por WhatsApp.">
        <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Ej: credito.bdi.gal" />
      </Field>
      <Field label="CBU">
        <Input value={cbu} onChange={(e) => setCbu(e.target.value)} inputMode="numeric" placeholder="22 números" />
      </Field>
      <Field label="Banco (opcional)">
        <Input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Ej: Galicia" />
      </Field>
      <Field label="¿A nombre de quién está la cuenta? (opcional)">
        <Input value={titular} onChange={(e) => setTitular(e.target.value)} placeholder="Ej: Areben SRL" />
      </Field>

      {cuenta && (
        <p className="muted" style={{ fontSize: 12 }}>
          Cambiar el alias o el CBU no toca los compromisos ya anotados: cada uno guardó a dónde se
          mandó esa plata.
        </p>
      )}

      <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
        <Button
          disabled={!nombre.trim() || guardando}
          onClick={async () => {
            setGuardando(true)
            try {
              await onGuardar({
                nombre: nombre.trim(),
                para_que: paraQue.trim() || null,
                cuenta_alias: alias.trim() || null,
                cuenta_cbu: cbu.trim() || null,
                cuenta_banco: banco.trim() || null,
                cuenta_titular: titular.trim() || null,
              })
            } finally {
              setGuardando(false)
            }
          }}
        >
          Guardar
        </Button>
      </div>
    </div>
  )
}

// ─── Cuánto hay que juntar ────────────────────────────────────────────────────

function FormMonto({ objetivo, onGuardar, onCancelar }: {
  objetivo: CuentaManual['objetivo']
  onGuardar: (monto: number, nota: string | null) => Promise<void>
  onCancelar: () => void
}) {
  // ⛔ `paraEditar` y no `String(...)`: ver el bloque de `lib/compromisos/plata.core.js`. Un punto
  // leído como separador de miles es el bug que multiplicaba los montos por cien.
  const [monto, setMonto] = useState(objetivo ? paraEditar(objetivo.monto) : '')
  const [nota, setNota] = useState(objetivo?.nota ?? '')
  const [guardando, setGuardando] = useState(false)

  const n = parsearMonto(monto)
  // Bajarlo por debajo de lo que ya entró lo dejaría completo hacia atrás: el servidor lo rechaza
  // y acá se dice antes, para no hacer viajar un error evitable.
  const muyBajo = !!objetivo && Number.isFinite(n) && n < objetivo.juntado - 0.005
  const listo = Number.isFinite(n) && n > 0 && !muyBajo

  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <Field
        label="Monto a pagar"
        hint={objetivo ? `Acreditado hasta ahora: ${plata(objetivo.juntado)}.` : 'Mientras esté activa, la cuenta aparece para pedirle a un cliente que transfiera.'}
      >
        <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="0" autoFocus />
      </Field>
      <Field label="Nota (opcional)" hint="Para reconocerlo después en el historial.">
        <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: cuota de septiembre" />
      </Field>

      {muyBajo && objetivo && (
        <Notice tone="danger">
          <span>
            Ya se acreditaron {plata(objetivo.juntado)}, así que el monto no puede ser menor. Si con eso
            ya está, cerrala con <b>Marcar pagada</b>.
          </span>
        </Notice>
      )}

      {!objetivo && (
        <p className="muted" style={{ fontSize: 12 }}>
          Cuando lo acreditado llegue a ese monto, la cuenta queda pagada y vuelve a pausa sola.
        </p>
      )}

      <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
        <Button
          disabled={!listo || guardando}
          onClick={async () => {
            setGuardando(true)
            try {
              await onGuardar(n, nota.trim() || null)
            } finally {
              setGuardando(false)
            }
          }}
        >
          {objetivo ? 'Guardar' : 'Activar'}
        </Button>
      </div>
    </div>
  )
}
