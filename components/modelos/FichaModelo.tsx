'use client'

/**
 * La ficha de una modelo: cargarla, corregirla y archivarla.
 *
 * 🔑 **Es un formulario y ⛔ no una pantalla de sólo lectura con un botón «Editar».** El padrón nace
 * vacío: durante las primeras semanas casi todo lo que va a pasar acá es tipear, y un modo lectura
 * que hay que salir para escribir agrega un click a lo único que la sección hace hoy.
 *
 * 🔴 **Lo que se guarda ⛔ no es lo que se tipeó**: el talle, la altura y el Instagram los normaliza
 * el servidor con el mismo núcleo que la sesión de fotos (`lib/modelos/core.core.js`). Por eso al
 * guardar la ficha se **recarga** en vez de quedarse con lo que había en pantalla — si no, el campo
 * mostraría `1.70` hasta el próximo F5 y el de al lado ya diría `1,70 m`.
 */
import { useMemo, useState } from 'react'
import {
  Button,
  Field,
  Input,
  Notice,
  Select,
  SectionCard,
  color,
  space,
  useConfirmar,
  useToast,
} from '@/components/ui'
import { normalizeArgPhone } from '@/lib/crm/telefono.core.js'
import { archivarModelo, eliminarModelo, guardarModelo } from '@/lib/modelos/cliente'
import {
  alturaNormalizada,
  CLAVES_MEDIDA,
  esDirecta,
  ESTADOS,
  fichaQueChoca,
  motivoModeloInvalido,
} from '@/lib/modelos/core'
import type { EstadoModelo, MedidasModelo, Modelo } from '@/lib/modelos/tipos'

const MARCAS = [
  { key: 'bdi', label: 'BDI' },
  { key: 'zattia', label: 'Zattia' },
]

const ROTULO_MEDIDA: Record<string, string> = {
  busto: 'Busto (cm)',
  cintura: 'Cintura (cm)',
  cadera: 'Cadera (cm)',
  calzado: 'Calzado',
}

/** Una ficha nueva arranca activa y **sin marcas**, que quiere decir las dos. */
const VACIA = {
  nombre: '',
  instagram: '',
  telefono: '',
  mail: '',
  agencia: '',
  booker: '',
  bookerContacto: '',
  talle: '',
  altura: '',
  nota: '',
  estado: 'activa' as EstadoModelo,
}

type Formulario = typeof VACIA & { marcas: string[]; medidas: Record<string, string> }

function aFormulario(m: Modelo | null): Formulario {
  const medidas: Record<string, string> = {}
  for (const k of CLAVES_MEDIDA) {
    const v = (m?.medidas as MedidasModelo | undefined)?.[k]
    medidas[k] = v == null ? '' : String(v)
  }
  if (!m) return { ...VACIA, marcas: [], medidas }
  return {
    nombre: m.nombre,
    instagram: m.instagram ?? '',
    telefono: m.telefono ?? '',
    mail: m.mail ?? '',
    agencia: m.agencia ?? '',
    booker: m.booker ?? '',
    bookerContacto: m.bookerContacto ?? '',
    talle: m.talle ?? '',
    altura: m.altura ?? '',
    nota: m.nota ?? '',
    estado: m.estado,
    marcas: m.marcas ?? [],
    medidas,
  }
}

