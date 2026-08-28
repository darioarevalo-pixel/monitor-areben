'use client'

import { useState } from 'react'
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Notice,
  NumberField,
  StatusPill,
  TBody,
  Td,
  TableWrap,
  THead,
  Th,
  Tr,
  color,
  font,
  formatMoney,
  space,
  useConfirmar,
  useToast,
} from '@/components/ui'
import { borrarZona, guardarZona, importarZonas } from '@/lib/envios/cliente'
import { useZonas } from './useEnvios'
import type { PlanDeImportacion, Turno, ZonaDeReparto } from '@/lib/envios/tipos'

/**
 * **El mapa de zonas de reparto**: en qué zona cae cada dirección y cuánto sale llevarle un paquete.
 *
 * Vive acá y no en un archivo del repo porque los precios se mueven — entre el mapa de abril y el de
 * junio hay mil pesos de diferencia en las dieciséis zonas—, y con los precios en el código cada
 * aumento sería un commit y un deploy.
 *
 * # 🔑 Las dos fuentes, y cuál manda sobre qué
 *
 *     el DIBUJO manda desde el MAPA (el HTML con los polígonos) y entra por «Importar el mapa»
 *     el PRECIO manda desde ACÁ, y re-importar el archivo no lo pisa
 *
 * Es la regla que hace que corregir un polígono no te revierta los dieciséis precios al valor que el
 * JSON tenía el día que se exportó. Vive en `planDeImportacion` (`lib/envios/zonas.core.js`), no en
 * esta pantalla: acá sólo se muestra lo que el servidor dice que va a pasar.
 *
 * # Por qué la previsualización no la calcula esta pantalla
 *
 * El plan y la escritura salen del **mismo llamado**, con `confirmar` en `false` o en `true`. Si
 * esta pantalla calculara por su cuenta lo que va a pasar, podría mostrar «14 quedan igual» y que el
 * servidor escriba otra cosa — y lo que se pisa son los precios de todas las zonas a la vez.
 */
export function ZonasDeReparto({ activa }: { activa: boolean }) {
  const { zonas, cargando, error, recargar } = useZonas(activa)
  const [editando, setEditando] = useState<ZonaDeReparto | null>(null)
  const [importando, setImportando] = useState(false)

  if (error) return <Notice tone="danger">{error}</Notice>
  if (cargando) return null

  const importar = importando ? (
    <ImportarElMapa
      onCerrar={() => setImportando(false)}
      onImportado={async () => {
        setImportando(false)
        await recargar()
      }}
    />
  ) : null

  // 🔴 El botón va **afuera** del `EmptyState`: sin zonas la pantalla se reemplaza entera por el
  // cartel, y importar es justo lo único que se puede hacer cuando todavía no hay nada.
  if (!zonas.length) {
    return (
      <div style={{ display: 'grid', gap: space[4] }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="outline" onClick={() => setImportando(true)}>
            Importar el mapa
          </Button>
        </div>
        <EmptyState
          title="Todavía no hay zonas cargadas"
          hint="Se dibujan en el mapa de Rosario y entran por «Importar el mapa». Mientras no haya zonas, el precio del envío se sigue tipeando a mano."
        />
        {importar}
      </div>
    )
  }

  // 🔑 El nombre no es decoración: es lo que se muestra al lado del precio cuando hay que
  // confirmarlo. «Zona 7 — $4.500» no se puede revisar de un vistazo; «Echesortu — $4.500» sí. El
  // aviso se va solo cuando dejan de llamarse así.
  const genericas = zonas.filter((z) => /^zona\s*\d+$/i.test(z.nombre.trim())).length

  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[3] }}>
        <span style={{ fontSize: font.sm, color: color.mut2 }}>
          {zonas.length} zonas · el dibujo se cambia en el mapa, el precio acá
        </span>
        <Button variant="outline" onClick={() => setImportando(true)}>
          Importar el mapa
        </Button>
      </div>

      {genericas > 0 ? (
        <Notice tone="brand">
          {genericas === 1 ? 'Una zona se llama' : `${genericas} zonas se llaman`} «Zona N». El nombre es lo que se
          muestra al lado del precio cuando hay que confirmarlo, así que con un barrio adelante se puede revisar de un
          vistazo y con «Zona 7» no.
        </Notice>
      ) : null}

      <TableWrap>
        <THead>
          <Tr>
            <Th>Zona</Th>
            <Th align="right" width={140}>
              Precio
            </Th>
            <Th width={120}>Cuándo</Th>
            <Th width={90} />
          </Tr>
        </THead>
        <TBody>
          {zonas.map((z) => (
            <Tr key={z.id}>
              <Td strong>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                  {z.nombre}
                  {z.tipo === 'exclusion' ? <StatusPill tone="danger" label="NO VAMOS" /> : null}
                  {z.coordinar ? <Badge tone="warning">coordinar cuándo</Badge> : null}
                </span>
              </Td>
              <Td align="right">
                {z.tipo === 'exclusion' ? (
                  <span style={{ color: color.mut2 }}>—</span>
                ) : (
                  <PrecioEnFila zona={z} onGuardado={recargar} />
                )}
              </Td>
              <Td>
                <span style={{ fontSize: font.sm, color: color.mut2 }}>{cuandoSale(z)}</span>
              </Td>
              <Td align="right">
                <Button variant="ghost" size="sm" onClick={() => setEditando(z)}>
                  Editar
                </Button>
              </Td>
            </Tr>
          ))}
        </TBody>
      </TableWrap>

      {editando ? (
        <FichaDeZona
          zona={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={async () => {
            setEditando(null)
            await recargar()
          }}
        />
      ) : null}
      {importar}
    </div>
  )
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** «Todos los días» o el recorte, en el idioma del local. */
function cuandoSale(z: ZonaDeReparto): string {
  const dias = z.dias && z.dias.length ? z.dias.map((d) => DIAS[d] || '?').join(' y ') : null
  const turnos = z.turnos && z.turnos.length ? z.turnos.join(' y ') : null
  if (!dias && !turnos) return 'todos los días'
  return [dias, turnos && `a la ${turnos}`].filter(Boolean).join(' ')
}

