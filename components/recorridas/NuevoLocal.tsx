'use client'

/**
 * **Cargar un local en la calle**: se pasó por la puerta de uno que no estaba en la lista.
 *
 * 🔑 **Corto a propósito**: nombre e Instagram, y lo demás opcional. Al guardar se abre directo la
 * pantalla del local para sacar las fotos y anotar los precios — eso es lo que se vino a hacer.
 *
 * ⚠️ **Un nombre repetido AVISA, ⛔ no bloquea**: dos locales pueden llamarse igual en galerías
 * distintas. Compara con `normalizarNombre`, el mismo criterio que la carga en tanda.
 */
import { useMemo, useState } from 'react'
import { Button, Field, Input, Modal, Notice, space } from '@/components/ui'
import { escribir } from '@/lib/prm/cliente'
import { normalizarNombre, nuevoId, usuarioDeInstagram } from '@/lib/prm/core'
import type { ProveedorLocal } from '@/lib/prm/tipos'

export function NuevoLocal({
  marca,
  existentes,
  onCerrar,
  onCreado,
}: {
  marca: string
  existentes: ProveedorLocal[]
  onCerrar: () => void
  onCreado: (id: string) => void
}) {
  const [nombre, setNombre] = useState('')
  const [instagram, setInstagram] = useState('')
  const [galeria, setGaleria] = useState('')
  const [direccion, setDireccion] = useState('')
  const [zona, setZona] = useState('Flores')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const repetido = useMemo(() => {
    const n = normalizarNombre(nombre)
    return n ? existentes.find((l) => normalizarNombre(l.nombre) === n) ?? null : null
  }, [nombre, existentes])

  async function guardar() {
    if (!nombre.trim()) return setError('Falta el nombre del local.')
    setGuardando(true)
    setError(null)
    const id = nuevoId('pl')
    try {
      await escribir(marca, 'local.crear', {
        local: {
          id,
          nombre: nombre.trim(),
          instagram: usuarioDeInstagram(instagram),
          galeria,
          direccion,
          zona,
          // Se cargó parado en la puerta: ya fuimos.
          estado: 'visitado',
        },
      })
      onCreado(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el local.')
      setGuardando(false)
    }
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo="Nuevo local">
      <div style={{ display: 'grid', gap: space[3] }}>
        <Field label="Nombre">
          <Input value={nombre} autoFocus onChange={(e) => setNombre(e.target.value)} style={{ fontSize: 16 }} />
        </Field>
        {repetido && (
          <Notice tone="warning">
            Ya hay un local «{repetido.nombre}»{repetido.galeria ? ` en ${repetido.galeria}` : ''}. Si es el mismo, abrilo
            desde la lista.
          </Notice>
        )}
        <Field label="Instagram">
          <Input
            value={instagram}
            placeholder="@usuario"
            autoCapitalize="none"
            autoCorrect="off"
            onChange={(e) => setInstagram(e.target.value)}
            style={{ fontSize: 16 }}
          />
        </Field>
        <Field label="Galería / local" hint="Opcional. Lo que sirve para volver a encontrarlo.">
          <Input value={galeria} placeholder="Galería Avellaneda, local 23" onChange={(e) => setGaleria(e.target.value)} style={{ fontSize: 16 }} />
        </Field>
        <Field label="Dirección" hint="Opcional. Con esto entra ordenado en la próxima recorrida.">
          <Input value={direccion} placeholder="Av. Avellaneda 3252" onChange={(e) => setDireccion(e.target.value)} style={{ fontSize: 16 }} />
        </Field>
        <Field label="Zona">
          <Input value={zona} onChange={(e) => setZona(e.target.value)} style={{ fontSize: 16 }} />
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button onClick={() => void guardar()} disabled={guardando} fullWidth size="lg">
          {guardando ? 'Guardando…' : 'Guardar y anotar productos'}
        </Button>
      </div>
    </Modal>
  )
}
