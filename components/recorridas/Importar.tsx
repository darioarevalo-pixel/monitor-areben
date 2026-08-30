'use client'

/**
 * **Cargar locales en tanda**: pegar la nota de texto o subir el CSV de lugares guardados de Google
 * Maps. Es la mitad que decide si el módulo sirve: uno que arranca vacío y hay que llenar tipeando
 * 60 veces no lo llena nadie, y sin padrón no hay recorrida.
 *
 * 🔴 **Lo entendido se muestra SIEMPRE al lado de la línea cruda, y lo que no se entendió se lista
 * aparte con su motivo.** Un importador que dice "listo, 51" sobre 60 renglones se descubre parado
 * en una galería que no está en la lista. El parseo vive en `lib/prm/core.ts` y está atado por test
 * a que ninguna línea se pierda.
 */
import { useMemo, useState } from 'react'
import { Button, Field, Input, Modal, Notice, TBody, TableWrap, THead, Td, Th, Tr, color, space } from '@/components/ui'
import { escribir } from '@/lib/prm/cliente'
import { marcarRepetidos, nuevoId, parsearCsvMaps, parsearNota } from '@/lib/prm/core'
import type { Candidato } from '@/lib/prm/tipos'

type Props = {
  marca: string
  existentes: { id: string; nombre: string }[]
  onCerrar: () => void
  onGuardado: () => void
}

export function Importar({ marca, existentes, onCerrar, onGuardado }: Props) {
  const [texto, setTexto] = useState('')
  const [esCsv, setEsCsv] = useState(false)
  const [zona, setZona] = useState('Flores')
  const [saltear, setSaltear] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parseo = useMemo(() => (esCsv ? parsearCsvMaps(texto) : parsearNota(texto)), [texto, esCsv])
  const marcados = useMemo(() => marcarRepetidos(parseo.candidatos, existentes), [parseo, existentes])
  const aGuardar = useMemo(() => marcados.filter((c) => !(saltear && c.yaExiste)), [marcados, saltear])

  async function subirArchivo(archivo: File | null) {
    if (!archivo) return
    setEsCsv(true)
    setTexto(await archivo.text())
  }

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      const locales = aGuardar.map((c: Candidato & { yaExiste: string | null }) => ({
        id: nuevoId('pl'),
        nombre: c.nombre,
        galeria: c.galeria,
        direccion: c.direccion,
        nota: c.nota,
        lat: c.lat,
        lng: c.lng,
        zona: zona.trim() || null,
      }))
      await escribir(marca, 'local.importar', { locales })
      onGuardado()
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron guardar los locales.')
    } finally {
      setGuardando(false)
    }
  }

  const repetidos = marcados.filter((c) => c.yaExiste).length

  return (
    <Modal abierto onCerrar={onCerrar} titulo="Cargar locales en tanda" ancho="ancho">
      <div style={{ display: 'grid', gap: space[4] }}>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Button variant={esCsv ? 'ghost' : 'solid'} onClick={() => setEsCsv(false)}>
            Pegar una nota
          </Button>
          <label>
            <Button variant={esCsv ? 'solid' : 'ghost'} onClick={() => setEsCsv(true)}>
              Subir el CSV de Google Maps
            </Button>
            <input
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => void subirArchivo(e.target.files?.[0] ?? null)}
            />
          </label>
          <Field label="Zona">
            <Input value={zona} onChange={(e) => setZona(e.target.value)} placeholder="Flores" />
          </Field>
        </div>

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={7}
          placeholder={
            esCsv
              ? 'Title,Note,URL\n"Los Tres Hermanos",jeans,"https://maps.google.com/?q=-34.6295,-58.4635"'
              : 'Los Tres Hermanos - Av. Avellaneda 3252 - jeans, buen precio\nPunto Once — Nazca 1200'
          }
          style={{
            width: '100%',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 12,
            padding: space[2],
            border: `1px solid ${color.line}`,
            borderRadius: 8,
          }}
        />

        {parseo.sinEntender.length > 0 && (
          <Notice tone="warning">
            <strong>{parseo.sinEntender.length} línea(s) que no se entendieron</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {parseo.sinEntender.map((s, i) => (
                <li key={i} style={{ fontSize: 12 }}>
                  <code>{s.linea}</code> — {s.motivo}
                </li>
              ))}
            </ul>
          </Notice>
        )}

        {marcados.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: space[4], alignItems: 'center', fontSize: 13 }}>
              <strong>{marcados.length} local(es) entendidos</strong>
              {repetidos > 0 && (
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: color.mut2 }}>
                  <input type="checkbox" checked={saltear} onChange={(e) => setSaltear(e.target.checked)} />
                  Saltear los {repetidos} que ya están
                </label>
              )}
            </div>
            <TableWrap>
              <THead>
                <Tr>
                  <Th>Nombre</Th>
                  <Th>Galería</Th>
                  <Th>Dirección</Th>
                  <Th>Nota</Th>
                  <Th>Punto</Th>
                  <Th>La línea, tal cual</Th>
                </Tr>
              </THead>
              <TBody>
                {marcados.map((c, i) => (
                  <Tr key={i} style={c.yaExiste && saltear ? { opacity: 0.45 } : undefined}>
                    <Td>
                      {c.nombre}
                      {c.yaExiste && (
                        <span style={{ color: color.warningInk, fontSize: 11, marginLeft: 6 }}>ya está</span>
                      )}
                    </Td>
                    <Td>{c.galeria ?? '—'}</Td>
                    <Td>{c.direccion ?? '—'}</Td>
                    <Td>{c.nota ?? '—'}</Td>
                    <Td>{c.lat != null ? '✓' : '—'}</Td>
                    <Td wrap>
                      <span style={{ color: color.mut2, fontSize: 11 }}>{c.linea}</span>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </TableWrap>
          </>
        )}

        {error && <Notice tone="danger">{error}</Notice>}

        <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={!aGuardar.length || guardando}>
            {guardando ? 'Guardando…' : `Guardar ${aGuardar.length} local(es)`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
