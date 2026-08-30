'use client'

/**
 * "Novedades" — qué cambió en los sistemas, en un solo lugar.
 *
 * El problema que resuelve no es escribirlas: es que **lleguen**. Los sistemas avanzan todo el
 * tiempo, grabar un Loom es fricción, y lo que no se graba no se cuenta. Así que las novedades se
 * escriben desde afuera —yo las cargo como borrador al terminar cada cambio, con
 * `scripts/novedad.mjs`— y acá sólo se revisan y se publican de un click. La fricción baja a cero
 * porque nadie se tiene que acordar de nada.
 *
 * **Abrir esta pantalla marca como leídas las que se ven.** No hay botón de "marcar leído": si
 * alguien entró, se enteró. Las importantes son otra cosa y tienen su propio cartel.
 *
 * ⚠️ Eso sigue valiendo aunque el detalle esté **plegado**: se marca al entrar, no al abrir la
 * tarjeta. Atarlo a abrir suena más honesto y es peor — el badge del sidebar quedaría prendido para
 * siempre para quien mira la lista y decide que nada le hace falta. Lo que no se marca al entrar
 * sigue siendo lo mismo que antes (`seMarcanAlEntrar`): las importantes, que sólo se apagan con
 * «Entendido» en el cartel.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { HeaderAcciones } from '@/components/layout/acciones'
import { EditorNovedad } from './EditorNovedad'
import { useSistema } from '@/store/useSistema'
import { borrarNovedad, cambiarEstado, leerLecturas, nuevoId } from '@/lib/novedades/cliente'
import { NUEVA, seMarcanAlEntrar, type Destino, type Lectura, type Novedad } from '@/lib/novedades/tipos'
import { FUNCIONES } from '@/lib/permisos'
import { tituloLimpio } from '@/lib/nav'
import { CUENTAS } from '@/lib/cuentas'
import {
  Badge, Button, EmptyState, Esqueleto, Markdown, Notice, Plegable, SectionCard,
  color, font, space, useConfirmar, useToast,
} from '@/components/ui'

/**
 * A quién le llegó, en una frase. Sólo se muestra cuando está acotada: "A todo el equipo" en cada
 * tarjeta sería ruido en el 90% de los casos.
 *
 * ⚠️ **La marca tiene que entrar acá.** Es un filtro aparte del rol, así que una tarjeta que dijera
 * sólo "A Local" mentiría sobre a quién le llegó justo en el caso que se agregó para arreglar: la
 * novedad del local de Zattia que le aparecía al local de BDI.
 */
function aQuien(d?: Destino): string | null {
  if (!d) return null
  const marca = d.marca ? CUENTAS[d.marca].nombre : null
  // El editor de Novedades no ofrece «a una persona» ni «a quien hace horas extras» —las usa sólo
  // la Agenda—, pero el tipo es uno solo para las dos, así que la tarjeta las sabe leer igual: una
  // novedad cargada a mano o por un editor futuro no puede quedar sin decir a quién le llegó.
  // ⚠️ Es un `switch` y no una escalera de ternarios porque son cinco formas: con la quinta, el
  // `else` final dejó de ser «entonces son roles» y pasó a ser el lugar donde se cuela la que
  // falte. Acá el compilador avisa.
  let quien: string | null = null
  switch (d.tipo) {
    case 'todos': quien = null; break
    case 'seccion': quien = `A quien usa ${tituloLimpio(d.key)}`; break
    case 'personas': quien = `A ${d.personas.join(', ')}`; break
    case 'horas-extras': quien = 'A quien hace horas extras'; break
    case 'roles': quien = `A ${d.roles.map((r) => FUNCIONES.find((f) => f.key === r)?.label ?? r).join(', ')}`; break
  }
  if (!quien) return marca ? `A todo el equipo de ${marca}` : null
  return marca ? `${quien} · ${marca}` : quien
}

/** "9 de agosto", sin el año cuando es de este año: es una novedad, no un expediente. */
function cuando(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const esteAnio = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', ...(esteAnio ? {} : { year: 'numeric' }) })
}

/**
 * Lo mismo, más la hora: "17 de agosto, 12:36".
 *
 * 🔑 **Va sólo en las lecturas, no en la fecha de la novedad.** De una novedad importa el día en que
 * salió; de una lectura importa **cuándo**: quien la publicó a la mañana y la vuelve a mirar a la
 * tarde necesita saber si el equipo la abrió antes o después de que él preguntara. Lo pidió Bruno el
 * 17-ago-2026 usándolo.
 */
