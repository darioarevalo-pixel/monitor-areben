'use client'

/**
 * «Pasar a una importación» — el puente desde Diseños → Ingresos proyectados.
 *
 * Vive en `components/ingresos/` y no adentro de Diseños, igual que
 * `components/liquidacion/MandarALiquidacion.tsx`: **todo lo que este botón sabe es conocimiento de
 * Ingresos** —la forma de `DisenoColumna`, que el KV se guarda entero, que sin haber leído no se
 * escribe, que la carpeta del Blob es `ingresos`, que el gate del otro repo pide admin—. Si viviera
 * del lado de Diseños, esa disciplina quedaría duplicada en dos carpetas y la copia se despegaría.
 * Desde Diseños entra en una línea.
 *
 * # 🔴 La disciplina del KV
 *
 * Ingresos vive en el KV de `bdi-catalogo` y **cada guardado reescribe el array entero**. Guardar
 * sin haber leído borra la clave: es el modo de falla que casi costó 305 clientes del CRM. Acá:
 *
 *   1. `cargado` se deriva de la lectura, en la misma función, y no hay otro camino al POST. ⛔ Nunca
 *      se cae a `[]`.
 *   2. Se lee **dos veces**: al abrir (para poblar los selectores) y otra vez **en el click**. El
 *      diálogo puede quedar abierto minutos; así la ventana de pisar a alguien pasa a milisegundos.
 *   3. `normalizar` a todos al leer y `conItemsDerivados` a todos al escribir, calcado de
 *      `useIngresos`: un registro viejo sin normalizar sale con `items: []`, o sea una importación
 *      de miles de unidades contada como vacía.
 *   4. Se relee una **tercera** vez para verificar. El oráculo no es la pantalla que escribió.
 *   5. Orden inviolable: primero el KV, después la marca en el diseño. ⛔ Nunca al revés.
 */

import { useState } from 'react'
import { credencialConPrompt } from '@/lib/sesion'
import { leerIngresos, guardarIngresos } from '@/lib/kv/cliente'
import { subirBlob } from '@/lib/imagenes'
import { conItemsDerivados, modelosBase, normalizar, nuevoIngreso } from '@/lib/ingresos/core'
import { bloqueParaElPuente, columnasDesdeDisenos, pasarADestino, puedePasarAIngresos, yaEnLaImportacion, type DisenoDeTablero } from '@/lib/ingresos/puente'
import { nuevoId } from '@/components/ingresos/useIngresos'
import type { Ingreso } from '@/lib/ingresos/tipos'
import type { EnvioAIngreso } from '@/lib/disenos/tipos'
import type { Marca } from '@/lib/nav.datos'
import type { Perfil } from '@/lib/permisos'
import { Button, Field, Input, Modal, Notice, Select, color, font, space, useToast } from '@/components/ui'

/** Arriba de esto la grilla de Ingresos (modelos × diseños) se vuelve incómoda de verdad. */
const COLUMNAS_COMODAS = 15

const obtenerCred = () => credencialConPrompt('del Monitor')

