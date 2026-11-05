'use client'

/**
 * Seguimiento de envíos (key `seguimiento-envios`, área Administración).
 * Primera entrega: sólo mira. ⛔ Le manda nada a nadie. Ver `docs/secciones/seguimiento-envios.md`.
 */

import { useCallback, useEffect, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import {
  Badge,
  Button,
  CopyButton,
  EmptyState,
  Notice,
  SectionCard,
  TableWrap,
  Tabs,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  space,
} from '@/components/ui'
import type { Marca } from '@/lib/nav.datos'
import { leerSeguimiento, linkDelPedido, type FilaSeguimiento, type Seguimiento } from '@/lib/seguimiento-envios/cliente'

type Solapa = 'retiro' | 'trabados' | 'volvieron'

const VACIO: Record<Solapa, string> = {
  retiro: 'No hay paquetes esperando en sucursal.',
  trabados: 'No hay paquetes trabados.',
  volvieron: 'No hay paquetes que hayan vuelto.',
}
const COLUMNA_DIAS: Record<Solapa, string> = { retiro: 'En sucursal hace', trabados: 'Sin movimiento', volvieron: 'Volvió hace' }

const horaDe = (iso: string) =>
  new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(iso))

function Pedido({ f }: { f: FilaSeguimiento }) {
  const link = linkDelPedido(f.tienda, f.id)
  const texto = `${f.tienda === 'stunned' ? 'Stunned ' : ''}#${f.numero}`
  return link ? (
    <a href={link} target="_blank" rel="noreferrer">
      {texto}
    </a>
  ) : (
    <>{texto}</>
  )
}

function Dias({ n }: { n: number }) {
  return <>{n === 0 ? 'Hoy' : n === 1 ? '1 día' : `${n} días`}</>
}

function useSeguimiento(marca: Marca) {
  const [datos, setDatos] = useState<{ marca: Marca; r: Seguimiento } | null>(null)
  const [recargando, setRecargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const recargar = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    let vivo = true
    void (async () => {
      setRecargando(true)
      setError(null)
      try {
        const r = await leerSeguimiento(marca)
        if (vivo) setDatos({ marca, r })
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer el seguimiento de envíos.')
      } finally {
        if (vivo) setRecargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, tick])

  // La respuesta viaja pegada a la marca: al cambiar de marca, la anterior ⛔ se muestra.
  return { r: datos && datos.marca === marca ? datos.r : null, recargando, error, recargar }
}

export function SeguimientoEnvios() {
  const { marca } = useSesion()
  const { r, recargando, error, recargar } = useSeguimiento(marca)
  const [solapa, setSolapa] = useState<Solapa>('retiro')
  const filas = r ? r[solapa] : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard
        title="Seguimiento de envíos"
        subtitle={
          r
            ? `Pedidos enviados por Correo Argentino desde el ${r.desde.split('-').reverse().join('/')}, leídos a las ${horaDe(r.leidoEn)}. Esta pantalla todavía no le avisa a nadie.`
            : 'Consultando Tienda Nube y el Correo, puede tardar unos segundos.'
        }
        actions={
          <Button size="sm" variant="outline" onClick={recargar} loading={recargando}>
            Actualizar
          </Button>
        }
      >
        <Tabs
          value={solapa}
          onChange={(k) => setSolapa(k as Solapa)}
          items={[
            { key: 'retiro', label: 'Esperando retiro', badge: r ? r.retiro.length : undefined },
            { key: 'trabados', label: 'Trabados', badge: r ? r.trabados.length : undefined },
            { key: 'volvieron', label: 'Volvieron', badge: r ? r.volvieron.length : undefined },
          ]}
        />
      </SectionCard>

      {error && <Notice tone="danger">{error}</Notice>}
      {r?.correoCaido && (
        <Notice tone="danger">
          El Correo no devolvió la historia de ningún paquete: pudo haber cambiado su página. Estas listas no sirven hasta
          revisarlo.
        </Notice>
      )}
      {r && !r.correoCaido && r.resumen.sinLeer.length > 0 && (
        <Notice tone="warning">
          El Correo no devolvió datos de {r.resumen.sinLeer.length} {r.resumen.sinLeer.length === 1 ? 'pedido' : 'pedidos'} y
          no {r.resumen.sinLeer.length === 1 ? 'aparece' : 'aparecen'} acá:{' '}
          {r.resumen.sinLeer.map((x) => `#${x.numero}`).join(', ')}.
        </Notice>
      )}
      {r && solapa === 'volvieron' && filas.length > 0 && (
        <Notice tone="warning">
          El Correo los da por entregados, pero después de retornar: según su historia volvieron a nosotros y no llegaron al
          cliente. Hay que confirmar que estén en el local o en el depósito.
        </Notice>
      )}

      {r && filas.length === 0 && !r.correoCaido && (
        <EmptyState title={VACIO[solapa]} />
      )}

      {r && filas.length > 0 && (
        <TableWrap>
          <THead>
            <Tr>
              <Th>Pedido</Th>
              <Th>Cliente</Th>
              <Th>Envío</Th>
              <Th>{solapa === 'retiro' ? 'Sucursal' : 'Último lugar'}</Th>
              {solapa === 'trabados' && <Th>Último estado</Th>}
              <Th align="right">{COLUMNA_DIAS[solapa]}</Th>
              {solapa === 'retiro' && <Th>Aviso</Th>}
              <Th>HC</Th>
              <Th>Seguimiento</Th>
            </Tr>
          </THead>
          <TBody>
            {filas.map((f) => (
              <Tr key={`${f.tienda}/${f.id}`}>
                <Td>
                  <Pedido f={f} />
                </Td>
                <Td wrap>{f.cliente || '—'}</Td>
                <Td>{f.envio}</Td>
                <Td wrap>
                  {f.planta}
                  {f.volvio && solapa !== 'volvieron' && (
                    <div>
                      <Badge tone="warning">Volvió: lo buscamos nosotros</Badge>
                    </div>
                  )}
                </Td>
                {solapa === 'trabados' && (
                  <Td wrap>
                    {f.motivo === 'robado' ? <Badge tone="danger">Robado según el Correo</Badge> : f.ultimo}
                  </Td>
                )}
                <Td align="right">
                  <Dias n={f.dias} />
                </Td>
                {solapa === 'retiro' && <Td>Sin aviso</Td>}
                <Td mono>{f.pieza || '—'}</Td>
                <Td mono>
                  {f.codigo} <CopyButton getText={() => f.codigo} label="Copiar" />
                </Td>
              </Tr>
            ))}
          </TBody>
        </TableWrap>
      )}
    </div>
  )
}