function cuandoConHora(iso?: string | null): string {
  if (!iso) return ''
  // `hour12: false` explícito: sin eso salía «12:36 p. m.», que es más largo y no es como se lee la
  // hora acá. El default de `es-AR` no es de fiar — lo decide el navegador, y el de Bruno da 12 h.
  const hora = new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${cuando(iso)}, ${hora}`
}

/**
 * Quién leyó esta novedad. Se pide al abrirlo, no con la lista: no tiene sentido que todo el equipo
 * se baje quién leyó qué cada vez que entra.
 *
 * ⚠️ **Es una lista de presentes, no de ausentes.** No se puede decir "todavía no la leyeron: …"
 * porque el padrón de usuarios vive en el KV de bdi-catalogo y no en esta base. Y `Local` y
 * `Depósito` son puestos compartidos: que el puesto haya marcado leído no dice que una persona en
 * particular se enteró. Las dos cosas van escritas en la pantalla, porque si no este número se usa
 * como prueba de algo que no prueba.
 */
function QuienLaLeyo({ id }: { id: string }) {
  const [abierto, setAbierto] = useState(false)
  const [lecturas, setLecturas] = useState<Lectura[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const abrir = () => {
    const va = !abierto
    setAbierto(va)
    if (!va || lecturas) return
    leerLecturas(id)
      .then(setLecturas)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo.'))
  }

  return (
    <Plegable
      abierto={abierto}
      onToggle={abrir}
      titulo={lecturas ? `La leyeron ${lecturas.length}` : 'Quién la leyó'}
      ayuda="Quiénes la abrieron desde que se publicó. «Local» y «Depósito» son puestos compartidos: que el puesto la haya leído no dice qué persona estaba adelante."
    >
      {error ? (
        <Notice tone="warning">{error}</Notice>
      ) : !lecturas ? (
        <span style={{ fontSize: font.sm, color: color.mut2 }}>Buscando…</span>
      ) : lecturas.length === 0 ? (
        <span style={{ fontSize: font.sm, color: color.mut2 }}>Todavía no la abrió nadie.</span>
      ) : (
        <div style={{ display: 'grid', gap: 2, fontSize: font.sm, color: color.ink2 }}>
          {lecturas.map((l) => (
            <div key={`${l.usuario}|${l.version}`}>
              {l.usuario} · {cuandoConHora(l.leida_at)}
              {l.version > 1 ? ` · v${l.version}` : ''}
            </div>
          ))}
        </div>
      )}
    </Plegable>
  )
}

export function Novedades() {
  const { perfil } = useSesion()
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const { novedades, leidas, puede, cargado, cargar, marcar } = useSistema()

  const [editando, setEditando] = useState<Novedad | null>(null)
  const [verViejas, setVerViejas] = useState(false)
  // ⚠️ Qué tarjeta está abierta vive ACÁ y no adentro de `Tarjeta`: `Tarjeta` está declarada dentro
  // de este componente, así que es un tipo nuevo en cada render y React la remonta — un `useState`
  // adentro se cerraría solo al primer cambio de la lista. Se puede tener más de una abierta.
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())

  const alternar = (id: string) =>
    setAbiertas((s) => {
      const n = new Set(s)
      if (!n.delete(id)) n.add(id)
      return n
    })

  useEffect(() => {
    if (!cargado) void cargar()
  }, [cargado, cargar])

  // Al entrar, todo lo publicado que se está viendo queda leído. Se hace en un efecto y no al
  // pintar cada tarjeta para que no dependa de si la persona scrolleó hasta el final.
  // Qué se marca y qué no está en `seMarcanAlEntrar`: quedan afuera las que no son para uno y —lo
  // que importa— **las importantes**, que sólo se marcan apretando «Entendido» en el cartel.
  useEffect(() => {
    if (!cargado) return
    for (const n of seMarcanAlEntrar(novedades)) void marcar(n)
  }, [cargado, novedades, marcar])

  const leidaSet = useMemo(
    () => new Set(leidas.map((l) => `${l.novedad_id}|${l.version}`)),
    [leidas],
  )

  const borradores = novedades.filter((n) => n.estado === 'borrador')
  const vigentes = novedades.filter((n) => n.estado === 'publicada')
  const archivadas = novedades.filter((n) => n.estado === 'archivada')

  const accion = async (fn: () => Promise<void>, siSale: string) => {
    try {
      await fn()
      toast.ok(siSale)
      await cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo.')
    }
  }

  const onBorrar = (n: Novedad) =>
    void confirmar({
      titulo: `Eliminar «${n.titulo}»`,
      tono: 'danger',
      ok: 'Eliminar',
      mensaje: 'Se va para todos, junto con el registro de quiénes la habían leído. Si sólo querés sacarla de la lista, archivala.',
    }).then(async (ok) => {
      if (ok) await accion(() => borrarNovedad(n.id), 'Eliminada.')
    })

  if (!cargado) return <Esqueleto />

  const Tarjeta = ({ n }: { n: Novedad }) => {
    const abierta = abiertas.has(n.id)
    return (
      <div
        style={{
          border: `1px solid ${color.line}`, borderRadius: 12, padding: space[4],
          background: color.bg, display: 'grid', gap: space[2],
        }}
      >
        {/*
          El renglón entero es el botón que abre: el título es el resumen —"que se entienda solo, sin
          abrir" dice el editor— y los chips contestan si esto me toca a mí antes de decidir abrirlo.
          `height: 'auto'` no es de adorno: la regla legacy `.shell-content button` le fija a todo
          botón la altura de un renglón, y este envuelve en dos.
        */}
        <button
          onClick={() => alternar(n.id)}
          aria-expanded={abierta}
          style={{
            height: 'auto', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
            textAlign: 'left', width: '100%',
            display: 'flex', alignItems: 'baseline', gap: space[2], flexWrap: 'wrap',
          }}
        >
          {/* Los triangulitos se pintan chicos: a `font.sm` se leen como un punto y no como «esto abre». */}
          <span style={{ color: color.mut2, fontSize: font.lg, lineHeight: 1, width: 12 }}>{abierta ? '▾' : '▸'}</span>
          <strong style={{ fontSize: font.md, color: color.ink }}>{n.titulo}</strong>
          {n.estado === 'borrador' && <Badge tone="warning">Borrador</Badge>}
          {n.importante && n.estado === 'publicada' && <Badge tone="brand">Importante</Badge>}
          {n.estado === 'publicada' && n.paraMi !== false && !leidaSet.has(`${n.id}|${n.version}`) && <Badge tone="brand" subtle>Nueva</Badge>}
          {aQuien(n.destino) && <Badge tone="neutral" subtle>{aQuien(n.destino)}</Badge>}
          <span style={{ marginLeft: 'auto', fontSize: font.xs, color: color.mut2 }}>
            {cuando(n.publicada_at || n.created_at)}
            {n.autor ? ` · ${n.autor}` : ''}
            {n.version > 1 ? ` · v${n.version}` : ''}
          </span>
        </button>

        {abierta && (
          <>
            <Markdown texto={n.cuerpo} />

            {puede.publicar && n.estado !== 'borrador' && <QuienLaLeyo id={n.id} />}

            {puede.publicar && (
              <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap', marginTop: space[1] }}>
                {n.estado !== 'publicada' && (
                  <Button size="sm" onClick={() => void accion(() => cambiarEstado(n.id, 'publicada'), 'Publicada. Ya la ve el equipo.')}>
                    Publicar
                  </Button>
                )}
                {n.estado === 'publicada' && (
                  <>
                    <Button size="sm" variant="soft" onClick={() => void accion(() => cambiarEstado(n.id, 'borrador'), 'Vuelve a ser un borrador.')}>
                      Despublicar
                    </Button>
                    <Button size="sm" variant="soft" onClick={() => void accion(() => cambiarEstado(n.id, 'archivada'), 'Archivada.')}>
                      Archivar
                    </Button>
                  </>
                )}
                {n.estado === 'archivada' && (
                  <Button size="sm" variant="soft" onClick={() => void accion(() => cambiarEstado(n.id, 'publicada'), 'Volvió a la lista.')}>
                    Desarchivar
                  </Button>
                )}
                <Button size="sm" variant="ghost" iconLeft="✏️" onClick={() => setEditando(n)}>Editar</Button>
                <Button size="sm" variant="ghost" tone="danger" iconLeft="🗑" onClick={() => onBorrar(n)}>Eliminar</Button>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <HeaderAcciones>
        {puede.publicar && (
          <Button iconLeft="＋" onClick={() => setEditando({ ...NUEVA, id: nuevoId() })}>
            Escribir una novedad
          </Button>
        )}
      </HeaderAcciones>

      {puede.publicar && borradores.length > 0 && (
        <SectionCard title="Sin publicar" subtitle="Sólo las ves vos. El equipo no se entera hasta que le des Publicar.">
          <div style={{ display: 'grid', gap: space[3] }}>
            {borradores.map((n) => <Tarjeta key={n.id} n={n} />)}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Lo último" subtitle="Lo que cambió en los sistemas, de lo más nuevo a lo más viejo. Tocá el título para ver el detalle.">
        {vigentes.length === 0 ? (
          <EmptyState
            icon="📣"
            title="Todavía no hay novedades publicadas"
            hint={puede.publicar ? 'Cuando termine un cambio te la voy a dejar acá como borrador.' : 'Cuando haya algo nuevo en los sistemas, va a aparecer acá.'}
          />
        ) : (
          <div style={{ display: 'grid', gap: space[3] }}>
            {vigentes.map((n) => <Tarjeta key={n.id} n={n} />)}
          </div>
        )}
      </SectionCard>

      {archivadas.length > 0 && (
        <SectionCard title="Anteriores">
          <Plegable
            abierto={verViejas}
            onToggle={() => setVerViejas((v) => !v)}
            titulo={`${archivadas.length} archivadas`}
            ayuda="Novedades viejas que ya no hace falta tener a mano. Siguen buscables acá."
          >
            <div style={{ display: 'grid', gap: space[3] }}>
              {archivadas.map((n) => <Tarjeta key={n.id} n={n} />)}
            </div>
          </Plegable>
        </SectionCard>
      )}

      {!perfil && <Notice tone="warning">Volvé a entrar: la sesión no tiene nombre y sin eso no se puede registrar la lectura.</Notice>}

      {editando && (
        <EditorNovedad
          novedad={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null)
            void cargar()
          }}
        />
      )}
    </>
  )
}
