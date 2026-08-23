'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSesion } from '@/components/SesionProvider'
import { useLinea } from '@/components/fundas/useDatosMonitor'
import { esAdmin, puedeVer, tieneFuncion } from '@/lib/permisos'
import { ponerVerSolicitud } from '@/lib/sesionfotos/puente'

import { agruparAvisos, comoLeLlamamos, fechaLarga, horaLabel, modoInicio, novedadesDeInicio, origenesDe } from '@/lib/inicio/core'
import { fmtHace } from '@/lib/resumen'
import { useAvisos } from '@/store/useAvisos'
import { useSistema } from '@/store/useSistema'
import { marcarVisto, vistoHasta } from '@/lib/notificaciones/visto'
import { BandaPromoHoy } from '@/components/agenda/BandaPromoHoy'
import { AvisosHoy } from '@/components/agenda/AvisosHoy'
import { PendientesHoy } from '@/components/agenda/PendientesHoy'
import { LoQueViene } from '@/components/inicio/LoQueViene'
import { avisosDe, contarSinTildar, hoyIso } from '@/lib/agenda'
import { useAgenda } from '@/store/useAgenda'
import { HeaderAcciones } from '@/components/layout/acciones'
import { Button, Card, EmptyState, Esqueleto, MarcaChip, color, font, space, toneTokens } from '@/components/ui'
import type { Aviso } from '@/lib/notificaciones/tipos'

/**
 * Inicio: la casa. Qué pasa hoy, según la función de cada uno.
 *
 * # De bandeja de solicitudes a pantalla de inicio (ago-2026)
 *
 * 🔑 **Esta pantalla ahora muestra los MISMOS avisos que cuenta el badge del sidebar.** Antes leía
 * `resumenes` —las solicitudes crudas— mientras el badge contaba `avisos`, que son seis tipos
 * derivados por rol y permiso (`lib/notificaciones/derivar.ts`). O sea: el sidebar decía "6", se
 * entraba, y se veían tres. Los canjes esperando firma, las fallas por llevar al depósito y la
 * mercadería que salió y no volvió **no se veían en ninguna pantalla del monitor**: se derivaban,
 * se contaban, y no se mostraban en ningún lado. Un contador que no se puede vaciar mirando enseña
 * a ignorar el contador, y ahí se pierde la pantalla entera.
 *
 * # Por qué no cuesta un fetch
 *
 * Nada de acá se pide: el shell ya llenó los tres stores al arrancar (`useAvisosPoll`). Los avisos
 * se refrescan solos cada 3 minutos; las novedades y la agenda, una vez. Esta pantalla sólo pinta.
 *
 * # El orden es el del día de trabajo
 *
 * 1. Quién sos y qué día es — que reciba, no que informe.
 * 2. La promo bancaria de hoy, si atendés: es lo único con hora de vencimiento.
 * 3. Las acciones que se hacen con el cliente delante (falla, cambio).
 * 4. Lo que te está esperando, en bloques por tipo y con lo rojo arriba.
 * 5. Lo que viene: feriados, fechas y cumpleaños. Es contexto, no tarea — enterarse el martes de
 *    que el lunes no se abre sirve igual, y arriba empujaría los pendientes abajo del pliegue.
 * 6. Las últimas novedades: se leen cuando hay un rato, no cuando entrás corriendo.
 */
