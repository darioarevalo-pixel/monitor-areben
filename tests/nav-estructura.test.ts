import { describe, it, expect } from 'vitest'
import { keysDeCat, itemsDeCat, iconoDe, NAV_CATS, PERM_CAT, todasLasKeys, KEYS_SIN_PERMISO } from '@/lib/nav'
import { hayIcono } from '@/components/ui/Icono'

/**
 * Invariantes de la estructura del menú, ahora que `lib/nav.datos.ts` se edita a mano
 * (antes se generaba desde el index.html del legacy y el `--check` del generador hacía
 * de red).
 *
 * Estos tests son esa red: al mover una sección de grupo o crear un subgrupo, lo que
 * se rompe tiene que romperse acá y no en la cara del equipo — una key duplicada en
 * dos grupos, una sección sin área, o un subgrupo que deja una sección fuera del menú.
 */
describe('estructura del nav', () => {
  it('cada sección tiene un área y el área es un grupo real del nav', () => {
    const grupos = new Set(NAV_CATS.map((c) => c.id))
    for (const p of PERM_CAT) {
      expect(p.area, `la sección '${p.key}' no tiene área`).toBeTruthy()
      expect(grupos.has(p.area), `el área '${p.area}' de '${p.key}' no es un grupo del nav`).toBe(true)
    }
  })

  it('el área de una sección es uno de los grupos donde aparece en el menú', () => {
    // Una sección PUEDE colgar de varios sectores cuando es compartida — `solicitudes`
    // aparece en Local, Depósito, Marketing y Administración, con el rótulo de cada uno.
    // Lo que no puede es que su área no sea ninguno de esos lugares: el área es donde la
    // busca Config y de quién la hereda por función.
    const grupos = new Map<string, string[]>()
    for (const cat of NAV_CATS) {
      for (const key of keysDeCat(cat)) {
        grupos.set(key, [...(grupos.get(key) ?? []), cat.id])
      }
    }
    for (const [key, donde] of grupos) {
      const p = PERM_CAT.find((x) => x.key === key)
      if (!p) {
        expect(KEYS_SIN_PERMISO.has(key), `'${key}' está en el nav sin permiso ni excepción`).toBe(true)
        continue
      }
      expect(donde, `'${key}' cuelga de ${donde.join('/')} pero su área dice '${p.area}'`).toContain(p.area)
    }
  })

  it('una sección repetida en varios grupos tiene rótulo propio donde no es su área', () => {
    // Si `solicitudes` se llama igual en Marketing que en Administración, el sector no se
    // reconoce en el menú: por eso `NavCat.labels`. Se exige donde la sección es "prestada".
    const cuenta = NAV_CATS.flatMap(keysDeCat).reduce<Record<string, number>>((a, k) => ({ ...a, [k]: (a[k] || 0) + 1 }), {})
    for (const cat of NAV_CATS) {
      for (const key of keysDeCat(cat)) {
        const p = PERM_CAT.find((x) => x.key === key)
        if (!p || cuenta[key] < 2 || p.area === cat.id) continue
        expect(cat.labels?.[key], `'${key}' cuelga de '${cat.id}' sin rótulo propio`).toBeTruthy()
      }
    }
  })

  it('las keys del menú son keys válidas', () => {
    const validas = new Set(todasLasKeys())
    for (const key of NAV_CATS.flatMap(keysDeCat)) {
      expect(validas.has(key), `la key '${key}' del menú no existe`).toBe(true)
    }
  })

  it('keysDeCat incluye las de los subgrupos (si no, quedan fuera del menú)', () => {
    const cat = { id: 'x', label: 'X', keys: ['a'], grupos: [{ id: 'y', label: 'Y', keys: ['b', 'c'] }] }
    expect(keysDeCat(cat)).toEqual(['a', 'b', 'c'])
    expect(keysDeCat({ id: 'z', label: 'Z', keys: ['a'] })).toEqual(['a'])
  })

  it('keysDeCat incluye las entradas propias de la categoría (Meta no tiene keys sueltas)', () => {
    // Una categoría-módulo lista pantallas de UNA sección, así que `keys` está vacío y todo cuelga
    // de `items`. Si `keysDeCat` no las mirara, esa sección quedaría fuera del menú y —peor— fuera
    // de las tres redes de arriba, que recorren `keysDeCat`.
    const cat = { id: 'm', label: 'M', keys: [], items: [
      { ruta: '/m', label: 'Panel', key: 'meta-ads' },
      { ruta: '/m/x', label: 'Otra', key: 'meta-ads' },
    ] }
    expect(keysDeCat(cat)).toEqual(['meta-ads'])
  })

  it('las subáreas del menú apuntan a una sección real y se gatean con un permiso real', () => {
    // La ruta y el permiso pueden NO coincidir: "Tabla de talles" vive en `/tncat/descripciones`
    // (la pantalla es de Tienda Nube) pero se habilita con el permiso `gen-talles`, que es el
    // que el equipo ya tenía asignado. Lo que sí tiene que valer: las dos existen.
    const validas = new Set(todasLasKeys())
    for (const cat of NAV_CATS) {
      // `itemsDeCat` mira los dos niveles: las de la categoría y las de sus subgrupos. Recorrer
      // sólo `grupos[].items` dejaba a Meta sin cubrir sin que nada se pusiera en rojo.
      for (const it of itemsDeCat(cat)) {
        const destino = it.ruta.split('/')[1]
        expect(validas.has(destino), `'${it.label}' apunta a /${destino}, que no es una sección`).toBe(true)
        expect(validas.has(it.key), `'${it.label}' se gatea con '${it.key}', que no es una sección`).toBe(true)
        const subs = it.sub ? (Array.isArray(it.sub) ? it.sub : [it.sub]) : []
        for (const s of subs) {
          const existe = (PERM_CAT.find((p) => p.key === it.key)?.subs ?? []).some((x) => x.key === s)
          expect(existe, `'${it.label}' pide el sub-permiso '${it.key}.${s}', que no existe`).toBe(true)
        }
      }
    }
  })

  /**
   * Los emojis del menú (🏠 Inicio, 📊 Análisis…) se reemplazaron por íconos SVG. El
   * riesgo del cambio es que el ícono ya no viaja dentro del label: es un dato aparte, y
   * una sección nueva puede quedar sin él y ser la única del menú sin marca. Estos dos
   * tests lo impiden — que el nombre exista, y que no falte ninguno.
   */
  it('cada grupo y subgrupo del menú tiene un ícono, y el ícono existe', () => {
    const rotos: string[] = []
    for (const cat of NAV_CATS) {
      if (!hayIcono(cat.icono)) rotos.push(`grupo '${cat.label}' (icono: ${cat.icono ?? '—'})`)
      for (const g of cat.grupos ?? []) {
        if (!hayIcono(g.icono)) rotos.push(`subgrupo '${g.label}' (icono: ${g.icono ?? '—'})`)
      }
      for (const it of itemsDeCat(cat)) {
        if (!hayIcono(it.icono)) rotos.push(`entrada '${it.label}' (icono: ${it.icono ?? '—'})`)
      }
    }
    expect(rotos).toEqual([])
  })

  it('cada sección del menú tiene un ícono, y el ícono existe', () => {
    const rotos: string[] = []
    for (const cat of NAV_CATS) {
      for (const k of keysDeCat(cat)) {
        if (!hayIcono(iconoDe(k))) rotos.push(`sección '${k}' (icono: ${iconoDe(k) ?? '—'})`)
      }
    }
    expect(rotos).toEqual([])
  })
})
