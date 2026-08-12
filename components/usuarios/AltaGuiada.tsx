'use client'

/**
 * Alta guiada: dar de alta a alguien sin tocar una casilla.
 *
 * Antes, "Agregar usuario" empujaba una fila vacía y te dejaba frente a 44 secciones × 2 marcas
 * + 32 acciones. El modelo ya tenía la respuesta buena —las **funciones** dan áreas enteras y
 * hacen que una sección nueva se herede sola— pero la pantalla las mostraba como un renglón
 * chiquito arriba de la matriz. Acá se invierte: elegís qué hace la persona, y la matriz queda
 * para el ajuste fino que casi nunca hace falta.
 *
 * ⚠️ **No guarda nada.** Construye un `UsuarioConfig` y se lo devuelve a la lista; lo que
 * escribe en el KV sigue siendo el único "Guardar cambios" de siempre. Un segundo camino de
 * guardado sería un segundo lugar donde equivocarse.
 */

import { useMemo, useState } from 'react'
import type { Marca } from '@/lib/nav'
import { FUNCIONES, seccionesDeFuncion, type Funcion } from '@/lib/permisos'
import { copiarDeUsuario, nuevoUsuario, toggleFuncion, validar } from '@/lib/usuarios/core'
import type { UsuarioConfig } from '@/lib/usuarios/tipos'
import { Button, Card, color, Field, font, Input, Modal, Notice, radius, Select, space, weight } from '@/components/ui'
import { Resumen } from './Resumen'

/** Cómo se le arman los permisos: por función, copiando a otro, o admin. */
type Molde = 'funcion' | 'copia' | 'admin'

const PASOS = ['Quién es', 'Qué hace', 'Dónde trabaja'] as const