export function PasarAImportacion({
  marca,
  perfil,
  disenos,
  onEnviados,
}: {
  marca: Marca
  perfil: Perfil | null
  /** Los confirmados. */
  disenos: DisenoDeTablero[]
  /** Se llama SÓLO después de que el KV confirmó. */
  onEnviados: (marcas: { id: string; envio: EnvioAIngreso }[]) => void
}) {
  const toast = useToast()
  const [abierto, setAbierto] = useState(false)
  const [lista, setLista] = useState<Ingreso[] | null>(null)
  const [motivo, setMotivo] = useState<string | null>(null)
  const [elegida, setElegida] = useState('')
  const [bloqueId, setBloqueId] = useState('')
  const [nombreNueva, setNombreNueva] = useState('')
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [mandando, setMandando] = useState(false)
  const [paso, setPaso] = useState('')

  // ⛔ En Zattia no se renderiza, y no es un deshabilitado: Zattia no importa fundas, así que no hay
  // nada que destrabar nunca — y su menú ni siquiera tiene la sección Ingresos, o sea que no hay a
  // dónde ir a mirar el resultado. Un botón gris para siempre promete algo que no va a llegar.
  if (!puedePasarAIngresos(perfil, marca)) return null

  async function abrir() {
    setAbierto(true)
    setMotivo(null)
    setLista(null)
    setNombres(Object.fromEntries(disenos.map((d) => [d.id, d.name])))
    const r = await leerIngresos<Ingreso>(marca)
    if (!r.ok) {
      // 🔴 Sin lectura no hay destinos que ofrecer y **no hay escritura posible**. Caer a `[]` acá
      // es exactamente lo que borra la clave del KV.
      setMotivo(r.motivo)
      return
    }
    const norm = (r.dato || []).map((g) => normalizar(g, nuevoId))
    setLista(norm)
    setElegida(norm[0]?.id || 'nueva')
    setBloqueId(norm[0]?.bloques?.[0]?.id || '')
  }

  async function mandar() {
    if (mandando) return
    setMandando(true)
    setMotivo(null)
    try {
      // ── 1. Las fotos primero: el base64 no entra al KV ni de paso ──
      setPaso('Subiendo las fotos…')
      const imgs: Record<string, string> = {}
      let sinFoto = 0
      for (const d of disenos) {
        if (!d.url.startsWith('data:')) {
          imgs[d.id] = d.url
          continue
        }
        try {
          imgs[d.id] = await subirBlob(d.url, 'ingresos')
        } catch {
          // Sin foto se sigue: el nombre es lo que hace el cruce con Gestión Nube, la foto es
          // decoración y se pega después desde Ingresos. Lo que no se hace nunca es meter el base64.
          imgs[d.id] = ''
          sinFoto++
        }
      }

      // ── 2. Relectura: el diálogo pudo estar abierto minutos ──
      setPaso('Leyendo las importaciones…')
      const fresco = await leerIngresos<Ingreso>(marca)
      if (!fresco.ok) {
        setMotivo(`No se pudo releer antes de escribir, así que no se escribió nada: ${fresco.motivo}`)
        return
      }
      const base = (fresco.dato || []).map((g) => normalizar(g, nuevoId))

      // ── 3. El destino, sobre lo fresco ──
      const esNueva = elegida === 'nueva'
      let conDestino = base
      let destinoId = elegida
      let destinoBloque = bloqueId
      let destinoDesc = ''
      if (esNueva) {
        const g = nuevoIngreso(nuevoId)
        g.desc = nombreNueva.trim() || 'Importación nueva'
        // Con cero columnas vacías: las 34 ya vienen. `nuevoIngreso` deja 10 huecos, que es lo que
        // quiere quien la arma a mano, no quien la recibe llena.
        g.bloques = [bloqueParaElPuente(nuevoId, '', modelosBase(nuevoId))]
        conDestino = [g, ...base]
        destinoId = g.id
        destinoBloque = g.bloques[0].id
        destinoDesc = g.desc
      } else {
        const g = base.find((x) => x.id === elegida)
        if (!g) {
          setMotivo('Esa importación ya no está. Cerrá y volvé a elegir.')
          return
        }
        destinoDesc = g.desc || 'sin nombre'
        if (!g.bloques?.some((b) => b.id === destinoBloque)) destinoBloque = g.bloques?.[0]?.id || ''
        if (!destinoBloque) {
          setMotivo('Esa importación no tiene ningún bloque. Creale uno desde Ingresos.')
          return
        }
      }

      // ── 4. Dedupe contra lo fresco, mirando TODOS los bloques ──
      const destino = conDestino.find((x) => x.id === destinoId)!
      const yaEstaban = yaEnLaImportacion(destino, disenos.map((d) => d.id))
      const candidatos = disenos.filter((d) => !yaEstaban.has(d.id))
      if (!candidatos.length) {
        toast.aviso(`Entraron 0. ${yaEstaban.size} ya ${yaEstaban.size === 1 ? 'estaba' : 'estaban'} en «${destinoDesc}».`)
        setAbierto(false)
        return
      }

      const prep = columnasDesdeDisenos(candidatos, {
        nid: nuevoId,
        nombreDe: (d) => nombres[d.id] ?? d.name,
        imgDe: (d) => imgs[d.id] ?? '',
      })
      if (!prep.columnas.length) {
        setMotivo('Ninguno tiene nombre comercial: sin nombre, la venta de esta compra no se puede medir.')
        return
      }

      // ── 5. Escribir. `conItemsDerivados` a TODOS, como useIngresos ──
      setPaso('Guardando…')
      const nueva = pasarADestino(conDestino, destinoId, destinoBloque, prep.columnas).map(conItemsDerivados)
      const esc = await guardarIngresos({ store: marca, ingresos: nueva, cred: await obtenerCred(), cargado: true })
      if (!esc.ok) {
        setMotivo(
          esc.prohibido
            ? `El KV de bdi-catalogo valida que seas admin, y esta cuenta no lo es: ${esc.motivo}. Pedile a un admin que lo pase.`
            : `No se guardó: ${esc.motivo}. No se tocó nada.`,
        )
        return
      }

      // ── 6. Verificar releyendo. El oráculo no es la pantalla que escribió ──
      setPaso('Verificando…')
      const verif = await leerIngresos<Ingreso>(marca)
      const puestos = verif.ok
        ? yaEnLaImportacion(
            (verif.dato || []).map((g) => normalizar(g, nuevoId)).find((g) => g.id === destinoId) || ({ bloques: [] } as unknown as Ingreso),
            prep.columnas.map((c) => c.disenoId!),
          )
        : new Set<string>()

      if (!verif.ok || puestos.size !== prep.columnas.length) {
        // ⛔ No se marca nada: la marca en el diseño diría "ya está mandado" sobre algo que no se
        // pudo confirmar. Repetir es seguro — el dedupe corre contra el KV, no contra la marca.
        setMotivo('Se guardó pero no lo puedo confirmar. Abrí Ingresos y mirá antes de repetir: repetir es seguro, no duplica.')
        return
      }

      // ── 7. Recién ahora, la marca en el tablero ──
      const fecha = new Date().toISOString()
      onEnviados(
        prep.columnas.map((c) => ({
          id: c.disenoId!,
          envio: { ingresoId: destinoId, ingresoDesc: destinoDesc, bloqueId: destinoBloque, columnaId: c.id, fecha, por: perfil?.name || perfil?.cuenta || '' },
        })),
      )
      setAbierto(false)
      toast.ok(
        `${prep.columnas.length} ${prep.columnas.length === 1 ? 'diseño' : 'diseños'} en «${destinoDesc}» — verificado.` +
          (yaEstaban.size ? ` ${yaEstaban.size} ya ${yaEstaban.size === 1 ? 'estaba' : 'estaban'}.` : '') +
          (sinFoto ? ` ${sinFoto} sin foto: se pegan desde Ingresos.` : '') +
          (prep.sinNombre.length ? ` ${prep.sinNombre.length} sin nombre no ${prep.sinNombre.length === 1 ? 'entró' : 'entraron'}.` : ''),
      )
    } catch (e) {
      setMotivo(e instanceof Error ? e.message : String(e))
    } finally {
      setMandando(false)
      setPaso('')
    }
  }

  const esNueva = elegida === 'nueva'
  const g = lista?.find((x) => x.id === elegida)
  const conNombre = disenos.filter((d) => (nombres[d.id] ?? d.name).trim())
  const columnasQueQuedan = (g?.bloques?.find((b) => b.id === bloqueId)?.disenos?.length || 0) + conNombre.length

  return (
    <>
      <Button variant="solid" tone="brand" onClick={() => void abrir()} disabled={!disenos.length}>
        Pasar a una importación{disenos.length ? ` (${disenos.length})` : ''}
      </Button>

      <Modal abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Pasar los diseños a una importación" ancho="ancho" cerrarConFondo={false}>
        {motivo && (
          <Notice tone="danger" icon="⚠" style={{ marginBottom: space[3] }}>
            {motivo}
          </Notice>
        )}

        {!lista && !motivo ? (
          <div style={{ color: color.mut2, fontSize: font.sm, padding: space[3] }}>Leyendo las importaciones…</div>
        ) : (
          <>
            <Field label="A qué importación">
              <Select
                value={elegida}
                onChange={(e) => {
                  setElegida(e.target.value)
                  setBloqueId(lista?.find((x) => x.id === e.target.value)?.bloques?.[0]?.id || '')
                }}
              >
                {(lista || []).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.desc || 'sin nombre'}
                    {x.proveedor ? ` · ${x.proveedor}` : ''}
                  </option>
                ))}
                <option value="nueva">— Una importación nueva —</option>
              </Select>
            </Field>

            {esNueva ? (
              <Field label="Nombre de la importación nueva" hint="Después se le ponen proveedor, fecha y cantidades desde Ingresos.">
                <Input value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} placeholder="Ingreso Diciembre" maxLength={80} />
              </Field>
            ) : (
              g && (g.bloques?.length || 0) > 1 && (
                <Field label="A qué bloque (material)">
                  <Select value={bloqueId} onChange={(e) => setBloqueId(e.target.value)}>
                    {(g.bloques || []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nombre || 'sin nombre'} ({b.disenos?.length || 0} diseños)
                      </option>
                    ))}
                  </Select>
                </Field>
              )
            )}

            {/* ⚠️ El riesgo real de esta función: 34 columnas × ~20 modelos son 680 celdas y la
                grilla de Ingresos se vuelve incómoda. Se avisa antes, no después. */}
            {columnasQueQuedan > COLUMNAS_COMODAS && (
              <Notice tone="warning" style={{ marginTop: space[3] }}>
                Ese bloque quedaría con <b>{columnasQueQuedan} columnas</b>. La grilla de Ingresos es modelos × diseños, así que arriba de ~{COLUMNAS_COMODAS} se vuelve difícil de cargar. Conviene partir por material en varios bloques.
              </Notice>
            )}

            <div style={{ fontSize: font.sm, fontWeight: 600, margin: `${space[4]}px 0 ${space[2]}px` }}>
              El nombre con el que va a entrar cada uno
              <div style={{ fontWeight: 400, color: color.mut, marginTop: 2 }}>
                Es el <b>nombre comercial</b>: con éste se carga el producto en Gestión Nube, y es lo único que después permite saber qué se vendió de esta compra. Los del tablero salen del nombre del archivo.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], maxHeight: 300, overflowY: 'auto', padding: 2 }}>
              {disenos.map((d) => {
                const val = nombres[d.id] ?? d.name
                return (
                  <div key={d.id} style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.url} alt="" style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 5, background: color.bg2, flex: 'none' }} />
                    <Input
                      value={val}
                      onChange={(e) => setNombres((n) => ({ ...n, [d.id]: e.target.value }))}
                      placeholder="Nombre comercial…"
                      maxLength={80}
                    />
                  </div>
                )
              })}
            </div>

            {conNombre.length < disenos.length && (
              <Notice tone="warning" style={{ marginTop: space[3] }}>
                {disenos.length - conNombre.length} sin nombre no {disenos.length - conNombre.length === 1 ? 'va a entrar' : 'van a entrar'}: sin nombre no cruzan con Gestión Nube y la venta de esta compra no se podría medir.
              </Notice>
            )}

            <div style={{ display: 'flex', gap: space[2], marginTop: space[4] }}>
              <Button variant="ghost" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
              <Button
                variant="solid"
                tone="brand"
                onClick={() => void mandar()}
                disabled={mandando || !lista || !conNombre.length || (esNueva && !nombreNueva.trim())}
                style={{ marginLeft: 'auto' }}
              >
                {mandando ? paso || 'Mandando…' : `Pasar ${conNombre.length === 1 ? 'el diseño' : 'los ' + conNombre.length}`}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  )
}
