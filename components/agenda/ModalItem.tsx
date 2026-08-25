'use client'

/**
 * El alta de un pendiente rutinario **o de un aviso fechado**.
 *
 * 🔑 **La regla de carga es que la rutina obvia no se carga.** Abrir la caja no va acá: entra sólo lo
 * que se olvida. Si la lista de "Hoy" tuviera quince renglones todos los días, en dos semanas nadie
 * la mira y el pendiente que sí importaba se pierde con el resto.
 *
 * # Por qué las dos clases se cargan en la MISMA pantalla
 *
 * Porque las dos contestan "¿esto va hoy?" con la misma regla, el mismo destino y las mismas marcas;
 * lo único que cambia es si al final hay un cuadradito para tildar. Dos altas separadas serían dos
 * formularios que se copian entero y divergen en el primer arreglo — y encima obligarían a elegir
 * antes de saber, cuando lo normal es cargar "el jueves viene el flete" y recién ahí darse cuenta de
 * si alguien tiene que hacer algo o sólo enterarse.
 *
 * Los días se arman con `EditorRegla`, el mismo control que la promo bancaria: "los martes hay que
 * reponer la vidriera" y "los martes de Banco Nación" son la misma pregunta.
 *
 * # Por qué el destino se dibuja acá y no se importa de Novedades
 *
 * La lógica de "¿a quién le llega?" **es una sola** y vive en `lib/novedades/destino.core.js`: la
 * usa el handler de novedades y el de la agenda, sin copiar una línea. Lo que se repite son estos
 * controles, porque extraerlos obligaría a tocar el editor de Novedades, que es código compartido
 * con Darío. Si mañana se toca ese archivo por otra razón, salen de ahí.
 *
 * ⚠️ Y desde el 23-ago-2026 ya no son los mismos tres: **"a una persona" existe sólo acá**. Es un
 * pedido de la Agenda (las doce rutinas de marketing le salían a las tres), y una novedad dirigida
 * a una sola persona todavía no se pidió.
 *
 * # De dónde sale la lista del equipo
 *
 * Del padrón, que vive en el KV de `bdi-catalogo` y es **admin-only** (`traerConfigAdmin`). ⛔ No se
 * inventó un endpoint: en Hobby quedan cinco funciones y ésta es la misma puerta que ya usa la
 * pantalla de Usuarios. Se pide **recién cuando alguien elige "a una persona"**, no al abrir el
 * modal, y en las sesiones de Google no abre ningún prompt (el token alcanza). Hoy no recorta a
 * nadie: cargar rutinas es de admin (`agenda.cargar`, 0 de 16 lo tienen tildado a mano).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Field, Input, Modal, Notice, Select, color, font, space, weight } from '@/components/ui'
import { CLASES, hoyIso, PUERTAS, type ClaseItem, type Destino, type ItemAgenda, type Puerta } from '@/lib/agenda'
import { nuevoIdItem } from '@/lib/agenda/cliente'
import { todasLasKeys, tituloLimpio } from '@/lib/nav'
import { FUNCIONES } from '@/lib/permisos'
import { credencialConPrompt, traerConfigAdmin } from '@/lib/sesion'
import type { UsuarioConfig } from '@/lib/usuarios/tipos'
import { useSistema } from '@/store/useSistema'
import type { Marca } from '@/lib/nav.datos'
import { EditorRegla, Tilde, toggleEnLista } from './EditorRegla'

const MARCAS: { key: Marca; label: string }[] = [
  { key: 'bdi', label: 'BDI' },
  { key: 'zattia', label: 'Zattia' },
]

/**
 * Alguien a quien se le puede dirigir un pendiente.
 *
 * 🔑 **Lo que se guarda es `name`, el usuario de login**, y el apodo es sólo para reconocerlo en
 * la lista: el apodo se cambia en Config y el que quedara guardado en el destino envejecería solo.
 * Los puestos compartidos (`Local`, `Depósito`) entran igual: ahí "quién" es el puesto.
 */
type Persona = { name: string; apodo: string }