export function Inicio() {
  const { perfil, marca, setMarca } = useSesion()
  const { setLinea } = useLinea()
  const router = useRouter()
  const admin = esAdmin(perfil)
  const ve = (k: string) => admin || puedeVer(perfil, marca, k)

  // Los datos y el refresco viven en el store compartido (`useAvisosPoll`, montado en el
  // shell): antes esta pantalla tenía su propio setInterval de 3 minutos, y Solicitudes otro,
  // pidiendo lo mismo por separado.
  const avisos = useAvisos((st) => st.avisos)
  const cargadoEn = useAvisos((st) => st.cargadoEn)
  const recargar = useAvisos((st) => st.cargar)
  const recontar = useAvisos((st) => st.recontar)

  const novedades = useSistema((st) => st.novedades)
  const leidas = useSistema((st) => st.leidas)

  // Los pendientes rutinarios de hoy (Agenda operativa). Tampoco cuesta un fetch: el mismo
  // `useAvisosPoll` que trae los avisos ya llenó este store.
  const hoy = hoyIso()
  const itemsAgenda = useAgenda((st) => st.items)
  const hechosAgenda = useAgenda((st) => st.hechos)
  const faltanHoy = contarSinTildar(itemsAgenda, hechosAgenda, hoy, { marca })
  // ⚠️ `avisosDeHoy` es de la AGENDA (cargados a mano, con fecha) y no tiene nada que ver con
  // `avisos`, que son los seis tipos que esta pantalla deriva de las solicitudes. Comparten palabra
  // y nada más: por eso el bloque de abajo no dice "avisos" en el título.
  const avisosDeHoy = avisosDe(itemsAgenda, hoy, { marca })

  /**
   * El reloj de "actualizado hace X min".
   *
   * Va por estado y no leyendo `Date.now()` al pintar por dos motivos que son el mismo: llamar algo
   * impuro durante el render es lo que el lint frena, y una etiqueta de frescura que sólo se
   * recalcula cuando algo más redibuja la pantalla dice "hace 1 min" media hora después — o sea, la
   * única línea que promete que esto es de ahora sería la única que miente.
   */
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  // `cargadoEn` en 0 es "todavía no volvió la primera lectura" y va al esqueleto. Después de eso
  // una lista vacía es una respuesta —"estás al día"— y no una pantalla a medio cargar.
  const grupos = cargadoEn ? agruparAvisos(avisos) : null
  const ultimas = novedadesDeInicio(novedades, leidas)

  // Abrir Inicio ES leer los avisos: se apaga el contador del sidebar. El "visto" se lee ANTES
  // de marcar, para poder seguir resaltando en esta pantalla lo que acaba de llegar.
  const [corte] = useState(() => vistoHasta(perfil?.name))
  useEffect(() => {
    marcarVisto(perfil?.name)
    recontar(perfil?.name)
  }, [perfil?.name, avisos, recontar])

  /**
   * Adónde lleva el clic. Cada aviso ya trae su `ruta`; lo único que se agrega es lo que la ruta
   * no puede decir: si el aviso es de la otra marca hay que cambiarla antes, y la solicitud de
   * fotos necesita que le dejen el id apuntado para abrirla en la pantalla de destino.
   *
   * El id del aviso es `solicitud:<marca>:<id>` (`lib/notificaciones/derivar.ts`), así que el id de
   * la solicitud es todo lo que viene después del segundo `:` — y se rearma con `join`, no con
   * `pop`, porque un id con dos puntos adentro se partiría en silencio y abriría la pantalla vacía.
   */
  const ir = (a: Aviso) => {
    if (marca !== a.marca) setMarca(a.marca)
    // La línea también: un aviso de Stunned salta a la cuenta de Zattia —es su base— pero la
    // pantalla tiene que abrir en la pestaña de Stunned, que es donde está la solicitud.
    setLinea(a.linea)
    if (a.ruta === '/sesion-fotos') ponerVerSolicitud(a.id.split(':').slice(2).join(':'))
    router.push(a.ruta)
  }

  // Las acciones del día, por permiso. El orden es el de uso real: primero lo que se hace
  // con el cliente delante (falla, cambio), después lo de la trastienda.
  const acciones: { label: string; ruta: string; destacado?: boolean }[] = [
    ve('postventa-local') && { label: 'Cargar falla', ruta: '/postventa-local', destacado: true },
    ve('cambios-local') && { label: 'Cargar cambio', ruta: '/cambios-local', destacado: true },
    ve('postventa-deposito') && { label: 'Falla (depósito)', ruta: '/postventa-deposito' },
    ve('reposicion') && { label: '🔁 Reposición', ruta: '/reposicion' },
    ve('postventa') && { label: '🧾 Post-venta', ruta: '/postventa' },
    ve('solicitudes') && { label: '📋 Solicitudes', ruta: '/solicitudes' },
    modoInicio(perfil) === 'gerencial' && { label: '📊 Panel gerencial', ruta: '/gerencial' },
  ].filter((a): a is { label: string; ruta: string; destacado?: boolean } => !!a)

  // La promo bancaria la ve quien cobra. `cupones` es el permiso de la pantalla del mostrador,
  // que es donde ya vive esta misma banda.
  const atiende = tieneFuncion(perfil, 'local') || ve('cupones')

  const nombre = comoLeLlamamos(perfil)

  return (
    <>
      <HeaderAcciones>
        {/* La frescura al lado del botón y no en un rincón: es la respuesta a "¿esto es de ahora?",
            que es la pregunta que decide si alguien vuelve a mirar esta pantalla mañana. */}
        {cargadoEn > 0 && <span style={{ fontSize: font.xs, color: color.mut2 }}>actualizado {fmtHace(Math.max(0, ahora - cargadoEn))}</span>}
        <Button variant="outline" onClick={() => void recargar(perfil, marca)} title="Volver a leer los avisos">
          Actualizar
        </Button>
      </HeaderAcciones>

      <Card style={{ marginBottom: space[4] }}>
        <div style={{ fontSize: font.xl, fontWeight: 700, color: color.ink }}>
          👋 Hola{nombre ? `, ${nombre}` : ''}!
        </div>
        <div style={{ fontSize: font.base, color: color.mut, marginTop: 2 }}>Hoy es {fechaLarga()}.</div>
      </Card>

      {/* Se dibuja sola sólo si hoy hay promo: un cartel que dice "hoy no hay" todos los días
          entrena a saltear la zona donde el día que sí hay va a aparecer el aviso. */}
      {atiende && <BandaPromoHoy />}

      {acciones.length > 0 && (
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginBottom: space[6] }}>
          {acciones.map((a) => (
            <Button
              key={a.ruta}
              size={a.destacado ? 'lg' : 'md'}
              variant={a.destacado ? 'solid' : 'outline'}
              tone={a.destacado ? 'brand' : 'neutral'}
              iconLeft={a.destacado ? '+' : undefined}
              onClick={() => router.push(a.ruta)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}

      {/* Los rutinarios de hoy, arriba de los avisos: son los que tienen hora de vencimiento —el
          día se termina y lo que no se tildó no se tilda más—, mientras que un aviso sigue ahí
          mañana. Desaparece entero cuando no falta nada, igual que la banda de la promo, y sólo
          muestra lo que falta: en Inicio, lo ya tildado sería una lista de cosas para no hacer.
          El número sale de `contarSinTildar`, la misma función que alimenta el badge del sidebar y
          la pestaña Hoy de la Agenda — contar distinto acá marcaría algo que ninguna pantalla
          muestra, que es el mismo agujero que esta pantalla vino a cerrar con los avisos. */}
      {/* Lo que hay que saber del día, arriba de lo que hay que hacer: "hoy no hay envíos" cambia
          cómo se hace todo lo demás, así que enterarse después de haber empezado no sirve. No tiene
          tilde ni número —un aviso no se puede apagar—, y por eso tampoco enciende el badge. */}
      {avisosDeHoy.length > 0 && (
        <section style={{ marginBottom: space[6] }}>
          <h2 style={{ fontSize: font.lg, fontWeight: 700, color: color.ink, marginBottom: space[3] }}>
            📣 Para tener en cuenta hoy
          </h2>
          <AvisosHoy fecha={hoy} />
        </section>
      )}

      {faltanHoy > 0 && (
        <section style={{ marginBottom: space[6] }}>
          <h2 style={{ fontSize: font.lg, fontWeight: 700, color: color.ink, marginBottom: space[3] }}>
            ☑ Para hoy<span style={{ color: color.mut, fontWeight: 600 }}> ({faltanHoy})</span>
          </h2>
          <PendientesHoy fecha={hoy} soloPendientes />
        </section>
      )}

      {grupos === null ? (
        <Esqueleto forma="tabla" filas={4} />
      ) : grupos.length === 0 ? (
        // El vacío AFIRMA. "No hay datos" deja la duda de si falló algo; "estás al día" cierra la
        // pregunta, que es justamente lo que uno viene a buscar a esta pantalla. Y dice QUÉ se
        // miró: a quien tiene sector, el suyo; a quien coordina, no —"tu sector" no significa nada
        // para Marketing o Dirección, y una afirmación que no aplica se lee como un error.
        <EmptyState
          icon="✅"
          title="Estás al día"
          hint={origenesDe(perfil).length ? 'No hay nada esperando trabajo en tu sector.' : 'No hay nada esperándote.'}
          dashed
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[5] }}>
          {grupos.map((g) => (
            <section key={g.tipo}>
              <h2 style={{ fontSize: font.lg, fontWeight: 700, color: color.ink, marginBottom: space[3], display: 'flex', alignItems: 'center', gap: space[2] }}>
                {g.label}
                <span style={{ fontSize: font.xs, fontWeight: 700, color: toneTokens[g.tono].fg, background: toneTokens[g.tono].bg, borderRadius: 6, padding: '1px 7px' }}>
                  {g.avisos.length}
                </span>
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {g.avisos.map((a) => (
                  <Card
                    key={a.id}
                    interactive
                    padding={3}
                    onClick={() => ir(a)}
                    style={{ cursor: 'pointer', display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}
                  >
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <MarcaChip marca={a.linea} />
                        {a.ts > corte && (
                          <span style={{ fontSize: font.xs, fontWeight: 700, color: '#fff', background: color.warning, borderRadius: 6, padding: '1px 7px' }}>NUEVO</span>
                        )}
                        <span style={{ fontWeight: 600, color: color.ink }}>{a.titulo}</span>
                      </div>
                      <div style={{ fontSize: font.sm, color: color.mut2, marginTop: 3 }}>
                        {a.detalle}
                        {a.ts > 0 && ` · ${horaLabel(a.ts, '')}`}
                        {diasDe(a.ts) >= DIAS_TRABADA && (
                          <span style={{ color: color.dangerInk, fontWeight: 600 }}> · trabado hace {diasDe(a.ts)} días</span>
                        )}
                      </div>
                    </div>
                    <span aria-hidden style={{ color: color.mut2, fontSize: font.lg }}>
                      ›
                    </span>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Lo que viene, entre lo que te espera y las novedades: es contexto, no tarea. Se dibuja
          sola sólo si hay algo en la ventana. */}
      <LoQueViene />

      {ultimas.length > 0 && (
        <section style={{ marginTop: space[6] }}>
          <h2 style={{ fontSize: font.lg, fontWeight: 700, color: color.ink, marginBottom: space[3] }}>📣 Últimas novedades</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ultimas.map(({ novedad, nueva }) => (
              <Card
                key={novedad.id}
                interactive
                padding={3}
                // Lleva a Novedades y NO marca leída acá: el "leído" de novedades es del servidor y
                // por usuario, y se gana entrando a leerla. Marcarlo de refilón vaciaría el badge
                // sin que nadie haya leído nada, que es la única forma de romperlo.
                onClick={() => router.push('/novedades')}
                style={{ cursor: 'pointer', display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}
              >
                <div style={{ flex: 1, minWidth: 180, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {nueva && (
                    <span style={{ fontSize: font.xs, fontWeight: 700, color: '#fff', background: color.brandSolid, borderRadius: 6, padding: '1px 7px' }}>NUEVA</span>
                  )}
                  <span style={{ fontWeight: nueva ? 600 : 400, color: nueva ? color.ink : color.mut }}>{novedad.titulo}</span>
                </div>
                <span aria-hidden style={{ color: color.mut2, fontSize: font.lg }}>
                  ›
                </span>
              </Card>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

/**
 * A partir de cuántos días un pendiente abierto deja de ser "de esta semana" y pasa a ser un
 * problema. Una solicitud con venta creada en la que nadie tildó "retirado" NO se va nunca del
 * Inicio, así que sin esto se mezcla con lo de hoy y nadie la ve envejecer.
 */
const DIAS_TRABADA = 7
const diasDe = (ts: number) => (ts ? Math.floor((Date.now() - ts) / 86400000) : 0)
