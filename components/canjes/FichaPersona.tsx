'use client'

/**
 * La ficha de una persona del padrón.
 *
 * Es lo que reemplaza a la planilla desde el día uno: el @ clickeable, el WhatsApp, la dirección
 * para despachar, el talle o el modelo de celular, las notas, y **el historial cruzado de todas las
 * marcas** — que es el dato que hoy no existe en ningún lado.
 *
 * Los canjes de otras marcas se muestran **en modo ciego** (marca, fecha y estado, sin poder
 * abrirlos). No es una decisión estética: ocultar la *existencia* destruiría la única razón por la
 * que el padrón es compartido, y ocultar la *plata* no cuesta nada. El filtrado lo hace el
 * servidor: acá no hay plata que esconder porque nunca llegó.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Badge, Button, Card, EmptyState, Field, Input, Modal, Notice, SectionCard, Select, StatusPill,
  color, font, space, weight, useConfirmar, useToast, type Tone,
} from '@/components/ui'
import { normalizeArgPhone } from '@/lib/crm/core'
import {
  agregarNota, borrarNota, editarPersona, esCiego, leerPersona, numeroDe,
  type CamposPersona, type CanjeVisible,
} from '@/lib/canjes/cliente'
import { instagramHref, instagramParaMostrar, tiktokHref } from '@/lib/canjes/instagram'
import { CONTACTO_LABEL, estadoDeContacto, type EstadoContacto } from '@/lib/canjes/seguimiento'
import {
  ESTADO_CANJE_LABEL, STORE_LABEL, nombrePersona, queDatoPide, tieneDireccion, tieneDatosDeMarca,
  type CanjePersona, type CanjeStore, type EstadoCanje, type TallesPersona,
} from '@/lib/canjes/tipos'

const CONTACTO_TONE: Record<EstadoContacto, Tone> = {
  vencido: 'warning',
  proximo: 'action',
  nunca: 'neutral',
  aldia: 'success',
}

const ESTADO_TONE: Record<EstadoCanje, Tone> = {
  borrador: 'neutral',
  propuesta: 'warning',
  rechazado: 'neutral',
  acuerdo: 'action',
  preparando: 'action',
  en_curso: 'brand',
  cerrado: 'success',
  cancelado: 'neutral',
}

export function FichaPersona({
  store,
  personaId,
  onVolver,
  onCambio,
}: {
  store: CanjeStore
  personaId: number
  onVolver: () => void
  /** Avisa a la lista que esta ficha cambió, para que no quede desactualizada al volver. */
  onCambio: (p: CanjePersona) => void
}) {
  const toast = useToast()
  const { confirmar } = useConfirmar()

  const [persona, setPersona] = useState<CanjePersona | null>(null)
  const [canjes, setCanjes] = useState<CanjeVisible[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [nota, setNota] = useState('')

  // El setState va DENTRO del IIFE, no en el cuerpo del effect: el linter del repo rechaza el
  // setState síncrono en un effect. El flag `vivo` evita que la ficha anterior pise a la nueva
  // cuando se abren dos seguidas. Mismo patrón que Reclamos.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargando(true)
      try {
        const d = await leerPersona(store, personaId)
        if (vivo) {
          setPersona(d.persona)
          setCanjes(d.canjes)
          setError(null)
        }
      } catch (e) {
        if (vivo) setError(String((e as Error)?.message || e))
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [store, personaId])

  const seg = useMemo(() => (persona ? estadoDeContacto(persona, canjes, new Date()) : null), [persona, canjes])

  const guardar = useCallback(
    async (campos: CamposPersona) => {
      if (!persona) return
      try {
        await editarPersona(store, persona.id, campos)
        // Se parchea local y se avisa a la lista: pedir la ficha entera de vuelta por cambiar un
        // teléfono hace que la pantalla parpadee sin necesidad.
        const nueva = { ...persona, ...campos } as CanjePersona
        setPersona(nueva)
        onCambio(nueva)
        toast.ok('Guardado')
        setEditando(false)
      } catch (e) {
        toast.error(String((e as Error)?.message || e))
      }
    },
    [persona, store, onCambio, toast],
  )

  const sumarNota = useCallback(async () => {
    if (!persona || !nota.trim()) return
    try {
      const notas = await agregarNota(store, persona.id, nota.trim())
      setPersona({ ...persona, notas })
      setNota('')
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    }
  }, [persona, store, nota, toast])

  const quitarNota = useCallback(
    async (notaId: string) => {
      if (!persona) return
      const ok = await confirmar({ titulo: 'Borrar esta nota', mensaje: 'No se puede deshacer.', ok: 'Borrar', tono: 'danger' })
      if (!ok) return
      try {
        const notas = await borrarNota(store, persona.id, notaId)
        setPersona({ ...persona, notas })
      } catch (e) {
        toast.error(String((e as Error)?.message || e))
      }
    },
    [persona, store, confirmar, toast],
  )

  if (cargando) return <Card>Cargando la ficha…</Card>
  if (error) return <Notice tone="danger">{error}</Notice>
  if (!persona) return <Notice tone="warning">No se encontró esa persona.</Notice>

  const tel = normalizeArgPhone(persona.telefono)
  const pide = queDatoPide(store)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[5] }}>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Button variant="ghost" onClick={onVolver}>Volver al padrón</Button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          {tel && (
            <Button
              variant="outline"
              onClick={() => window.open(`https://wa.me/${tel}`, '_blank', 'noopener')}
            >
              WhatsApp
            </Button>
          )}
          <Button variant="outline" onClick={() => setEditando(true)}>Editar ficha</Button>
        </div>
      </div>

      {/* ── Cabecera ── */}
      <Card>
        <div style={{ display: 'flex', gap: space[5], alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: font.lg, fontWeight: weight.semibold }}>{nombrePersona(persona)}</h2>
            <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
              <a
                href={instagramHref(persona.instagram)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: color.brand, textDecoration: 'none', fontWeight: weight.medium }}
              >
                {instagramParaMostrar(persona.instagram, persona.instagram_raw)}
              </a>
              {persona.tiktok && (
                <a href={tiktokHref(persona.tiktok)} target="_blank" rel="noopener noreferrer" style={{ color: color.mut, textDecoration: 'none' }}>
                  TikTok
                </a>
              )}
              {persona.destacada && <Badge tone="brand" subtle>Destacada</Badge>}
              {persona.vetada && <Badge tone="danger" subtle>Vetada</Badge>}
            </div>
            {persona.vetada && persona.vetada_motivo && (
              <div style={{ marginTop: space[2] }}>
                <Notice tone="danger">Vetada: {persona.vetada_motivo}</Notice>
              </div>
            )}
          </div>

          {seg && (
            <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
              <StatusPill tone={CONTACTO_TONE[seg.estado]} label={CONTACTO_LABEL[seg.estado]} />
              <div style={{ color: color.mut, fontSize: font.sm, marginTop: 4 }}>
                {seg.ultima
                  ? `Última acción: ${seg.ultima.slice(0, 10)}`
                  : 'Todavía no hicimos nada con ella'}
              </div>
              <div style={{ color: color.mut2, fontSize: font.sm }}>
                Cadencia: cada {persona.cadencia_dias} días
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* ── Lo que hace falta para despachar ── */}
      <FaltaParaDespachar persona={persona} store={store} />

      <div style={{ display: 'grid', gap: space[5], gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <SectionCard title="Contacto">
          <Dato label="Teléfono" valor={persona.telefono} />
          <Dato label="Email" valor={persona.email} />
          <Dato label="Ciudad" valor={persona.ciudad} />
          <Dato
            label="Seguidores en Instagram"
            valor={persona.seguidores_ig ? persona.seguidores_ig.toLocaleString('es-AR') : null}
            /* El número sin fecha miente: "50k" de hace dos años no es un dato. */
            hint={persona.seguidores_at ? `Cargado el ${persona.seguidores_at.slice(0, 10)}` : undefined}
          />
          <Dato
            label="Seguidores en TikTok"
            valor={persona.seguidores_tt ? persona.seguidores_tt.toLocaleString('es-AR') : null}
          />
        </SectionCard>

        <SectionCard title="Envío">
          <Dato label="DNI" valor={persona.dni} />
          <Dato
            label="Dirección"
            valor={[persona.calle, persona.numero, persona.piso && `piso ${persona.piso}`, persona.depto && `depto ${persona.depto}`]
              .filter(Boolean).join(' ') || null}
          />
          <Dato label="Localidad" valor={[persona.localidad, persona.provincia].filter(Boolean).join(', ') || null} />
          <Dato label="Código postal" valor={persona.cp} />
          {persona.direccion_nota && <Dato label="Referencia" valor={persona.direccion_nota} />}
        </SectionCard>

        <SectionCard title={pide === 'talles' ? 'Talles' : 'Modelo de celular'}>
          {/* Los dos conviven en la ficha; se muestra el que pide ESTA marca, y el otro abajo en
              gris, porque saber que la ficha ya tiene el dato de la otra marca evita volver a
              pedírselo cuando el canje siguiente sea de esa. */}
          {pide === 'talles' ? (
            <>
              <Dato label="Remera" valor={persona.talles?.remera} />
              <Dato label="Pantalón" valor={persona.talles?.pantalon} />
              <Dato label="Calzado" valor={persona.talles?.calzado} />
              {persona.modelo_celular && (
                <div style={{ marginTop: space[2], color: color.mut2, fontSize: font.sm }}>
                  Para BDI ya tiene cargado: {persona.modelo_celular}
                </div>
              )}
            </>
          ) : (
            <>
              <Dato label="Modelo" valor={persona.modelo_celular} />
              {(persona.talles?.remera || persona.talles?.pantalon || persona.talles?.calzado) && (
                <div style={{ marginTop: space[2], color: color.mut2, fontSize: font.sm }}>
                  Para Zattia/Stunned ya tiene talles cargados.
                </div>
              )}
            </>
          )}
        </SectionCard>
      </div>

      {/* ── El historial cruzado: LA razón del padrón compartido ── */}
      <SectionCard title="Canjes" subtitle="De todas las marcas. Los de marcas que no ves aparecen sin detalle.">
        {!canjes.length ? (
          <EmptyState dashed title="Todavía no tiene ningún canje" hint="Cuando se le proponga uno va a aparecer acá, con su estado." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            {canjes.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap',
                  padding: space[2], borderRadius: 8,
                  border: `1px solid ${color.line}`,
                  // El ciego se ve apagado a propósito: se sabe que existe, no se puede entrar.
                  opacity: esCiego(c) ? 0.6 : 1,
                }}
              >
                <strong style={{ fontWeight: weight.medium, minWidth: 72 }}>{numeroDe(c)}</strong>
                <Badge tone="neutral" subtle>{STORE_LABEL[c.store]}</Badge>
                <StatusPill tone={ESTADO_TONE[c.estado]} label={ESTADO_CANJE_LABEL[c.estado]} />
                <span style={{ color: color.mut, fontSize: font.sm }}>
                  {(c.acordado_at || c.created_at).slice(0, 10)}
                </span>
                {esCiego(c) && (
                  <span style={{ marginLeft: 'auto', color: color.mut2, fontSize: font.sm }}>
                    De otra marca
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Notas ── */}
      <SectionCard title="Notas">
        <div style={{ display: 'flex', gap: space[2], marginBottom: space[3] }}>
          <Input
            value={nota}
            placeholder="Lo que convenga acordarse de ella"
            onChange={(e) => setNota(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void sumarNota() }}
            style={{ flex: 1 }}
          />
          <Button variant="outline" onClick={() => void sumarNota()} disabled={!nota.trim()}>Agregar</Button>
        </div>
        {!persona.notas?.length ? (
          <div style={{ color: color.mut2, fontSize: font.sm }}>Sin notas.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            {[...persona.notas].reverse().map((n) => (
              <div key={n.id} style={{ display: 'flex', gap: space[2], alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>{n.texto}</div>
                  <div style={{ color: color.mut2, fontSize: font.sm }}>
                    {n.at.slice(0, 10)}
                    {n.usuario ? ` · ${n.usuario}` : ''}
                  </div>
                </div>
                {/* ⚠️ Se borra por `n.id`, nunca por índice: la lista está invertida acá y el
                    índice del render no es el de la base. Es el bug que ya tiene lib/crm/leads.ts. */}
                <Button variant="ghost" tone="danger" size="sm" onClick={() => void quitarNota(n.id)}>Borrar</Button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Se monta recién al abrir, y la `key` lo remonta si la ficha cambió por debajo. Así el
          formulario arranca de los datos vigentes con un inicializador de `useState`, sin un
          efecto que copie props a estado — que es el patrón que React desaconseja y el linter
          del repo rechaza. */}
      {editando && (
        <EditarFicha
          key={persona.updated_at ?? persona.id}
          persona={persona}
          store={store}
          onCerrar={() => setEditando(false)}
          onGuardar={guardar}
        />
      )}
    </div>
  )
}

/**
 * Lo que falta para poder mandarle el pedido. Es la lista que hoy se arma de memoria mirando el
 * WhatsApp, y la que justifica que exista el portal (Fase 2): sin dirección no se cotiza el envío.
 */
function FaltaParaDespachar({ persona, store }: { persona: CanjePersona; store: CanjeStore }) {
  const falta: string[] = []
  if (!tieneDireccion(persona)) falta.push('la dirección de envío')
  if (!tieneDatosDeMarca(persona, store)) {
    falta.push(queDatoPide(store) === 'talles' ? 'los talles' : 'el modelo de celular')
  }
  if (!persona.telefono) falta.push('el teléfono')
  if (!falta.length) return null

  const lista = falta.length === 1 ? falta[0] : `${falta.slice(0, -1).join(', ')} y ${falta[falta.length - 1]}`
  return (
    <Notice tone="warning">
      Para mandarle un pedido falta {lista}. Se lo podés pedir por WhatsApp y cargarlo acá.
    </Notice>
  )
}

function Dato({ label, valor, hint }: { label: string; valor?: string | null; hint?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], padding: '4px 0' }}>
      <span style={{ color: color.mut, fontSize: font.sm }}>{label}</span>
      <span style={{ textAlign: 'right', minWidth: 0 }} title={hint}>
        {valor || <span style={{ color: color.mut2 }}>—</span>}
      </span>
    </div>
  )
}

// ── El modal de edición ─────────────────────────────────────────────────────────

function EditarFicha({
  persona, store, onCerrar, onGuardar,
}: {
  persona: CanjePersona
  store: CanjeStore
  onCerrar: () => void
  onGuardar: (campos: CamposPersona) => Promise<void>
}) {
  // Se parte de lo que hay: el formulario edita, no re-carga desde cero. El inicializador corre
  // una sola vez porque el componente se monta al abrir (ver la `key` en el llamador).
  const [f, setF] = useState<CamposPersona>(() => ({
      nombre: persona.nombre ?? null,
      apellido: persona.apellido ?? null,
      telefono: persona.telefono ?? null,
      email: persona.email ?? null,
      tiktok: persona.tiktok ?? null,
      ciudad: persona.ciudad ?? null,
      dni: persona.dni ?? null,
      calle: persona.calle ?? null,
      numero: persona.numero ?? null,
      piso: persona.piso ?? null,
      depto: persona.depto ?? null,
      cp: persona.cp ?? null,
      provincia: persona.provincia ?? null,
      localidad: persona.localidad ?? null,
      direccion_nota: persona.direccion_nota ?? null,
      talles: { ...(persona.talles || {}) },
      modelo_celular: persona.modelo_celular ?? null,
      seguidores_ig: persona.seguidores_ig ?? null,
      seguidores_tt: persona.seguidores_tt ?? null,
      cadencia_dias: persona.cadencia_dias,
      destacada: persona.destacada,
      destacada_nota: persona.destacada_nota ?? null,
      vetada: persona.vetada,
      vetada_motivo: persona.vetada_motivo ?? null,
  }))
  const [guardando, setGuardando] = useState(false)

  const set = (k: keyof CamposPersona, v: unknown) => setF((p) => ({ ...p, [k]: v }))
  const setTalle = (k: keyof TallesPersona, v: string) =>
    setF((p) => ({ ...p, talles: { ...(p.talles || {}), [k]: v || null } }))

  const pide = queDatoPide(store)
  // Vetar sin motivo le deja el problema al que la encuentre en tres meses. El servidor también
  // lo rechaza; esto es para que no llegue hasta ahí.
  const faltaMotivoVeto = f.vetada === true && !String(f.vetada_motivo || '').trim()

  const guardar = async () => {
    setGuardando(true)
    try {
      await onGuardar(f)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Editar la ficha"
      ancho="ancho"
      cerrarConFondo={false}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" tone="brand" onClick={() => void guardar()} loading={guardando} disabled={faltaMotivoVeto}>
            Guardar
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: space[3], gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Field label="Nombre"><Input value={f.nombre ?? ''} onChange={(e) => set('nombre', e.target.value)} /></Field>
        <Field label="Apellido"><Input value={f.apellido ?? ''} onChange={(e) => set('apellido', e.target.value)} /></Field>
        <Field label="Teléfono" hint="Con característica, como se lo guardás en el celu"><Input value={f.telefono ?? ''} onChange={(e) => set('telefono', e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="TikTok"><Input value={f.tiktok ?? ''} onChange={(e) => set('tiktok', e.target.value)} /></Field>
        <Field label="Ciudad"><Input value={f.ciudad ?? ''} onChange={(e) => set('ciudad', e.target.value)} /></Field>
      </div>

      <h4 style={{ margin: `${space[5]}px 0 ${space[2]}px`, fontSize: font.md, fontWeight: weight.semibold }}>Envío</h4>
      <div style={{ display: 'grid', gap: space[3], gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <Field label="DNI"><Input value={f.dni ?? ''} onChange={(e) => set('dni', e.target.value)} /></Field>
        <Field label="Calle"><Input value={f.calle ?? ''} onChange={(e) => set('calle', e.target.value)} /></Field>
        <Field label="Número"><Input value={f.numero ?? ''} onChange={(e) => set('numero', e.target.value)} /></Field>
        <Field label="Piso"><Input value={f.piso ?? ''} onChange={(e) => set('piso', e.target.value)} /></Field>
        <Field label="Depto"><Input value={f.depto ?? ''} onChange={(e) => set('depto', e.target.value)} /></Field>
        <Field label="Código postal"><Input value={f.cp ?? ''} onChange={(e) => set('cp', e.target.value)} /></Field>
        <Field label="Localidad"><Input value={f.localidad ?? ''} onChange={(e) => set('localidad', e.target.value)} /></Field>
        <Field label="Provincia"><Input value={f.provincia ?? ''} onChange={(e) => set('provincia', e.target.value)} /></Field>
        <Field label="Referencia" hint="Portero, timbre, horario"><Input value={f.direccion_nota ?? ''} onChange={(e) => set('direccion_nota', e.target.value)} /></Field>
      </div>

      <h4 style={{ margin: `${space[5]}px 0 ${space[2]}px`, fontSize: font.md, fontWeight: weight.semibold }}>
        {pide === 'talles' ? 'Talles' : 'Modelo de celular'}
      </h4>
      {/* Se editan los dos siempre, aunque se muestre primero el de esta marca: la misma persona
          puede tener un canje de la otra marca la semana que viene, y tenerlo ya cargado ahorra
          exactamente el ida y vuelta de WhatsApp que este módulo viene a sacar. */}
      <div style={{ display: 'grid', gap: space[3], gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <Field label="Remera"><Input value={f.talles?.remera ?? ''} onChange={(e) => setTalle('remera', e.target.value)} /></Field>
        <Field label="Pantalón"><Input value={f.talles?.pantalon ?? ''} onChange={(e) => setTalle('pantalon', e.target.value)} /></Field>
        <Field label="Calzado"><Input value={f.talles?.calzado ?? ''} onChange={(e) => setTalle('calzado', e.target.value)} /></Field>
        <Field label="Modelo de celular" hint="Para los canjes de BDI"><Input value={f.modelo_celular ?? ''} onChange={(e) => set('modelo_celular', e.target.value)} /></Field>
      </div>

      <h4 style={{ margin: `${space[5]}px 0 ${space[2]}px`, fontSize: font.md, fontWeight: weight.semibold }}>Seguimiento</h4>
      <div style={{ display: 'grid', gap: space[3], gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Field label="Seguidores en Instagram" hint="Se guarda con la fecha de hoy">
          <Input
            type="number"
            value={f.seguidores_ig ?? ''}
            onChange={(e) => set('seguidores_ig', e.target.value === '' ? null : Number(e.target.value))}
          />
        </Field>
        <Field label="Seguidores en TikTok">
          <Input
            type="number"
            value={f.seguidores_tt ?? ''}
            onChange={(e) => set('seguidores_tt', e.target.value === '' ? null : Number(e.target.value))}
          />
        </Field>
        <Field label="Cadencia" hint="Cada cuántos días tiene sentido volver a proponerle algo">
          <Select value={String(f.cadencia_dias ?? 90)} onChange={(e) => set('cadencia_dias', Number(e.target.value))}>
            <option value="30">Cada 30 días</option>
            <option value="60">Cada 60 días</option>
            <option value="90">Cada 90 días</option>
            <option value="180">Cada 180 días</option>
            <option value="365">Una vez al año</option>
          </Select>
        </Field>
      </div>

      <div style={{ marginTop: space[5], display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <label style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
          <input type="checkbox" checked={f.destacada === true} onChange={(e) => set('destacada', e.target.checked)} />
          <span>Destacada</span>
        </label>
        {f.destacada && (
          <Field label="Por qué" hint="Lo que el puntaje no ve: una producción hermosa, que trajo clientas al local">
            <Input value={f.destacada_nota ?? ''} onChange={(e) => set('destacada_nota', e.target.value)} />
          </Field>
        )}
        <label style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
          <input type="checkbox" checked={f.vetada === true} onChange={(e) => set('vetada', e.target.checked)} />
          <span>Vetada (no proponerle canjes)</span>
        </label>
        {f.vetada && (
          <Field label="Motivo del veto" required error={faltaMotivoVeto ? 'Sin motivo, el que la encuentre en tres meses no va a saber por qué.' : undefined}>
            <Input value={f.vetada_motivo ?? ''} onChange={(e) => set('vetada_motivo', e.target.value)} />
          </Field>
        )}
      </div>
    </Modal>
  )
}