/**
 * Uno nuevo, con el esqueleto de regla que corresponde a cada clase.
 *
 * Un **pendiente** arranca semanal sin días tildados: es el caso que se carga siempre y el único
 * esqueleto que el validador rechaza hasta que la persona elija algo. Un default que ya pasa la
 * validación —"todos los días"— se guarda sin que nadie mire ese campo.
 *
 * Un **aviso** arranca en un día puntual, porque eso es lo que un aviso es casi siempre: "el jueves
 * viene el flete". La recurrencia existe igual —el editor de regla es el mismo— pero el default
 * ahorra el caso normal en vez de pedir dos clics para llegar a él.
 */
export function itemVacio(clase: ClaseItem = 'pendiente'): ItemAgenda {
  return {
    id: nuevoIdItem(),
    clase,
    titulo: '',
    cuerpo: null,
    regla: clase === 'aviso' ? { tipo: 'unica', fecha: hoyIso() } : { tipo: 'semanal', dias: [] },
    destino: { tipo: 'todos' },
    marcas: [],
    manualId: null,
    activo: true,
    // Apagado por defecto: casi toda rutina es del día y se vence con el día. Lo que arrastra es la
    // excepción —las reuniones—, y una excepción no se pone de default.
    arrastra: false,
    plantilla: null,
    offsetDias: null,
    // Vacío = las cuatro puertas, que es el caso normal: cuatro de los seis pasos no cambian.
    puertas: [],
    autor: null,
    creado: null,
    paraMi: true,
  }
}