/**
 * El precio, editable en la fila. Guarda con Enter o al salir del campo — mismo criterio que cotizar
 * un envío: se corrigen varios seguidos mirando el mapa, y abrir una ficha por cada uno son tres
 * clicks que se pagan dieciséis veces.
 */
function PrecioEnFila({ zona, onGuardado }: { zona: ZonaDeReparto; onGuardado: () => Promise<void> }) {
  const texto = zona.precio == null ? '' : String(zona.precio)
  const toast = useToast()
  const [valor, setValor] = useState(texto)
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    if (valor === texto) return
    const n = Number(valor)
    // 🔴 Vacío o cero **no se guardan y no se avisa con un error rojo**: se vuelve a lo que había.
    // Una zona de servicio en $0 la rechaza la base igual, pero acá el campo quedaría en blanco
    // sobre la pantalla como si el precio se hubiera borrado.
    if (valor.trim() === '' || !Number.isFinite(n) || n <= 0) {
      setValor(texto)
      return
    }
    setGuardando(true)
    try {
      await guardarZona({ ...zona, precio: n })
      await onGuardado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar el precio.')
      setValor(texto)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Input
      type="number"
      value={valor}
      disabled={guardando}
      style={{ width: 110 }}
      onChange={(e) => setValor(e.target.value)}
      onBlur={() => void guardar()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

/** La ficha completa: lo que no se toca todos los días. */
function FichaDeZona({
  zona,
  onCerrar,
  onGuardado,
}: {
  zona: ZonaDeReparto
  onCerrar: () => void
  onGuardado: () => Promise<void>
}) {
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const [nombre, setNombre] = useState(zona.nombre)
  const [precio, setPrecio] = useState<number | ''>(zona.precio ?? '')
  const [coordinar, setCoordinar] = useState(zona.coordinar)
  const [dias, setDias] = useState<number[]>(zona.dias || [])
  const [turnos, setTurnos] = useState<Turno[]>(zona.turnos || [])
  const [guardando, setGuardando] = useState(false)

  const esExclusion = zona.tipo === 'exclusion'

  async function guardar() {
    setGuardando(true)
    try {
      await guardarZona({
        ...zona,
        nombre: nombre.trim(),
        precio: esExclusion ? null : precio === '' ? null : Number(precio),
        coordinar,
        dias: dias.length ? [...dias].sort((a, b) => a - b) : null,
        turnos: turnos.length ? turnos : null,
      })
      await onGuardado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar la zona.')
    } finally {
      setGuardando(false)
    }
  }

  async function borrar() {
    const ok = await confirmar({
      titulo: `¿Eliminar «${zona.nombre}»?`,
      // 🔴 Lo que pasa al borrar no es «desaparece de la lista»: las direcciones de ese pedazo de
      // ciudad dejan de tener precio, y eso se descubre recién cuando alguien no puede agendar.
      mensaje: 'Las direcciones que caían en esta zona quedan sin precio propuesto y se van a tener que tipear a mano.',
      ok: 'Eliminar',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await borrarZona(zona.id)
      await onGuardado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar la zona.')
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={zona.nombre}
      cerrarConFondo={false}
      pie={
        <>
          <Button variant="ghost" tone="danger" onClick={() => void borrar()}>
            Eliminar
          </Button>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={guardando || !nombre.trim()}>
            Guardar
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: space[4] }}>
        <Field
          label="Nombre"
          hint="Es lo que se muestra al lado del precio cuando hay que confirmarlo. Un barrio se puede revisar de un vistazo; «Zona 7» no."
        >
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </Field>

        {esExclusion ? (
          <Notice tone="brand">
            Es una zona de exclusión: acá no vamos, así que no lleva precio. Para que deje de serlo hay que volver a
            dibujarla en el mapa y re-importar.
          </Notice>
        ) : (
          <Field label="Precio del envío">
            <NumberField value={precio} onChange={setPrecio} min={1} prefix="$" width={140} />
          </Field>
        )}

        {/* 🔑 «Coordinar» NO es un precio a convenir: el paquete se lleva igual y se cobra lo de la
            zona. Lo que se coordina es cuándo se va. Por eso es una marca al lado del precio y no un
            tipo de zona: como zona sin precio, la pantalla no propondría nada. */}
        <Field label="Cómo se entrega">
          <label style={{ display: 'flex', gap: space[2], alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={coordinar} onChange={(e) => setCoordinar(e.target.checked)} />
            <span style={{ fontSize: font.sm }}>Hay que coordinar cuándo se va (el precio es el mismo)</span>
          </label>
        </Field>

        <Field
          label="Cuándo sale"
          hint="Sin marcar nada sale cualquier día de reparto, que es el caso de casi todas. Funes es la excepción: sólo martes y jueves a la mañana."
        >
          <div style={{ display: 'grid', gap: space[2] }}>
            <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
              {DIAS.map((d, i) => (
                <Chip key={d} activo={dias.includes(i)} onClick={() => setDias(alternar(dias, i))}>
                  {d}
                </Chip>
              ))}
            </div>
            <div style={{ display: 'flex', gap: space[2] }}>
              {(['mañana', 'tarde'] as Turno[]).map((t) => (
                <Chip key={t} activo={turnos.includes(t)} onClick={() => setTurnos(alternar(turnos, t))}>
                  {t}
                </Chip>
              ))}
            </div>
          </div>
        </Field>
      </div>
    </Modal>
  )
}

function alternar<T>(lista: T[], valor: T): T[] {
  return lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor]
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button variant={activo ? 'solid' : 'outline'} size="sm" onClick={onClick}>
      {children}
    </Button>
  )
}

/**
 * Importar el JSON que exporta el mapa.
 *
 * 🔑 **Primero se ve qué va a pasar y después se escribe**, y las dos cosas salen del mismo llamado
 * al servidor. Lo que se pisa acá no es una fila: es el mapa entero.
 */
function ImportarElMapa({ onCerrar, onImportado }: { onCerrar: () => void; onImportado: () => Promise<void> }) {
  const toast = useToast()
  const [archivo, setArchivo] = useState<unknown>(null)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [ajuste, setAjuste] = useState<number | ''>('')
  const [plan, setPlan] = useState<PlanDeImportacion | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  async function elegir(file: File | undefined) {
    if (!file) return
    setPlan(null)
    try {
      setArchivo(JSON.parse(await file.text()))
      setNombreArchivo(file.name)
    } catch {
      setArchivo(null)
      setNombreArchivo('')
      toast.error('Ese archivo no es un JSON válido. Tiene que ser el que sale de «Exportar JSON» en el mapa.')
    }
  }

  async function correr(confirmar: boolean) {
    setTrabajando(true)
    try {
      const r = await importarZonas(archivo, { ajuste: ajuste === '' ? 0 : Number(ajuste), confirmar })
      setPlan(r.plan)
      if (r.escrito) {
        toast.ok('Mapa importado.')
        await onImportado()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo importar el mapa.')
    } finally {
      setTrabajando(false)
    }
  }

  const hayProblemas = !!plan?.problemas.length
  const nadaQueHacer = !!plan && !plan.nuevas.length && !plan.actualizadas.length

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Importar el mapa de zonas"
      ancho="ancho"
      cerrarConFondo={false}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cerrar
          </Button>
          {!plan ? (
            <Button onClick={() => void correr(false)} disabled={!archivo || trabajando}>
              Ver qué va a pasar
            </Button>
          ) : (
            <Button onClick={() => void correr(true)} disabled={trabajando || hayProblemas || nadaQueHacer}>
              Importar
            </Button>
          )}
        </>
      }
    >
      <div style={{ display: 'grid', gap: space[4] }}>
        <Notice tone="brand">
          El <strong>dibujo</strong> de cada zona se actualiza con lo que traiga el archivo. El <strong>precio</strong> no:
          el que está cargado acá se respeta, y del archivo sólo se toma el de las zonas nuevas. Una zona que esté acá y
          no venga en el archivo <strong>no se elimina</strong>.
        </Notice>

        <Field label="El archivo" hint="El que sale del botón «Exportar JSON» del mapa.">
          <input type="file" accept="application/json" onChange={(e) => void elegir(e.target.files?.[0])} />
        </Field>
        {nombreArchivo ? <span style={{ fontSize: font.sm, color: color.mut2 }}>{nombreArchivo}</span> : null}

        <Field
          label="Sumarle a cada precio"
          hint="Para cuando el aumento es parejo en todas las zonas, que es como se mueven estos precios. Sólo afecta a las zonas nuevas, que son las que toman precio del archivo."
        >
          <NumberField value={ajuste} onChange={setAjuste} prefix="$" width={140} placeholder="0" />
        </Field>

        {plan ? <ElPlan plan={plan} /> : null}
      </div>
    </Modal>
  )
}

function ElPlan({ plan }: { plan: PlanDeImportacion }) {
  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      {plan.problemas.length ? (
        <Notice tone="danger">
          <strong>No se va a importar nada.</strong> Estas zonas del archivo tienen algo que arreglar en el mapa:
          <ul style={{ margin: `${space[2]}px 0 0`, paddingLeft: space[5] }}>
            {plan.problemas.map((p, i) => (
              <li key={i}>
                <strong>{p.zona}</strong>: {p.motivo}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <Linea titulo="Entran nuevas" n={plan.nuevas.length}>
        {plan.nuevas.map((z) => (
          <li key={z.nombre}>
            {z.nombre} — {z.precio == null ? 'NO VAMOS' : formatMoney(z.precio)}
          </li>
        ))}
      </Linea>

      <Linea titulo="Les cambia el dibujo" n={plan.actualizadas.length}>
        {plan.actualizadas.map((z) => (
          <li key={z.nombre}>
            {z.nombre} — cambia {z.cambios.join(' y ')}; el precio sigue en{' '}
            {z.precio == null ? '—' : formatMoney(z.precio)}
          </li>
        ))}
      </Linea>

      {plan.iguales.length ? (
        <span style={{ fontSize: font.sm, color: color.mut2 }}>
          {plan.iguales.length} quedan exactamente igual.
        </span>
      ) : null}

      {plan.ausentes.length ? (
        <Notice tone="warning">
          {plan.ausentes.length === 1 ? 'Esta zona está cargada y' : `Estas ${plan.ausentes.length} zonas están cargadas y`}{' '}
          no vienen en el archivo: <strong>{plan.ausentes.join(', ')}</strong>. No se tocan. Si sobran, hay que borrarlas
          a mano.
        </Notice>
      ) : null}
    </div>
  )
}

function Linea({ titulo, n, children }: { titulo: string; n: number; children: React.ReactNode }) {
  if (!n) return null
  return (
    <div>
      <div style={{ fontSize: font.sm, fontWeight: 600 }}>
        {titulo} ({n})
      </div>
      <ul style={{ margin: `${space[1]}px 0 0`, paddingLeft: space[5], fontSize: font.sm, color: color.mut2 }}>
        {children}
      </ul>
    </div>
  )
}
