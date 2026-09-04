'use client'

import { useState } from 'react'
import { color } from '@/components/ui'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { useSesion } from '@/components/SesionProvider'
import { useModelosElegibles } from '@/components/modelos/useModelos'
import {
  conModelo,
  desdeFicha,
  hayModelo,
  resumenDeModelo,
  type ModeloEditable,
  type ModeloSesion,
} from '@/lib/sesionfotos/modelo'

/**
 * La ficha de la modelo de la sesión: quién es y qué talle usa.
 *
 * 🔑 **Los tres campos se escriben en un borrador local y se guardan al SALIR de cada uno**, no en
 * cada tecla. `conModelo` normaliza y **borra la ficha entera cuando el talle queda vacío**, así que
 * guardando letra por letra el primer backspace del talle se llevaría puesto el nombre y la altura.
 *
 * ⚠️ Los talles sugeridos **los pasa el que la usa** (`talles`), ⛔ no los deduce esta ficha: ver
 * el prop. Desde el 4-sep-2026 la misma ficha sirve para la SOLICITUD y para el EVENTO —la sesión
 * de fotos como padre—, y por eso vive en su propio archivo y ⛔ no adentro de `SesionFotos.tsx`:
 * importarla de ahí sería un ciclo.
 *
 * 🔑 **Desde el 3-sep-2026 la modelo se ELIGE del padrón** (Model Management) en vez de tipearse, y
 * eso ⛔ no es comodidad: elegirla deja el `id` de su ficha en la sesión, que es lo único con lo que
 * después se puede contestar «cuántas sesiones hizo cada una y cómo vendió lo que fotografió» — el
 * análisis que pidió Bruno en el mismo dictado. Tipear el nombre ⛔ no engancha nada.
 * ⚠️ **Los tres campos siguen estando y siguen siendo libres**: la modelo que está parada en el
 * estudio y ⛔ no tiene ficha se anota igual, como se venía haciendo. El selector es un atajo, ⛔ no
 * una puerta.
 * 🔴 **El padrón se pide por MARCA y ⛔ nunca por línea**: `stunned` es una línea de Zattia y el
 * permiso es por marca — pedirlo con la línea contesta 403 sin decir por qué.
 */
