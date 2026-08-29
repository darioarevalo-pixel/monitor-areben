'use client'

/**
 * La propuesta **entera en una pantalla**: la marca, cuántos productos, de qué vitrina elige y qué
 * se le pide publicar.
 *
 * Sale de `ProponerCanje` para que la propuesta de a una y la de a muchas armen **el mismo
 * formulario**. Lo que no se comparte es lo que viene después: el paso del mensaje es per-persona
 * (lleva su nombre y marca su canje como contactado) y la pantalla de cierre de un lote es otra cosa
 * entera. Se comparte el 90% del código y no el 100% de la divergencia.
 *
 * Dos cosas que conviene no volver a discutir:
 * - **El tope por unidades es el default.** Así se trabaja: "3 fundas", no "hasta $80.000". El modo
 *   monto sigue existiendo porque a veces se pacta así, pero dejó de ser lo primero que se ve.
 * - **La marca se elige acá.** El padrón es transversal a las tres marcas, así que se propone desde
 *   donde uno esté parado sin tener que cambiar de pestaña primero.
 *
 * El bloqueo por vencidos (§2 bis) **no se chequea acá**: hace falta ver los canjes de todas las
 * marcas y eso sólo lo puede el servidor, que rechaza con el motivo ya escrito en criollo.
 */

import { useMemo, useState } from 'react'
import {
  Button, Field, Input, Notice, PasoCantidad, Select,
  color, font, space, weight,
} from '@/components/ui'
import type { PropuestaSinPersona, VitrinaEnLista } from '@/lib/canjes/cliente'
import {
  CANJE_STORES, STORE_LABEL, TIPO_CANJE_LABEL, naceEn, retiroLocalDisponible, unidadDeLaMarca,
  type CanjeConfig, type CanjeStore, type EstadoCanje, type NivelAprobacion,
  type TipoCanje, type TopeTipo, type TopeUnidad,
} from '@/lib/canjes/tipos'
import {
  CombosEntregables, GrillaEntregables, PEDIDO_VACIO, pedidoALista, totalPedido,
  type PedidoPorTipo,
} from './GrillaEntregables'

/** Lo que el formulario sabe armar, más de qué marca es y con qué firma va a nacer. */
export type PropuestaArmada = {
  marca: CanjeStore
  datos: PropuestaSinPersona
  estadoAlNacer: EstadoCanje
}

export function useFormularioPropuesta({
  store, configs, vitrinas, susNiveles,
}: {
  store: CanjeStore
  configs: CanjeConfig[]
  vitrinas: VitrinaEnLista[]
  susNiveles: NivelAprobacion[]
}) {
  const [marca, setMarca] = useState<CanjeStore>(store)
  const [tipo, setTipo] = useState<TipoCanje>('producto')
  const [titulo, setTitulo] = useState('')
  const [topeTipo, setTopeTipo] = useState<TopeTipo>('unidades')
  const [topePvp, setTopePvp] = useState('')
  const [montoPlata, setMontoPlata] = useState('')
  const [pedido, setPedido] = useState<PedidoPorTipo>(PEDIDO_VACIO)
  const [vitrinaId, setVitrinaId] = useState<number | null>(null)
  // Cómo lo recibe. Se guarda crudo y se deriva contra la marca: al pasar de BDI a Zattia el retiro
  // no puede quedar prendido en silencio, pero volver a BDI sí tiene que recordar lo que se eligió.
  const [retiroCrudo, setRetiroCrudo] = useState(false)
  // La unidad arranca en la de la marca y se re-arma si la cambian, pero sin pisar lo que hayan
  // escrito a mano: por eso el estado guarda la línea y no sólo el número.
  const [unidades, setUnidades] = useState<TopeUnidad[]>([{ cantidad: 1, descripcion: '' }])

  /** Sólo las **activas** de la marca elegida: una en borrador se está armando todavía. */
  const vitrinasDeLaMarca = useMemo(
    () => vitrinas.filter((v) => v.store === marca && v.estado === 'activa'),
    [vitrinas, marca],
  )
  // Cambiar de marca invalida la vitrina elegida: son de una marca cada una.
  const vitrinaElegida = vitrinasDeLaMarca.some((v) => v.id === vitrinaId) ? vitrinaId : null

  const hayLocal = retiroLocalDisponible(marca)
  const retiroLocal = hayLocal && retiroCrudo

  const cfg = useMemo(() => configs.find((c) => c.store === marca) || null, [configs, marca])
  const unidadPorDefecto = unidadDeLaMarca(cfg)

  const lineas = unidades.map((u) => ({ ...u, descripcion: u.descripcion || unidadPorDefecto }))
  const unidadesLimpias = lineas.filter((u) => u.descripcion.trim() !== '' && Number(u.cantidad) > 0)

  const canjeParcial = {
    store: marca,
    tipo,
    monto_plata: tipo === 'producto_plata' && montoPlata !== '' ? Number(montoPlata) : null,
    tope_tipo: topeTipo,
    tope_pvp: topeTipo === 'monto' && topePvp !== '' ? Number(topePvp) : null,
    tope_unidades: topeTipo === 'unidades' ? unidadesLimpias : [],
  }

  const hayTope = topeTipo === 'monto' ? topePvp !== '' : unidadesLimpias.length > 0
  const puede = hayTope && totalPedido(pedido) > 0

  // Con qué firma sale. `naceEn` es la misma función que corre el servidor.
  const { estado: estadoAlNacer, nivel } = naceEn(canjeParcial, [], {
    umbral_aprobacion_alta: cfg?.umbral_aprobacion_alta ?? null,
    factor_costo_estimado: cfg?.factor_costo_estimado ?? 0.4,
  }, susNiveles)

  const armada: PropuestaArmada = {
    marca,
    estadoAlNacer,
    datos: {
      tipo,
      titulo: titulo.trim() || undefined,
      tope_tipo: topeTipo,
      tope_pvp: topeTipo === 'monto' ? Number(topePvp) : null,
      tope_unidades: topeTipo === 'unidades' ? unidadesLimpias : [],
      monto_plata: tipo === 'producto_plata' && montoPlata !== '' ? Number(montoPlata) : null,
      entregables: pedidoALista(pedido),
      vitrina_id: vitrinaElegida,
      retiro_local: retiroLocal,
    },
  }

  return {
    armada, puede, canjeParcial, cfg, pedido, titulo, nivel, estadoAlNacer,
    campos: {
      marca, setMarca, tipo, setTipo, setTitulo, topeTipo, setTopeTipo, topePvp, setTopePvp,
      montoPlata, setMontoPlata, setPedido, vitrinaId, setVitrinaId, unidades, setUnidades,
      retiroLocal, setRetiroCrudo, hayLocal,
      lineas, unidadPorDefecto, vitrinasDeLaMarca, sugeridas: cfg?.unidades_sugeridas || [],
    },
  }
}