export function ModalItem({
  inicial,
  onCerrar,
  onGuardar,
}: {
  inicial: ItemAgenda
  onCerrar: () => void
  onGuardar: (i: ItemAgenda) => Promise<void>
}) {
  const [it, setIt] = useState<ItemAgenda>(inicial)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const manuales = useSistema((s) => s.manuales)
  const [gente, setGente] = useState<Persona[] | null>(null)
  const [errorGente, setErrorGente] = useState<string | null>(null)
  // Un ref y no un estado: sirve para no pedir el padrón dos veces, y no tiene que redibujar nada.
  const pedida = useRef(false)

  const set = <K extends keyof ItemAgenda>(k: K, v: ItemAgenda[K]) => setIt((x) => ({ ...x, [k]: v }))

  // Por nombre y no por el orden del menú: acá se busca una pantalla, no se navega por sectores.
  const secciones = useMemo(
    () => todasLasKeys().map((k) => ({ k, label: tituloLimpio(k) })).sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [],
  )
  const publicados = useMemo(() => manuales.filter((m) => m.publicado), [manuales])

  const toggleRol = (rol: string) => {
    const actuales = it.destino.tipo === 'roles' ? it.destino.roles : []
    const nuevos = toggleEnLista(actuales, rol)
    // Sin ningún rol tildado no le llegaría a nadie, que no es lo que nadie quiso decir: cae a todos,
    // que es el default visible. Es la misma regla que aplica el servidor en `normalizarDestino`.
    set('destino', nuevos.length ? { tipo: 'roles', roles: nuevos } : { tipo: 'todos' })
  }

  /**
   * El padrón, para poder elegir gente. Se pide **una sola vez y sólo si hace falta**, y el efecto
   * cubre los dos caminos: recién elegido "a una persona", o abierto para editar uno que ya estaba
   * dirigido.
   *
   * ⚠️ Falla de la única forma que puede fallar: si quien carga no es admin, vuelve 403. No se cae
   * a un campo de texto libre a propósito — un nombre mal tipeado es un pendiente que no le sale a
   * nadie y que nadie reclama, que es el peor final posible para esta pantalla.
   */
  useEffect(() => {
    if (it.destino.tipo !== 'personas' || pedida.current) return
    pedida.current = true
    let vivo = true
    ;(async () => {
      const r = await traerConfigAdmin<UsuarioConfig>(await credencialConPrompt())
      if (!vivo) return
      if (r.ok) {
        setGente(
          r.users
            .map((u) => ({ name: u.name, apodo: u.apodo || u.name }))
            .sort((a, b) => a.apodo.localeCompare(b.apodo, 'es')),
        )
      } else setErrorGente(r.error)
    })()
    return () => {
      vivo = false
    }
  }, [it.destino.tipo])

  const togglePersona = (name: string) => {
    const actuales = it.destino.tipo === 'personas' ? it.destino.personas : []
    // ⚠️ A diferencia de los roles, destildar al último NO cae a "todos": acá la lista arranca
    // vacía siempre (no hay un default razonable que pre-tildar), y saltar al otro destino cada
    // vez que alguien se arrepiente sería pelear con quien está eligiendo. Lo que no puede pasar
    // —guardarlo vacío y que el servidor lo lea como "para todos"— lo frena `guardar()`.
    set('destino', { tipo: 'personas', personas: toggleEnLista(actuales, name) })
  }

  const guardar = async () => {
    setError(null)
    // 🔴 El servidor normaliza una lista vacía a "para todo el equipo" (`normalizarDestino`), que es
    // la red correcta para un dato roto pero la respuesta equivocada para alguien que eligió "a una
    // persona" y todavía no eligió cuál: se guardaría al revés de lo que quiso, y en silencio.
    if (it.destino.tipo === 'personas' && it.destino.personas.length === 0) {
      setError('Elegí al menos a una persona, o cambiá «A quién le toca» a otra opción.')
      return
    }
    setGuardando(true)
    try {
      await onGuardar({
        ...it,
        titulo: it.titulo.trim(),
        cuerpo: it.cuerpo && it.cuerpo.trim() ? it.cuerpo : null,
      })
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const d: Destino = it.destino
  const esAviso = it.clase === 'aviso'

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={
        inicial.creado
          ? esAviso ? 'Editar el aviso' : 'Editar el pendiente'
          : esAviso ? 'Nuevo aviso fechado' : 'Nuevo pendiente rutinario'
      }
      ancho="ancho"
      cerrarConFondo={false}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: space[4] }}>
        {error && <Notice tone="danger">{error}</Notice>}

        <Notice tone="neutral">
          Entra <b>lo que se olvida</b>. Lo que se hace siempre igual —abrir la caja, prender las
          luces— no se carga acá: una lista larga todos los días es una lista que se deja de mirar.
        </Notice>

        {/*
          La clase va PRIMERO porque cambia lo que significan los campos de abajo, y va como los dos
          renglones enteros y no como un tilde suelto: "pide que lo tilden" y "sólo avisa" hay que
          poder compararlos leyéndolos, no deducir el segundo de que el primero esté apagado.
        */}
        <Field
          label="Qué es"
          hint={
            esAviso
              ? 'Un aviso se lee y listo: no tiene cuadradito, no cuenta para el número del menú y no entra en Cumplimiento.'
              : 'Un pendiente pide que alguien lo tilde ese día, y por eso enciende el número del menú hasta que se tilda.'
          }
        >
          <Select
            value={it.clase}
            onChange={(e) => {
              const clase = e.target.value as ClaseItem
              // Pasar a aviso se lleva el manual puesto: si no, quedaría guardado sin dibujarse en
              // ningún lado y volvería a aparecer solo si alguien lo devuelve a pendiente meses
              // después. La regla, en cambio, no se toca: está a la vista acá abajo.
              setIt((x) => ({ ...x, clase, manualId: clase === 'aviso' ? null : x.manualId }))
            }}
          >
            {CLASES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </Select>
        </Field>

        <Field
          label={esAviso ? 'Qué hay que saber' : 'Qué hay que hacer'}
          required
          hint={esAviso ? 'Corto y en presente: «Viene el flete a las 10».' : 'Corto y en infinitivo: «Reponer la vidriera».'}
        >
          <Input
            value={it.titulo}
            onChange={(e) => set('titulo', e.target.value)}
            placeholder={esAviso ? 'Viene el flete a las 10' : 'Reponer la vidriera'}
          />
        </Field>

        <Field label="Detalle" hint="Opcional. El paso a paso largo va en un manual, no acá.">
          <textarea
            value={it.cuerpo ?? ''}
            onChange={(e) => set('cuerpo', e.target.value)}
            rows={3}
            style={{
              width: '100%', padding: space[2], borderRadius: 8,
              border: `1px solid ${color.line2}`, fontSize: font.base, fontFamily: 'inherit',
              background: 'transparent', color: color.ink, resize: 'vertical',
            }}
          />
        </Field>

        <EditorRegla
          regla={it.regla}
          onChange={(r) => set('regla', r)}
          titulo={esAviso ? 'Qué días se avisa' : 'Qué días toca'}
        />

        <div>
          <div style={{ fontSize: font.xs, color: color.mut, fontWeight: weight.medium, marginBottom: 4 }}>
            A quién le toca
          </div>
          <Field hint="Si no lo acotás, le aparece a todo el equipo. Quien carga los ve todos igual, pero sólo tilda los suyos.">
            <Select
              value={d.tipo}
              onChange={(e) => {
                const t = e.target.value
                set('destino', t === 'seccion'
                  ? { tipo: 'seccion', key: 'atencion' }
                  : t === 'roles' ? { tipo: 'roles', roles: ['local'] }
                  // Arranca vacío y no con alguien pre-tildado: el default de los roles ("local")
                  // es el caso normal, y acá no hay ninguna persona que sea el caso normal.
                  : t === 'personas' ? { tipo: 'personas', personas: [] } : { tipo: 'todos' })
              }}
            >
              <option value="todos">A todo el equipo</option>
              <option value="seccion">A quien usa una pantalla</option>
              <option value="roles">A ciertos roles</option>
              <option value="personas">A una persona en particular</option>
            </Select>
          </Field>

          {d.tipo === 'seccion' && (
            <Field
              label="¿De qué pantalla es?"
              hint="Le llega a quien tenga permiso de verla. Si mañana alguien lo gana o lo pierde, la lista se ajusta sola."
            >
              <Select value={d.key} onChange={(e) => set('destino', { tipo: 'seccion', key: e.target.value })}>
                {secciones.map((s) => <option key={s.k} value={s.k}>{s.label}</option>)}
              </Select>
            </Field>
          )}

          {d.tipo === 'roles' && (
            <Field label="¿Qué roles?" hint="Ojo: a quien no tenga ningún rol asignado no le va a llegar.">
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
                {FUNCIONES.map((f) => (
                  <Tilde
                    key={f.key}
                    puesto={d.roles.includes(f.key)}
                    label={f.label}
                    onToggle={() => toggleRol(f.key)}
                  />
                ))}
              </div>
            </Field>
          )}

          {d.tipo === 'personas' && (
            <Field
              label="¿A quién?"
              hint="Le llega sólo a quien tildes acá, y a nadie más: tampoco a vos, aunque seas administrador. Los puestos compartidos (Local, Depósito) también se pueden elegir — ahí el dueño es el puesto y no una persona."
            >
              {errorGente ? (
                <Notice tone="warning">
                  No se pudo leer la lista del equipo: {errorGente} Elegir por nombre necesita ser
                  administrador; mientras tanto, se puede acotar por rol.
                </Notice>
              ) : !gente ? (
                <span style={{ fontSize: font.sm, color: color.mut2 }}>Buscando al equipo…</span>
              ) : (
                <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
                  {gente.map((g) => (
                    <Tilde
                      key={g.name}
                      puesto={d.personas.includes(g.name)}
                      label={g.apodo === g.name ? g.name : `${g.apodo} (${g.name})`}
                      onToggle={() => togglePersona(g.name)}
                    />
                  ))}
                </div>
              )}
            </Field>
          )}
        </div>

        <div style={{ display: 'flex', gap: space[6], flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: font.xs, color: color.mut, fontWeight: weight.medium, marginBottom: 4 }}>
              Marcas <span style={{ fontWeight: weight.normal }}>(ninguna tildada = las dos)</span>
            </div>
            <div style={{ display: 'flex', gap: space[2] }}>
              {MARCAS.map((m) => (
                <Tilde
                  key={m.key}
                  puesto={it.marcas.includes(m.key)}
                  label={m.label}
                  onToggle={() => set('marcas', toggleEnLista(it.marcas, m.key) as Marca[])}
                />
              ))}
            </div>
          </div>

          {/*
            El manual es el enganche con el flujo que ya está escrito: en vez de repetir acá cómo se
            hace, el renglón de Hoy abre el manual. Si no hay ninguno publicado, no se ofrece — y
            tampoco se ofrece en un aviso: "cómo se hace" no aplica a algo que no hay que hacer.
          */}
          {!esAviso && publicados.length > 0 && (
            <Field label="Cómo se hace" hint="El manual que se abre desde el renglón. Opcional." width={280}>
              <Select
                value={it.manualId ?? ''}
                onChange={(e) => set('manualId', e.target.value || null)}
              >
                <option value="">— sin manual —</option>
                {publicados.map((m) => <option key={m.id} value={m.id}>{m.titulo}</option>)}
              </Select>
            </Field>
          )}
        </div>

        <div style={{ display: 'flex', gap: space[4], flexWrap: 'wrap', alignItems: 'center' }}>
          <Tilde
            puesto={it.activo}
            label={it.activo ? 'Prendido' : 'Apagado'}
            onToggle={() => set('activo', !it.activo)}
          />
          {/*
            Sólo para los pendientes: un aviso no se tilda, así que no hay nada que quede pendiente
            de tildar. Ofrecerlo ahí sería prometer un comportamiento que no existe.
          */}
          {it.clase === 'pendiente' && (
            <Tilde
              puesto={it.arrastra}
              label={it.arrastra ? 'Queda hasta que se tilde' : 'Se vence con el día'}
              onToggle={() => set('arrastra', !it.arrastra)}
            />
          )}
        </div>

        {/*
          El molde del ingreso. Un ítem marcado así **no corre ningún día**: existe para que el
          disparador lo clone con la fecha del ingreso, y por eso al prenderlo la regla deja de
          importar (el clon nace como «un día puntual»).

          🔑 Está acá y no en una pantalla propia porque es exactamente el mismo formulario: el
          molde lleva título, dueña, marca y manual, que es todo lo que un paso necesita.
        */}
        {it.clase === 'pendiente' && (
          <div style={{ marginTop: space[3], paddingTop: space[3], borderTop: `1px solid ${color.line}` }}>
            <Tilde
              puesto={it.plantilla === 'ingreso'}
              label={it.plantilla === 'ingreso'
                ? 'Es un paso de la lista de ingreso (no corre solo)'
                : 'Es una rutina normal'}
              onToggle={() => set('plantilla', it.plantilla === 'ingreso' ? null : 'ingreso')}
            />
            {it.plantilla === 'ingreso' && (
              <div style={{ marginTop: space[2], display: 'flex', gap: space[3], alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <Field
                  label="A los cuántos días"
                  hint="0 = el día que entra la mercadería. El nombre y el precio traban todo lo demás; la publicación puede ir a los dos."
                  width={200}
                >
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    value={it.offsetDias == null ? '' : String(it.offsetDias)}
                    onChange={(e) => set('offsetDias', e.target.value === '' ? null : Number(e.target.value))}
                  />
                </Field>
                <div style={{ color: color.mut, fontSize: font.sm, paddingBottom: space[2] }}>
                  La regla de arriba no se usa en los moldes: el clon nace con la fecha del ingreso.
                </div>
              </div>
            )}
            {/*
              Las puertas de entrada.

              🔑 **Ninguna tildada = las cuatro**, igual que las marcas de arriba — y es el caso
              normal: el precio, la foto, la publicación y las pantallas no cambian con la puerta, así
              que se cargan una sola vez. Se tilda sólo en los dos pasos que sí cambian de dueña, el
              nombre y la descripción, que van cargados **una vez por puerta**.

              ⚠️ Y «producción propia no lleva renglón de descripción» no se dice acá: se dice **no
              cargando ese molde**. Por eso no hay ningún «no corre en» que tildar.
            */}
            {it.plantilla === 'ingreso' && (
              <div style={{ marginTop: space[3] }}>
                <div style={{ fontSize: font.xs, color: color.mut, fontWeight: weight.medium, marginBottom: 4 }}>
                  Entra por <span style={{ fontWeight: weight.normal }}>(ninguna tildada = las cuatro)</span>
                </div>
                <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
                  {PUERTAS.map((p) => (
                    <Tilde
                      key={p.key}
                      puesto={(it.puertas ?? []).includes(p.key)}
                      label={p.label}
                      onToggle={() => set('puertas', toggleEnLista(it.puertas ?? [], p.key) as Puerta[])}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