export function FichaModelo({
  marca,
  modelo,
  padron,
  onVolver,
  onCambio,
}: {
  marca: string
  /** `null` = ficha nueva. */
  modelo: Modelo | null
  /** El padrón entero, para avisar de un duplicado antes de escribirlo. */
  padron: readonly Modelo[]
  onVolver: () => void
  onCambio: () => void
}) {
  const [b, setB] = useState<Formulario>(() => aFormulario(modelo))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const { confirmar } = useConfirmar()

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setB((x) => ({ ...x, [k]: v }))

  const motivo = motivoModeloInvalido({ ...b, id: modelo?.id })
  const choca = useMemo(
    () => (b.nombre.trim() ? fichaQueChoca({ ...b, id: modelo?.id }, padron) : null),
    [b, modelo?.id, padron],
  )

  /**
   * 🔴 **La altura se previsualiza mientras se tipea.** Es el único campo que se guarda distinto de
   * como se escribe (`170` → `1,70 m`) **y que sale a la ficha de un producto que lee una clienta**.
   * Sin este renglón, el que tipea `1,7` no se entera de que se guardó `1,70 m` — ni de que un
   * `95` no se guardó.
   */
  const alturaVista = alturaNormalizada(b.altura)

  const wa = normalizeArgPhone(b.telefono)

  async function guardar() {
    if (motivo) return
    setGuardando(true)
    setError(null)
    try {
      await guardarModelo(marca, {
        ...(modelo?.id ? { id: modelo.id } : {}),
        nombre: b.nombre,
        instagram: b.instagram,
        telefono: b.telefono,
        mail: b.mail,
        agencia: b.agencia,
        booker: b.booker,
        bookerContacto: b.bookerContacto,
        talle: b.talle,
        altura: b.altura,
        medidas: b.medidas as unknown as MedidasModelo,
        estado: b.estado,
        marcas: b.marcas,
        nota: b.nota,
      })
      toast.ok(modelo ? 'Ficha guardada.' : 'Modelo cargada.')
      onCambio()
      onVolver()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  async function archivar() {
    if (!modelo) return
    const archivada = modelo.estado !== 'archivada'
    const ok = await confirmar({
      titulo: archivada ? `¿Archivar a ${modelo.nombre}?` : `¿Volver a activar a ${modelo.nombre}?`,
      mensaje: archivada
        ? 'Sale de la lista de a quién llamar. La ficha sigue existiendo y lo que fotografió sigue en las sesiones.'
        : 'Vuelve a aparecer en la lista de activas.',
      ok: archivada ? 'Archivar' : 'Activar',
    })
    if (!ok) return
    try {
      await archivarModelo(marca, modelo.id, modelo.nombre, archivada)
      toast.ok(archivada ? 'Ficha archivada.' : 'Ficha activada.')
      onCambio()
      onVolver()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo archivar.')
    }
  }

  async function eliminar() {
    if (!modelo) return
    const ok = await confirmar({
      titulo: `¿Eliminar la ficha de ${modelo.nombre}?`,
      mensaje:
        'Se elimina y no se puede deshacer. Si ya trabajó con nosotros, lo que corresponde es archivarla: sale de la lista y la ficha sigue existiendo.',
      ok: 'Eliminar',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await eliminarModelo(marca, modelo.id)
      toast.ok('Ficha eliminada.')
      onCambio()
      onVolver()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar.')
    }
  }

  const fila = { display: 'flex', gap: space[3], flexWrap: 'wrap' as const }

  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
        <Button variant="ghost" onClick={onVolver}>
          ← Volver
        </Button>
        <strong style={{ fontSize: 16 }}>{modelo ? modelo.nombre : 'Cargar una modelo'}</strong>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      <SectionCard title="Quién es">
        <div style={fila}>
          <Field label="Nombre" required width={260}>
            <Input value={b.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Juana Pérez" />
          </Field>
          <Field label="Instagram" width={200} hint="Sin @; también podés pegar el enlace.">
            <Input value={b.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="juanaperez" />
          </Field>
          <Field label="Teléfono" width={180} hint={wa ? 'Se puede escribir por WhatsApp.' : undefined}>
            <Input value={b.telefono} onChange={(e) => set('telefono', e.target.value)} placeholder="383 427 0554" />
          </Field>
          <Field label="Mail" width={220}>
            <Input value={b.mail} onChange={(e) => set('mail', e.target.value)} />
          </Field>
        </div>
        {/*
          ⚠️ **Avisa y ⛔ no bloquea.** Dos modelos que se llaman igual existen; lo que no puede pasar
          es cargar la segunda ficha de la misma persona sin enterarse.
        */}
        {choca && (
          <Notice tone="warning">
            Ya hay una ficha de <strong>{choca.nombre}</strong>
            {choca.instagram ? ` (@${choca.instagram})` : ''}. Fijate si no es la misma persona antes de
            guardar.
          </Notice>
        )}
      </SectionCard>

      <SectionCard
        title="Quién la representa"
        subtitle={esDirecta(b) ? 'Sin nada cargado, la ficha dice Directa.' : undefined}
      >
        <div style={fila}>
          <Field label="Agencia" width={220}>
            <Input value={b.agencia} onChange={(e) => set('agencia', e.target.value)} />
          </Field>
          <Field label="Booker" width={220} hint="La persona que la agenda.">
            <Input value={b.booker} onChange={(e) => set('booker', e.target.value)} />
          </Field>
          <Field label="Cómo se contacta al booker" width={240}>
            <Input value={b.bookerContacto} onChange={(e) => set('bookerContacto', e.target.value)} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Talle y medidas"
        subtitle="El talle y la altura son los que salen a la descripción del producto cuando se la elige en una sesión."
      >
        <div style={fila}>
          <Field label="Talle que usa" width={140}>
            <Input value={b.talle} onChange={(e) => set('talle', e.target.value)} placeholder="M" />
          </Field>
          <Field
            label="Altura"
            width={160}
            hint={b.altura ? (alturaVista ? `Se guarda como ${alturaVista}` : 'No se entiende: escribila como 1,70') : undefined}
          >
            <Input value={b.altura} onChange={(e) => set('altura', e.target.value)} placeholder="1,70" />
          </Field>
          {CLAVES_MEDIDA.map((k) => (
            <Field key={k} label={ROTULO_MEDIDA[k]} width={120}>
              <Input
                inputMode="numeric"
                value={b.medidas[k] ?? ''}
                onChange={(e) => setB((x) => ({ ...x, medidas: { ...x.medidas, [k]: e.target.value } }))}
              />
            </Field>
          ))}
        </div>
        <p style={{ fontSize: 12, color: color.mut, margin: 0 }}>
          Lo que no sepas, dejalo vacío. Vacío quiere decir <strong>no medido</strong>; un 0 diría que
          se midió y dio cero.
        </p>
      </SectionCard>

      <SectionCard title="Para qué marcas trabaja" subtitle="Sin ninguna tildada, aparece en las dos.">
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          {MARCAS.map((m) => (
            <label key={m.key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={b.marcas.includes(m.key)}
                onChange={(e) =>
                  set('marcas', e.target.checked ? [...b.marcas, m.key] : b.marcas.filter((x) => x !== m.key))
                }
              />
              {m.label}
            </label>
          ))}
          <Field label="Estado" width={160}>
            <Select value={b.estado} onChange={(e) => set('estado', e.target.value as Formulario['estado'])}>
              {ESTADOS.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Notas" subtitle="Cómo trabaja, qué salió bien, qué acordamos. Lo lee el que arma la próxima producción.">
        <textarea
          className="mo-input"
          rows={4}
          value={b.nota}
          onChange={(e) => set('nota', e.target.value)}
          style={{ width: '100%', resize: 'vertical' }}
        />
      </SectionCard>

      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
        <Button onClick={guardar} disabled={!!motivo || guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
        {motivo && <span style={{ fontSize: 12, color: color.mut, alignSelf: 'center' }}>{motivo}</span>}
        {modelo && (
          <Button variant="ghost" onClick={archivar}>
            {modelo.estado === 'archivada' ? 'Activar' : 'Archivar'}
          </Button>
        )}
        {modelo && (
          <Button variant="ghost" tone="danger" onClick={eliminar}>
            Eliminar
          </Button>
        )}
      </div>

      {modelo && (
        <p style={{ fontSize: 12, color: color.mut, margin: 0 }}>
          Cargada el {new Date(modelo.creado).toLocaleDateString('es-AR')}
          {modelo.autor ? ` · última mano: ${modelo.autor}` : ''}
        </p>
      )}
    </div>
  )
}