export type FormularioPropuestaEstado = ReturnType<typeof useFormularioPropuesta>

export function FormularioPropuesta({
  estado, marcasVisibles,
}: {
  estado: FormularioPropuestaEstado
  marcasVisibles: CanjeStore[]
}) {
  const {
    marca, setMarca, tipo, setTipo, setTitulo, topeTipo, setTopeTipo, topePvp, setTopePvp,
    montoPlata, setMontoPlata, setPedido, vitrinaId, setVitrinaId, setUnidades,
    retiroLocal, setRetiroCrudo, hayLocal,
    lineas, unidadPorDefecto, vitrinasDeLaMarca, sugeridas,
  } = estado.campos
  const [detalles, setDetalles] = useState(false)

  return (
    <>
      {/* ── Qué se le manda ── */}
      <div style={{ display: 'grid', gap: space[3], gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Field label="De qué marca">
          <Select value={marca} onChange={(e) => setMarca(e.target.value as CanjeStore)}>
            {CANJE_STORES.filter((s) => marcasVisibles.includes(s)).map((s) => (
              <option key={s} value={s}>{STORE_LABEL[s]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Cómo se acordó">
          <Select value={topeTipo} onChange={(e) => setTopeTipo(e.target.value as TopeTipo)}>
            <option value="unidades">Por cantidad (&quot;3 {unidadPorDefecto}&quot;)</option>
            <option value="monto">Por monto (&quot;hasta $80.000&quot;)</option>
          </Select>
        </Field>
        {/* Sólo aparece en las marcas que tienen local. Donde no lo hay, un desplegable con una sola
            opción es ruido. */}
        {hayLocal && (
          <Field
            label="Cómo lo recibe"
            hint={retiroLocal ? 'Elige las fundas en el mostrador y el local se las entrega.' : undefined}
          >
            <Select value={retiroLocal ? 'local' : 'envio'} onChange={(e) => setRetiroCrudo(e.target.value === 'local')}>
              <option value="envio">Se lo enviamos</option>
              <option value="local">Retira en el local</option>
            </Select>
          </Field>
        )}
      </div>

      {topeTipo === 'monto' ? (
        <div style={{ marginTop: space[3] }}>
          <Field label="Hasta cuánto puede elegir" hint="En PVP. Al cargar productos no se va a poder pasar de acá" required>
            <Input type="number" value={topePvp} onChange={(e) => setTopePvp(e.target.value)} autoFocus />
          </Field>
        </div>
      ) : (
        <div style={{ marginTop: space[3] }}>
          <div style={{ color: color.mut, fontSize: font.sm, marginBottom: space[2] }}>
            Qué se le manda. El total se controla solo al cargar los productos; que sean los
            correctos lo mirás vos.
          </div>
          {lineas.map((u, i) => (
            <div key={i} style={{ display: 'flex', gap: space[2], marginBottom: space[2], alignItems: 'center' }}>
              {/* El mismo control que cuenta las historias abajo: es el mismo gesto —"cuántos"— y
                  Bruno lo pidió textual. Piso 1: una línea de cero productos no es una línea. */}
              <PasoCantidad
                valor={u.cantidad}
                min={1}
                onCambio={(n) => setUnidades((p) => p.map((x, j) => (j === i ? { ...x, cantidad: n } : x)))}
                etiqueta={u.descripcion || unidadPorDefecto}
                autoFocus={i === 0}
              />
              <Input
                value={u.descripcion}
                list="canje-unidades"
                placeholder={unidadPorDefecto}
                onChange={(e) => setUnidades((p) => p.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)))}
                style={{ flex: 1 }}
              />
              {lineas.length > 1 && (
                <Button variant="ghost" tone="danger" size="sm" onClick={() => setUnidades((p) => p.filter((_, j) => j !== i))}>
                  Sacar
                </Button>
              )}
            </div>
          ))}
          {/* Las sugerencias son eso: sugerencias. Nunca una lista cerrada — el día que entre algo
              nuevo no puede depender de un deploy. */}
          <datalist id="canje-unidades">
            {[unidadPorDefecto, ...sugeridas].map((u) => <option key={u} value={u} />)}
          </datalist>
          <Button variant="ghost" size="sm" onClick={() => setUnidades((p) => [...p, { cantidad: 1, descripcion: '' }])}>
            Agregar otra línea
          </Button>
        </div>
      )}

      {/* ── De dónde elige ──
          Opcional a propósito: sin vitrina el canje funciona como siempre —los productos los cargás
          vos— y el link sólo le pide los datos. */}
      <div style={{ marginTop: space[4] }}>
        <Field
          label="De qué vitrina elige"
          hint={
            vitrinasDeLaMarca.length
              ? 'Lo que va a ver al abrir el link. Se puede cambiar después, hasta que elija.'
              : 'Todavía no hay ninguna vitrina activa de esta marca: se arman en la pestaña Vitrinas.'
          }
        >
          <Select
            value={vitrinaId == null ? '' : String(vitrinaId)}
            disabled={!vitrinasDeLaMarca.length}
            onChange={(e) => setVitrinaId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Sin vitrina — los productos los cargás vos</option>
            {vitrinasDeLaMarca.map((v) => (
              <option key={v.id} value={v.id}>{v.nombre}</option>
            ))}
          </Select>
        </Field>
      </div>

      {/* ── Qué publica ── */}
      <div style={{ marginTop: space[5] }}>
        <div style={{ fontWeight: weight.medium, marginBottom: space[2] }}>Qué le pedimos a cambio</div>
        {/* Los combos primero: son el 90% de los acuerdos y evitan tocar seis veces el `+` para
            llegar siempre al mismo lugar. Elegir uno pisa lo cargado y después se ajusta abajo. */}
        <CombosEntregables valor={estado.pedido} onElegir={setPedido} />
        <GrillaEntregables valor={estado.pedido} onCambio={setPedido} />
      </div>

      {/* ── Detalles, plegados: `producto_plata` es la excepción y no tiene por qué competir ── */}
      <div style={{ marginTop: space[4] }}>
        <Button variant="ghost" size="sm" onClick={() => setDetalles((v) => !v)}>
          {detalles ? 'Ocultar los detalles' : 'Detalles (título, plata)'}
        </Button>
        {detalles && (
          <div style={{ display: 'grid', gap: space[3], gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: space[3] }}>
            <Field label="De qué es la acción" hint="Opcional, para reconocerlo después">
              <Input value={estado.titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Lanzamiento cápsula invierno" />
            </Field>
            <Field label="Qué se le da">
              <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoCanje)}>
                {(['producto', 'producto_plata'] as TipoCanje[]).map((t) => (
                  <option key={t} value={t}>{TIPO_CANJE_LABEL[t]}</option>
                ))}
              </Select>
            </Field>
            {tipo === 'producto_plata' && (
              <Field label="Cuánta plata" hint="El pago se hace por fuera; acá se registra">
                <Input type="number" value={montoPlata} onChange={(e) => setMontoPlata(e.target.value)} />
              </Field>
            )}
          </div>
        )}
      </div>
    </>
  )
}

/** Con qué firma va a nacer. Un salteo silencioso se lee como que el sistema hizo algo raro. */
export function AvisoDeFirma({ estado, cuantos }: { estado: FormularioPropuestaEstado; cuantos: number }) {
  const varios = cuantos > 1
  if (estado.estadoAlNacer === 'enviada') {
    return (
      <Notice tone="action">
        {varios
          ? `Se mandan directo: al confirmar te doy los ${cuantos} mensajes para copiar, uno por persona.`
          : 'Se manda directo: al confirmar te doy el mensaje para copiarle.'}
      </Notice>
    )
  }
  return (
    <Notice tone="warning">
      {estado.nivel === 'aprobar-plata'
        ? `${varios ? 'Van' : 'Va'} a la firma de quien pueda aprobar canjes con plata o de monto alto. Hasta que ${varios ? 'los' : 'lo'} firmen no hay nada para mandar.`
        : `${varios ? 'Van' : 'Va'} a la firma de quien pueda aprobar canjes. Hasta que ${varios ? 'los' : 'lo'} firmen no hay nada para mandar.`}
    </Notice>
  )
}