export function FichaModelo<T extends { modelo?: ModeloSesion }>({
  s,
  talles,
  editable,
  usuario,
  setWork,
}: {
  s: T
  /**
   * Los talles que se sugieren. Los pone el que llama y ⛔ no los deduce esta ficha: en una
   * SOLICITUD salen de las variantes que la modelo tuvo en la mano; en un EVENTO todavía no hay
   * ninguna, y la lista vacía es la respuesta correcta —⛔ no una lista fija que imponga un
   * alfabeto (S/M/L contra 38/40/42, que en Zattia conviven)—.
   */
  talles: string[]
  editable: boolean
  usuario: string
  setWork: (f: (w: T) => T) => void
}) {
  const { marca } = useSesion()
  const [borrador, setBorrador] = useState<ModeloEditable>({
    id: s.modelo?.id,
    nombre: s.modelo?.nombre || '',
    talle: s.modelo?.talle || '',
    altura: s.modelo?.altura || '',
  })
  const { modelos: padron, error: errPadron } = useModelosElegibles(editable ? marca : null)
  // ⚠️ `guardarCon` toma el borrador POR PARÁMETRO y `guardar` ⛔ no toma ninguno: `onBlur={onSalir}`
  // le pasa el evento del DOM a lo que le den, y un evento como borrador es un talle vacío — o sea
  // `conModelo` **borrando la ficha entera** en el primer blur. Dos funciones, y ninguna trampa.
  const guardarCon = (b: ModeloEditable) => setWork((w) => conModelo(w, b, { por: usuario, ts: Date.now() }))
  const guardar = () => guardarCon(borrador)
  const elegir = (id: string) => {
    const b = desdeFicha(padron.find((m) => m.id === id) || null, borrador)
    setBorrador(b)
    guardarCon(b)
  }

  if (!editable) {
    if (!hayModelo(s.modelo)) return null
    return (
      <div style={{ fontSize: 12, color: color.mut2, margin: '8px 0' }}>👗 Modelo: {resumenDeModelo(s.modelo)}</div>
    )
  }

  return (
    <div style={{ border: `1px solid ${color.line}`, borderRadius: 9, padding: '10px 12px', margin: '10px 0', background: color.bg }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>
        La modelo{' '}
        <InfoPopover titulo="El talle de la modelo">
          Qué talle tiene puesto la modelo en esta sesión. Es lo que la clienta pregunta antes de comprar, y se
          usa después en «Descripción y medidas» para escribirlo en la ficha del producto. El nombre es para
          adentro: a la tienda sale sólo el talle y la altura.
        </InfoPopover>
      </div>
      <div style={{ fontSize: 12, color: color.mut2, marginBottom: 8 }}>
        Con el talle alcanza. Si no lo cargás, la descripción de estas prendas no lo va a poder decir.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {padron.length ? (
          <label style={{ fontSize: 11, color: color.mut2, display: 'inline-block' }}>
            Del padrón
            <select
              value={borrador.id || ''}
              onChange={(e) => elegir(e.target.value)}
              style={{
                display: 'block',
                width: 180,
                padding: '6px 8px',
                marginTop: 2,
                border: `1px solid ${color.line2}`,
                borderRadius: 8,
                fontSize: 14,
                boxSizing: 'border-box',
                background: '#fff',
              }}
            >
              <option value="">Tipear a mano</option>
              {padron.map((m) => (
                <option key={m.id} value={m.id}>
                  {[m.nombre, m.talle ? `talle ${m.talle}` : null].filter(Boolean).join(' · ')}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <CampoModelo
          label="Nombre"
          ancho={160}
          valor={borrador.nombre || ''}
          onCambio={(v) => setBorrador((b) => ({ ...b, nombre: v }))}
          onSalir={guardar}
          placeholder="Sofi"
        />
        <CampoModelo
          label="Talle que usa"
          ancho={110}
          valor={borrador.talle || ''}
          onCambio={(v) => setBorrador((b) => ({ ...b, talle: v }))}
          onSalir={guardar}
          placeholder="S"
          lista={talles}
        />
        <CampoModelo
          label="Altura"
          ancho={110}
          valor={borrador.altura || ''}
          onCambio={(v) => setBorrador((b) => ({ ...b, altura: v }))}
          onSalir={guardar}
          placeholder="1,70"
        />
        <div style={{ fontSize: 12, color: hayModelo(s.modelo) ? color.successInk : color.mut, paddingBottom: 8 }}>
          {hayModelo(s.modelo) ? `✓ ${resumenDeModelo(s.modelo)}` : 'Sin cargar'}
        </div>
      </div>
      {/* ⚠️ Se dice, ⛔ no se esconde: sin padrón el selector no está y el que carga tiene que saber
          por qué —si no, lo lee como que la sección no anda—. Las dos son frases de una línea y
          ninguna frena nada: los tres campos siguen ahí abajo. */}
      {errPadron ? (
        <div style={{ fontSize: 11, color: color.mut, marginTop: 6 }}>
          No se pudo leer el padrón de Modelos ({errPadron}). Se anota a mano igual.
        </div>
      ) : !padron.length ? (
        <div style={{ fontSize: 11, color: color.mut, marginTop: 6 }}>
          Todavía no hay fichas cargadas en Modelos: la modelo se anota a mano, y cuando su ficha
          exista se la elige de la lista.
        </div>
      ) : borrador.id ? null : (
        <div style={{ fontSize: 11, color: color.mut, marginTop: 6 }}>
          Tipeada a mano: no queda enganchada con su ficha, así que esta sesión ⛔ no le va a contar
          para «cuántas hizo».
        </div>
      )}
    </div>
  )
}

/** Un campo de la ficha de la modelo. `lista` dibuja las sugerencias sin cerrar el campo. */
function CampoModelo({
  label,
  valor,
  onCambio,
  onSalir,
  placeholder,
  ancho,
  lista,
}: {
  label: string
  valor: string
  onCambio: (v: string) => void
  onSalir: () => void
  placeholder: string
  ancho: number
  lista?: string[]
}) {
  const id = `modelo-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <label style={{ fontSize: 11, color: color.mut2, display: 'inline-block' }}>
      {label}
      <input
        value={valor}
        placeholder={placeholder}
        list={lista?.length ? `${id}-lista` : undefined}
        onChange={(e) => onCambio(e.target.value)}
        onBlur={onSalir}
        style={{
          display: 'block',
          width: ancho,
          padding: '6px 8px',
          marginTop: 2,
          border: `1px solid ${color.line2}`,
          borderRadius: 8,
          fontSize: 14,
          boxSizing: 'border-box',
          background: '#fff',
        }}
      />
      {lista?.length ? (
        <datalist id={`${id}-lista`}>
          {lista.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      ) : null}
    </label>
  )
}

/**
 * El resultado de una sesión, en una línea. El «sin contestar» se dice con el mismo peso que los
 * otros dos: es lo que distingue «no se fotografió» de «nadie lo anotó».
 */
