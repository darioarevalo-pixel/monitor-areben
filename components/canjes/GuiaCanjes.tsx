'use client'

/**
 * El circuito de un canje, escrito.
 *
 * Hace falta más acá que en cualquier otra sección por dos razones concretas:
 *
 *  1. **Pasa por tres personas** —quien propone, quien firma, quien despacha— y ninguna ve la
 *     pantalla de la otra. El que arma la propuesta no se entera de que la orden se tipea a mano.
 *  2. **La mitad de los pasos ocurren fuera del sistema**: la negociación va por las redes, la
 *     orden se crea en el admin de Tienda Nube y el cumplimiento se carga mirando Instagram. Una
 *     pantalla no puede pedir lo que no puede hacer, así que hay que decirlo.
 *
 * ⚠️ Los nombres de los estados salen de `ESTADO_CANJE_LABEL`, **no se escriben a mano**: una guía
 * que dice "Esperando aprobación" cuando la pantalla dice otra cosa es peor que no tener guía.
 */

import { Instructivo, color, font, space, weight } from '@/components/ui'
import { ESTADO_CANJE_LABEL, unidadDeLaMarca, type CanjeConfig } from '@/lib/canjes/tipos'

const E = ESTADO_CANJE_LABEL

/** Un estado, escrito igual que en la pantalla. */
function Est({ children }: { children: React.ReactNode }) {
  return <b style={{ color: color.brand }}>{children}</b>
}

/** Quién hace el paso. El circuito se traba cuando cada uno cree que le toca al otro. */
function Quien({ children }: { children: React.ReactNode }) {
  return <span style={{ color: color.mut, fontSize: font.sm }}> — {children}</span>
}

export function GuiaCanjes({ cfg }: { cfg: CanjeConfig | null }) {
  const unidad = unidadDeLaMarca(cfg)

  return (
    <Instructivo
      titulo="¿Cómo se trabaja un canje, de punta a punta?"
      pasos={[
        <>
          <b>Buscala en el padrón</b> y tocá <b>+ canje</b> en su fila. Si no está, se agrega con el
          @ y nada más.
          <Quien>marketing</Quien>
        </>,
        <>
          <b>Armá la propuesta en la misma pantalla</b>: de qué marca, cuántos {unidad} y qué le
          pedís que publique. Al confirmar sale <b>el mensaje para copiarle</b>.
          {' '}Si tenés permiso para firmarla, sale derecho y queda en <Est>{E.enviada}</Est>; si no,
          queda en <Est>{E.propuesta}</Est> hasta que alguien la apruebe desde la pestaña
          Aprobaciones.
          <Quien>marketing · gerencia si hay que firmar</Quien>
        </>,
        <>
          <b>Escribile por Instagram o WhatsApp</b> con ese mensaje. Desde que lo copiás, el canje
          deja de decir &quot;falta escribirle&quot;.
          <Quien>marketing</Quien>
        </>,
        <>
          <b>Se negocia por las redes, no acá.</b> Si al final quedó en otra cosa, entrá al canje y
          tocá <b>Generar cambios</b>: se corrige el trato y el mensaje se rearma solo con las
          condiciones nuevas.
          <Quien>marketing</Quien>
        </>,
        <>
          Según lo que conteste, <b>Aceptó</b> o <b>No aceptó</b> (con el motivo, que después lo lee
          quien la vuelva a proponer). Con el sí pasa a <Est>{E.acuerdo}</Est> y{' '}
          <b>recién ahí aparece el link</b> para mandarle.
          <Quien>marketing</Quien>
        </>,
        <>
          <b>Mandale el link.</b> Ella carga su dirección y su talle o modelo de celular desde el
          celular, en un formulario corto. Si ya trabajó con nosotros, le aparece todo prellenado y
          sólo confirma.
          <Quien>ella</Quien>
        </>,
        <>
          <b>Cargá los productos</b> contra lo acordado. El sistema no te deja pasarte de la
          cantidad; que sean los productos correctos lo mirás vos.
          <Quien>marketing</Quien>
        </>,
        <>
          <b>Creá la orden a mano en el admin de Tienda Nube</b>, con la dirección que cargó ella y
          100% de descuento. Volvé, poné el número de orden y tocá <b>Verificar</b>: si el total no
          da $0, te avisa.
          <Quien>quien despacha</Quien>
        </>,
        <>
          Cargá <b>cómo va, el código de seguimiento y el costo del envío</b>, avisale que salió, y
          cuando le llegue tocá <b>Marcar que le llegó</b>. Ese toque es el que{' '}
          <b>arranca los plazos</b> de lo que prometió publicar.
          <Quien>quien despacha</Quien>
        </>,
        <>
          <b>Cargá cada publicación</b> a medida que sale y verificala. Una publicación sin
          verificar no cuenta. Si se pasó el plazo, hay un botón para copiarle el recordatorio.
          <Quien>marketing</Quien>
        </>,
        <>
          <b>Cerrá la acción</b> con el balance. El botón te dice qué falta mientras no se pueda:
          verificar publicaciones, cargar el costo del envío, pagar lo que se haya acordado.
          <Quien>marketing</Quien>
        </>,
      ]}
      ojo={
        <>
          El monitor <b>no crea la orden ni el cupón</b> en Tienda Nube: no tiene permiso para
          escribir ventas, y eso no va a cambiar. Sólo lee la orden por número para avisarte si
          quedó con un total distinto de $0.
        </>
      }
    />
  )
}

/**
 * Los estados, en una línea. Va debajo del instructivo porque responde otra pregunta: no "qué
 * hago" sino "por qué este canje está en esta pila".
 */
export function LineaDeEstados() {
  const tramos: { label: string; nota: string }[] = [
    { label: E.propuesta, nota: 'la firma es nuestra' },
    { label: E.enviada, nota: 'la pelota es de ella' },
    { label: E.acuerdo, nota: 'dijo que sí' },
    { label: E.preparando, nota: 'comprar y despachar' },
    { label: E.en_curso, nota: 'ya le llegó' },
    { label: E.cerrado, nota: 'con balance' },
  ]
  return (
    <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', marginBottom: space[3] }}>
      {tramos.map((t, i) => (
        <span key={t.label} style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
          <span style={{ fontSize: font.sm }}>
            <span style={{ fontWeight: weight.medium }}>{t.label}</span>
            <span style={{ color: color.mut2 }}> ({t.nota})</span>
          </span>
          {i < tramos.length - 1 && <span style={{ color: color.mut2 }}>›</span>}
        </span>
      ))}
    </div>
  )
}