export function AltaGuiada({
  usuarios,
  onCerrar,
  onCrear,
}: {
  /** Los que ya existen: son los moldes posibles para "copiar de otra persona". */
  usuarios: UsuarioConfig[]
  onCerrar: () => void
  /** `ajustar` = abrir la ficha en el ajuste fino después de crearla. */
  onCrear: (u: UsuarioConfig, ajustar: boolean) => void
}) {
  const [paso, setPaso] = useState(0)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [molde, setMolde] = useState<Molde>('funcion')
  const [funciones, setFunciones] = useState<Funcion[]>([])
  const [copiaDe, setCopiaDe] = useState('')
  const [cuenta, setCuenta] = useState<Marca | ''>('')

  /** El usuario tal como quedaría. Se recalcula en cada tecla: es lo que muestra el resumen. */
  const armado = useMemo<UsuarioConfig>(() => {
    let u: UsuarioConfig = { ...nuevoUsuario(), name: name.trim(), email: email.trim().toLowerCase(), pass }
    if (molde === 'admin') u = { ...u, admin: true }
    if (molde === 'funcion') u = funciones.reduce((acc, f) => toggleFuncion(acc, f, true), u)
    if (molde === 'copia') {
      const origen = usuarios.find((x) => x.name === copiaDe)
      if (origen) u = copiarDeUsuario(u, origen)
    }
    // La marca elegida acá gana sobre la que venga del molde copiado: es el último paso.
    return { ...u, cuenta: cuenta || null }
  }, [name, email, pass, molde, funciones, copiaDe, cuenta, usuarios])

  // Misma regla que al guardar, sin duplicarla: `validar` sobre la fila sola. El "falta un
  // admin" no aplica todavía (la lista real ya tiene uno), así que ese mensaje se ignora.
  const errorIdentidad = useMemo(() => {
    if (!name.trim()) return 'Poné un nombre de usuario.'
    if (usuarios.some((x) => (x.name || '').trim() === name.trim())) return 'Ya hay alguien con ese nombre.'
    return validar([{ ...nuevoUsuario(), name: name.trim(), email: email.trim(), pass, admin: true }])
  }, [name, email, pass, usuarios])

  const errorMolde =
    molde === 'funcion' && funciones.length === 0
      ? 'Elegí al menos una función, o pasá a copiar de otra persona.'
      : molde === 'copia' && !copiaDe
        ? 'Elegí de quién copiar.'
        : null

  const errorPaso = paso === 0 ? errorIdentidad : paso === 1 ? errorMolde : null

  const crear = (ajustar: boolean) => onCrear(armado, ajustar)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Nuevo usuario — ${PASOS[paso]}`}
      ancho="ancho"
      // Perder lo tipeado a mitad del alta duele: el fondo no cierra.
      cerrarConFondo={false}
      pie={
        <>
          {/* "Cancelar" está SIEMPRE. Antes lo reemplazaba "Atrás" a partir del paso 2, así que
              en el último paso la única salida sin crear el usuario era la tecla Escape — que
              nadie adivina, y menos con el fondo desactivado. */}
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          {paso > 0 && (
            <Button variant="ghost" onClick={() => setPaso((p) => p - 1)}>
              Atrás
            </Button>
          )}
          {paso < PASOS.length - 1 ? (
            <Button variant="solid" tone="brand" disabled={!!errorPaso} onClick={() => setPaso((p) => p + 1)}>
              Seguir
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => crear(true)}>
                Crear y ajustar a mano
              </Button>
              <Button variant="solid" tone="brand" onClick={() => crear(false)}>
                Crear
              </Button>
            </>
          )}
        </>
      }
    >
      <Pasos actual={paso} />

      {paso === 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: space[3] }}>
            <Field label="Usuario">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cómo lo van a llamar" autoFocus />
            </Field>
            <Field label="Mail (para entrar con Google)">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@arebensrl.com" />
            </Field>
            <Field label="Contraseña">
              <Input type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="opcional si tiene mail" />
            </Field>
          </div>
          <Notice style={{ marginTop: space[3] }}>
            Con <b>una</b> de las dos alcanza. El mail es lo que la enlaza con su cuenta de Google (y con la misma
            persona en producción y en el dashboard); la contraseña es para los puestos que no son de nadie —Depósito,
            Local—, que no tienen casilla.
          </Notice>
        </>
      )}

      {paso === 1 && (
        <>
          <Opcion
            elegida={molde === 'funcion'}
            onElegir={() => setMolde('funcion')}
            titulo="Por lo que hace"
            ayuda="Le da los sectores enteros de su función. Una sección nueva de ese sector la hereda sola, sin que nadie la tilde."
          >
            <div style={{ display: 'grid', gap: space[2] }}>
              {FUNCIONES.map((f) => (
                <label key={f.key} style={{ display: 'flex', gap: space[2], alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={funciones.includes(f.key)}
                    onChange={(e) => setFunciones((prev) => (e.target.checked ? [...prev, f.key] : prev.filter((x) => x !== f.key)))}
                    style={{ accentColor: color.brandSolid, marginTop: 3 }}
                  />
                  <span>
                    <b style={{ fontSize: font.base }}>{f.label}</b>
                    <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.4 }}>
                      {f.info} <i>{seccionesDeFuncion(f.key).length} secciones.</i>
                    </div>
                  </span>
                </label>
              ))}
            </div>
          </Opcion>

          <Opcion
            elegida={molde === 'copia'}
            onElegir={() => setMolde('copia')}
            titulo="Igual que otra persona"
            ayuda="Copia permisos, funciones y marca de alguien que ya trabaja. No copia su nombre, su mail ni su contraseña."
          >
            <Select value={copiaDe} onChange={(e) => setCopiaDe(e.target.value)}>
              <option value="">Elegí de quién…</option>
              {usuarios
                .filter((x) => x.name)
                .map((x) => (
                  <option key={x.name} value={x.name}>
                    {x.name}
                    {x.admin ? ' (admin)' : ''}
                  </option>
                ))}
            </Select>
          </Opcion>

          <Opcion
            elegida={molde === 'admin'}
            onElegir={() => setMolde('admin')}
            titulo="Administrador"
            ayuda="Ve todas las secciones de las dos marcas, puede hacer todas las acciones y gestiona usuarios. No se le pueden quitar cosas de a una."
          />
        </>
      )}

      {paso === 2 && (
        <>
          <Field label="Marca">
            <Select value={cuenta} onChange={(e) => setCuenta((e.target.value || '') as Marca | '')}>
              <option value="">BDI + Zattia (puede cambiar de marca)</option>
              <option value="bdi">Solo BDI</option>
              <option value="zattia">Solo Zattia</option>
            </Select>
          </Field>

          <Card padding={3} style={{ marginTop: space[3], background: color.bg }}>
            <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[2], fontWeight: weight.semibold }}>
              Con esto, <b>{armado.name || 'la persona'}</b> va a poder:
            </div>
            <Resumen u={armado} />
            {!armado.admin && (
              <div style={{ fontSize: font.xs, color: color.mut2, marginTop: space[2], lineHeight: 1.5 }}>
                Las acciones sueltas —aprobar un canje, aplicar un conteo, pausar campañas— <b>no vienen con la
                función</b>: se tildan una por una en la ficha, con «Crear y ajustar a mano».
              </div>
            )}
          </Card>
        </>
      )}

      {errorPaso && paso < 2 && (
        <div style={{ fontSize: font.sm, color: color.danger, marginTop: space[3] }}>{errorPaso}</div>
      )}
    </Modal>
  )
}

/** Los tres pasos, para saber dónde se está y cuánto falta. */
function Pasos({ actual }: { actual: number }) {
  return (
    <div style={{ display: 'flex', gap: space[2], marginBottom: space[4] }}>
      {PASOS.map((p, i) => (
        <div
          key={p}
          style={{
            flex: 1,
            height: 3,
            borderRadius: radius.pill,
            background: i <= actual ? color.brandSolid : color.line,
          }}
          title={p}
        />
      ))}
    </div>
  )
}

/** Una de las tres formas de armarle los permisos. La elegida se abre; las otras quedan cerradas. */
function Opcion({
  elegida,
  onElegir,
  titulo,
  ayuda,
  children,
}: {
  elegida: boolean
  onElegir: () => void
  titulo: string
  ayuda: string
  children?: React.ReactNode
}) {
  return (
    <div
      onClick={elegida ? undefined : onElegir}
      style={{
        border: `1px solid ${elegida ? color.brandBorder : color.line}`,
        background: elegida ? color.brandBg : color.surface,
        borderRadius: radius.lg,
        padding: space[3],
        marginBottom: space[2],
        cursor: elegida ? undefined : 'pointer',
      }}
    >
      <label style={{ display: 'flex', gap: space[2], alignItems: 'flex-start', cursor: 'pointer' }}>
        <input type="radio" checked={elegida} onChange={onElegir} style={{ accentColor: color.brandSolid, marginTop: 3 }} />
        <span>
          <b style={{ fontSize: font.md }}>{titulo}</b>
          <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.4 }}>{ayuda}</div>
        </span>
      </label>
      {elegida && children && <div style={{ marginTop: space[3] }}>{children}</div>}
    </div>
  )
}
