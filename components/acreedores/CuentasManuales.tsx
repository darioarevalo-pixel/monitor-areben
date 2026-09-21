'use client'

/**
 * **Cuentas para juntar plata** — la mitad de "A quién le debemos" que NO sale del dashboard.
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
 */

import { useState } from 'react'
import {
  Badge, Button, EmptyState, Field, Input, Modal, Notice, SectionCard, formatMoney, space,
} from '@/components/ui'
import { CuentaLinea } from './CuentaLinea'
import { Compromisos } from './Compromisos'
import { useCuentas } from './useCuentas'
import { destinoDeCuenta } from '@/lib/compromisos/destino'
import { mostrar as plata, paraEditar, parsearMonto, type Compromiso } from '@/lib/compromisos/core'
import type { PuedeCompromisos } from '@/lib/compromisos/cliente'
import {
  archivarCuenta, cambiarMonto, cerrarObjetivo, crearCuenta, editarCuenta, empezarAJuntar,
  type CuentaManual, type DatosCuenta,
} from '@/lib/cuentas/cliente'

function fechaCorta(iso: string | null): string | null {
  if (!iso) return null
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
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
  const [aviso, setAviso] = useState<string | null>(null)
  const [falla, setFalla] = useState<string | null>(null)

  const alaVista = cuentas.filter((c) => (verArchivadas ? c.archivada : !c.archivada))
  const archivadas = cuentas.filter((c) => c.archivada).length

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

  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[3], flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>Cuentas para juntar plata</h2>
        <span className="muted" style={{ fontSize: 12 }}>
          Para lo que no está en el dashboard: la cuota del crédito, las bolsas, el alquiler.
        </span>
        {puede.administrar && (
          <Button size="sm" variant="soft" onClick={() => setEditando('nueva')}>Crear una cuenta</Button>
        )}
        {archivadas > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setVerArchivadas((v) => !v)}>
            {verArchivadas ? 'Ver las de siempre' : `Ver las archivadas (${archivadas})`}
          </Button>
        )}
      </div>

      {error && <Notice tone="danger"><span>{error}</span></Notice>}
      {falla && <Notice tone="danger"><span>{falla}</span></Notice>}
      {aviso && <Notice tone="success"><span>{aviso}</span></Notice>}

      {alaVista.length === 0 ? (
        <EmptyState
          title={verArchivadas ? 'No hay ninguna cuenta archivada' : 'Todavía no hay ninguna cuenta'}
          hint={
            verArchivadas
              ? undefined
              : 'Una cuenta es un lugar a dónde pedirle a un cliente que transfiera: la cuota del crédito, las bolsas. Se crea una vez y se usa cada vez que haga falta juntar plata.'
          }
        />
      ) : (
        alaVista.map((c) => (
          <Cuenta
            key={c.id}
            cuenta={c}
            puedeAdministrar={puede.administrar}
            compromisos={compromisos}
            puedeCompromisos={puedeCompromisos}
            onEditar={() => setEditando(c)}
            onCambio={() => { recargar(); onCambioCompromisos() }}
            correr={correr}
          />
        ))
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

function Cuenta({ cuenta, puedeAdministrar, compromisos, puedeCompromisos, onEditar, onCambio, correr }: {
  cuenta: CuentaManual
  puedeAdministrar: boolean
  compromisos: Compromiso[]
  puedeCompromisos: PuedeCompromisos
  onEditar: () => void
  onCambio: () => void
  correr: (fn: () => Promise<string | void>) => Promise<void>
}) {
  const [montoAbierto, setMontoAbierto] = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)
  const o = cuenta.objetivo
  const destino = destinoDeCuenta(cuenta)

  return (
    <SectionCard
      title={cuenta.nombre}
      subtitle={
        o
          ? `Faltan juntar ${formatMoney(o.falta)} de ${formatMoney(o.monto)}${o.nota ? ` · ${o.nota}` : ''}`
          : cuenta.archivada
            ? 'Archivada'
            : 'No se está juntando nada ahora'
      }
      actions={
        puedeAdministrar ? (
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            {!cuenta.archivada && !o && (
              <Button size="sm" onClick={() => setMontoAbierto(true)}>Empezar a juntar</Button>
            )}
            {o && <Button size="sm" variant="soft" onClick={() => setMontoAbierto(true)}>Cambiar el monto</Button>}
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
          </div>
        ) : undefined
      }
    >
      {cuenta.para_que && <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>{cuenta.para_que}</p>}

      {cuenta.cuenta_alias || cuenta.cuenta_cbu ? (
        <CuentaLinea
          sinChapa
          cuenta={{
            id: cuenta.id,
            alias: cuenta.cuenta_alias,
            cbu: cuenta.cuenta_cbu,
            banco: cuenta.cuenta_banco,
            titular: cuenta.cuenta_titular,
            sugerida: true,
          }}
        />
      ) : (
        <p className="muted" style={{ fontSize: 12 }}>
          No tiene alias ni CBU cargado. Sin eso no hay qué pasarle al cliente: se carga con Editar.
        </p>
      )}

      {o && (
        <div style={{ display: 'grid', gap: space[2], marginTop: space[3] }}>
          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
            <span>Ya entraron <b>{plata(o.juntado)}</b></span>
            {o.comprometido > 0 && <span className="muted">· {plata(o.comprometido)} comprometidos y sin entrar</span>}
            <span className="muted">· se puede pedir hasta <b>{plata(o.sePuedePedir)}</b></span>
          </div>

          {puedeAdministrar && (
            <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
              {/* Las dos salidas que no son "se juntó todo". La normal la hace sola el sistema
                  cuando entra la última transferencia. */}
              <Button
                size="sm"
                variant="soft"
                onClick={() => correr(async () => {
                  const r = await cerrarObjetivo(o.id, 'completo')
                  onCambio()
                  return r.abiertos > 0
                    ? `Listo, ${cuenta.nombre} quedó libre. Ojo: quedan ${r.abiertos} compromisos sin entrar; cancelalos si ya no van.`
                    : `Listo, ${cuenta.nombre} quedó libre.`
                })}
              >
                Ya está pagado
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => correr(async () => {
                  const r = await cerrarObjetivo(o.id, 'cancelado')
                  onCambio()
                  return r.abiertos > 0
                    ? `Se dejó de juntar para ${cuenta.nombre}. Quedan ${r.abiertos} compromisos sin entrar: cancelalos si ya no van.`
                    : `Se dejó de juntar para ${cuenta.nombre}.`
                })}
              >
                Se paga de otra forma
              </Button>
            </div>
          )}
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

      {!o && !cuenta.archivada && (
        <p className="muted" style={{ fontSize: 12, marginTop: space[3] }}>
          Esta cuenta está quieta. Para volver a pedirle plata a un cliente, cargale cuánto hay que
          juntar con <b>Empezar a juntar</b>.
        </p>
      )}

      {cuenta.historial.length > 0 && (
        <div style={{ marginTop: space[3] }}>
          <Button size="sm" variant="ghost" onClick={() => setVerHistorial((v) => !v)}>
            {verHistorial ? 'Ocultar lo anterior' : `Ver las ${cuenta.historial.length} veces anteriores`}
          </Button>
          {verHistorial && (
            <ul style={{ display: 'grid', gap: space[1], listStyle: 'none', padding: 0, margin: `${space[2]}px 0 0` }}>
              {cuenta.historial.map((h) => (
                <li key={h.id} style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                  <Badge tone={h.estado === 'completo' ? 'success' : 'neutral'}>
                    {h.estado === 'completo' ? 'se juntó' : 'se dejó de juntar'}
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

      <Modal
        abierto={montoAbierto}
        onCerrar={() => setMontoAbierto(false)}
        titulo={o ? `Cambiar cuánto hay que juntar` : `¿Cuánto hay que juntar para ${cuenta.nombre}?`}
      >
        <FormMonto
          objetivo={o}
          onGuardar={async (monto, nota) => {
            await correr(async () => {
              if (o) await cambiarMonto(o.id, monto, nota)
              else await empezarAJuntar(cuenta.id, monto, nota)
              setMontoAbierto(false)
              return o ? undefined : `${cuenta.nombre} está juntando ${formatMoney(monto)}.`
            })
          }}
          onCancelar={() => setMontoAbierto(false)}
        />
      </Modal>
    </SectionCard>
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
        label="¿Cuánto hay que juntar?"
        hint={objetivo ? `Ya entraron ${plata(objetivo.juntado)}.` : 'Mientras haya un monto cargado, la cuenta aparece para pedirle plata a un cliente.'}
      >
        <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="0" autoFocus />
      </Field>
      <Field label="¿Qué es? (opcional)" hint="Para reconocerlo después, cuando esto quede en la lista de lo anterior.">
        <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: cuota de septiembre" />
      </Field>

      {muyBajo && objetivo && (
        <Notice tone="danger">
          <span>
            Ya entraron {plata(objetivo.juntado)}, así que el monto no puede ser menor. Si con eso ya
            está, cerralo con <b>Ya está pagado</b>.
          </span>
        </Notice>
      )}

      {!objetivo && (
        <p className="muted" style={{ fontSize: 12 }}>
          Cuando lo que entre llegue a ese número, la cuenta se apaga sola y queda libre hasta que le
          cargues un monto nuevo.
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
          {objetivo ? 'Guardar' : 'Empezar a juntar'}
        </Button>
      </div>
    </div>
  )
}
