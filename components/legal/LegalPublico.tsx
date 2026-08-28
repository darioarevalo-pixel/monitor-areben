'use client'

/**
 * Las tres páginas legales públicas del monitor: privacidad, eliminación de datos y condiciones.
 *
 * Existen porque Meta las exige para sacar la app de Meta («Areben Monitor», `1493711852519633`) del
 * modo desarrollo, y **una app en modo desarrollo no puede CREAR anuncios** — que es lo que frena
 * duplicar conjuntos con avisos y la tanda del creativo. Los tres campos que Meta marca como
 * faltantes son ícono, categoría y URL de política de privacidad; además tenía cargadas
 * `https://www.facebook.com/` como condiciones y como eliminación de datos, que son placeholders y
 * los revisores los rechazan.
 *
 * Viven dentro del catch-all (`app/[[...seccion]]/page.tsx`, key `legal`) y NO como rutas propias de
 * Next, por la misma razón que `ReclamoPublico` y `CanjePortal`: cada ruta nueva es una función
 * serverless más y el proyecto está en el tope del plan Hobby (pasarse frena TODOS los deploys en
 * silencio). Salen antes del gate de login a propósito: un revisor de Meta las tiene que poder abrir
 * sin cuenta, y una política de privacidad detrás de un login no es una política de privacidad.
 *
 * 🔑 **El contenido describe lo que el monitor hace de verdad, no un texto genérico.** Se verificó
 * contra las tablas (`sql/migrate-meta-*.sql`): de Meta se persisten identificadores de objetos
 * publicitarios propios y quién accionó — las métricas y los creativos se leen en vivo y no se
 * guardan. Decir de más acá es prometerle a un revisor algo que el código no hace.
 */

import Link from 'next/link'

const ACTUALIZADO = '7 de agosto de 2026'
const CONTACTO = 'brunoarevalo@arebensrl.com'
const RAZON_SOCIAL = 'Areben Comercial S.R.L.'
const DOMICILIO = 'Pje. Hutchinson 3869, Argentina'

type Pagina = 'privacidad' | 'datos' | 'terminos'

const TITULOS: Record<Pagina, string> = {
  privacidad: 'Política de privacidad',
  datos: 'Eliminación de datos de usuario',
  terminos: 'Condiciones del servicio',
}

const esPagina = (v: string | null): v is Pagina =>
  v === 'privacidad' || v === 'datos' || v === 'terminos'

export function LegalPublico({ pagina }: { pagina: string | null }) {
  const key: Pagina = esPagina(pagina) ? pagina : 'privacidad'

  return (
    <div style={S.fondo}>
      <div style={S.hoja}>
        <header style={S.encabezado}>
          <div style={S.marca}>Monitor · {RAZON_SOCIAL}</div>
          <h1 style={S.titulo}>{TITULOS[key]}</h1>
          <div style={S.fecha}>Última actualización: {ACTUALIZADO}</div>
        </header>

        {key === 'privacidad' && <Privacidad />}
        {key === 'datos' && <Datos />}
        {key === 'terminos' && <Terminos />}

        <nav style={S.pie}>
          {(['privacidad', 'datos', 'terminos'] as Pagina[])
            .filter((k) => k !== key)
            .map((k) => (
              <Link key={k} href={`/legal/${k}`} style={S.link}>
                {TITULOS[k]}
              </Link>
            ))}
        </nav>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────── Privacidad */

function Privacidad() {
  return (
    <>
      <P>
        El Monitor es una <b>herramienta interna de gestión</b> de {RAZON_SOCIAL}, usada
        exclusivamente por personal autorizado de la empresa para administrar sus propias marcas
        (BDI, Zattia y Stunned). <b>No es un producto abierto al público</b>, no se ofrece a
        terceros y no tiene registro de usuarios: las cuentas las crea la empresa.
      </P>

      <H>Quién es el responsable</H>
      <P>
        {RAZON_SOCIAL}, {DOMICILIO}. Consultas sobre esta política o sobre los datos tratados:{' '}
        <a href={`mailto:${CONTACTO}`} style={S.link}>
          {CONTACTO}
        </a>
        .
      </P>

      <H>Qué datos recibimos de Meta y para qué</H>
      <P>
        El Monitor se conecta a la Marketing API de Meta con un usuario del sistema propio, para leer
        y administrar <b>únicamente las cuentas publicitarias de la empresa</b>. Con esa conexión
        accedemos a:
      </P>
      <Ul>
        <li>
          <b>Métricas de rendimiento</b> de nuestras propias campañas, conjuntos de anuncios y
          anuncios (inversión, impresiones, clics, compras atribuidas).
        </li>
        <li>
          <b>Configuración y contenido de nuestros propios anuncios</b>: nombres, objetivos, estado,
          presupuesto e imágenes y textos de los creativos.
        </li>
        <li>
          <b>La lista de páginas de Facebook</b> que administra la empresa, para saber desde cuál
          sale cada anuncio.
        </li>
      </Ul>
      <P>
        La finalidad es una sola: <b>medir y administrar la publicidad de la propia empresa</b> —
        entender en qué etapa del embudo está cada campaña, detectar huecos de contenido y pausar,
        reactivar, renombrar, ajustar presupuestos o duplicar campañas sin salir de la herramienta.
      </P>
      <Aviso>
        No accedemos a datos personales de usuarios de Facebook o Instagram. Las métricas que leemos
        son agregadas y corresponden a cuentas publicitarias de nuestra propiedad. El Monitor no
        construye públicos a partir de datos personales de terceros ni los combina con ninguna otra
        fuente.
      </Aviso>

      <H>Qué guardamos y qué no</H>
      <P>
        De la información de Meta, el Monitor <b>almacena solamente</b>:
      </P>
      <Ul>
        <li>
          <b>Identificadores y descripción de nuestros propios objetos publicitarios</b>: el id de la
          campaña, el id de la cuenta, su nombre y su objetivo. Sirven para atribuir cada campaña a
          la marca correspondiente y para detectar si la clasificación quedó vieja.
        </li>
        <li>
          <b>Un registro de auditoría de cada cambio</b> hecho desde la herramienta: qué se pidió,
          cómo quedó, cuándo y <b>qué persona del equipo lo hizo</b> (su nombre).
        </li>
        <li>
          <b>Notas internas de trabajo</b> (ideas de contenido y clasificación de etapas) escritas
          por el equipo. No provienen de Meta.
        </li>
      </Ul>
      <P>
        Las <b>métricas de rendimiento y los creativos no se almacenan en nuestros servidores</b>: se
        consultan a Meta en el momento en que alguien abre la pantalla y quedan, como mucho, en la
        memoria temporal del navegador de esa persona.
      </P>

      <H>Datos de las personas que usan el Monitor</H>
      <P>
        El acceso es con cuenta de Google de la empresa. Guardamos el nombre, el correo y los
        permisos asignados a cada persona, y el registro de las acciones que realiza sobre la
        publicidad. Es lo mínimo para saber quién puede hacer qué y quién hizo cada cambio.
      </P>

      <H>Con quién se comparte</H>
      <P>
        <b>Con nadie.</b> No vendemos, cedemos ni transferimos información a terceros, y no hacemos
        publicidad con datos de otras empresas. Los datos se alojan en los proveedores de
        infraestructura que operan el servicio (Vercel para la aplicación y Supabase para la base de
        datos), que actúan únicamente como prestadores por cuenta nuestra.
      </P>

      <H>Cuánto tiempo se conservan</H>
      <P>
        Mientras la herramienta esté en uso y sean necesarios para la gestión. El registro de
        auditoría de los cambios sobre la publicidad se conserva de forma permanente, porque su razón
        de ser es poder reconstruir después qué se modificó y quién lo hizo. Se elimina a pedido,
        según lo indicado en{' '}
        <Link href="/legal/datos" style={S.link}>
          Eliminación de datos
        </Link>
        .
      </P>

      <H>Seguridad</H>
      <P>
        El acceso está restringido por cuenta y por permisos, se sirve siempre sobre conexión cifrada
        y las credenciales de la API de Meta se guardan como variables de entorno del servidor: nunca
        se envían al navegador ni quedan en el código.
      </P>

      <H>Cambios en esta política</H>
      <P>
        Si cambiamos qué datos tratamos o para qué, actualizamos esta página y la fecha del
        encabezado.
      </P>
    </>
  )
}

/* ──────────────────────────────────────────────────────────── Eliminación de datos */

function Datos() {
  return (
    <>
      <P>
        El Monitor es una herramienta interna de {RAZON_SOCIAL} y <b>no tiene usuarios del público
        general</b>: las cuentas las crea la empresa para su propio personal, y de Meta sólo recibe
        información de las cuentas publicitarias de la propia empresa. Aun así, cualquier persona
        puede pedir la eliminación de los datos que le correspondan.
      </P>

      <H>Cómo pedir la eliminación</H>
      <P>
        Escribí a{' '}
        <a href={`mailto:${CONTACTO}`} style={S.link}>
          {CONTACTO}
        </a>{' '}
        con el asunto <b>«Eliminación de datos»</b>, indicando:
      </P>
      <Ul>
        <li>el nombre y el correo electrónico con el que se accedió al Monitor, y</li>
        <li>qué información querés que se elimine (o «toda»).</li>
      </Ul>

      <H>Qué hacemos con el pedido</H>
      <Ul>
        <li>
          <b>Confirmamos la recepción dentro de los 5 días hábiles</b> y completamos la eliminación{' '}
          <b>dentro de los 30 días corridos</b>.
        </li>
        <li>
          Se eliminan la cuenta de acceso, sus permisos y las notas internas escritas por esa
          persona.
        </li>
        <li>
          Te confirmamos por el mismo correo cuando está hecho, y qué se eliminó.
        </li>
      </Ul>

      <H>Qué no se puede eliminar, y por qué</H>
      <P>
        El <b>registro de auditoría</b> de los cambios hechos sobre la publicidad se conserva: existe
        justamente para poder reconstruir qué se modificó en las campañas y quién lo hizo, y eliminarlo
        anularía su única función. A pedido, <b>anonimizamos el nombre de la persona</b> en esas
        filas, de modo que quede el hecho pero no quién lo hizo.
      </P>

      <H>Datos de Meta</H>
      <P>
        Los datos que el Monitor obtiene de Meta corresponden a las cuentas publicitarias de la
        empresa. Para revocar el acceso de la aplicación a esas cuentas, se saca el permiso
        desde el Administrador Comercial de Meta; a partir de ese momento el Monitor deja de poder
        leerlas. Los identificadores de campañas guardados localmente se eliminan a pedido por la vía
        indicada arriba.
      </P>
    </>
  )
}

/* ─────────────────────────────────────────────────────────────────── Condiciones */

function Terminos() {
  return (
    <>
      <H>Qué es este servicio</H>
      <P>
        El Monitor es un sistema <b>interno y privado</b> de {RAZON_SOCIAL}, {DOMICILIO}. Sirve para
        administrar las operaciones y la publicidad de las marcas de la empresa. <b>No se ofrece,
        vende ni licencia a terceros</b> y no admite registro público.
      </P>

      <H>Quién puede usarlo</H>
      <P>
        Únicamente las personas a las que la empresa les haya creado una cuenta y asignado permisos.
        El acceso es personal e intransferible: las credenciales no se comparten. La empresa puede
        modificar o revocar el acceso en cualquier momento.
      </P>

      <H>Uso permitido</H>
      <Ul>
        <li>
          La información del Monitor es <b>confidencial</b> y se usa sólo para las tareas asignadas.
          No se difunde ni se usa para fines ajenos a la empresa.
        </li>
        <li>
          Las acciones sobre la publicidad (pausar, reactivar, cambiar presupuestos, renombrar,
          duplicar) <b>quedan registradas con el nombre de quien las hace</b> y afectan campañas
          reales con inversión real.
        </li>
        <li>
          No está permitido intentar acceder a secciones o marcas para las que no se tenga permiso,
          ni extraer datos de forma masiva o automatizada.
        </li>
      </Ul>

      <H>Disponibilidad</H>
      <P>
        El servicio se presta «tal como está», sin garantía de disponibilidad ininterrumpida. Depende
        de servicios de terceros (Meta, Tiendanube, Gestión Nube y los proveedores de
        infraestructura) y puede interrumpirse por causas ajenas a la empresa.
      </P>

      <H>Datos personales</H>
      <P>
        El tratamiento de datos está descripto en la{' '}
        <Link href="/legal/privacidad" style={S.link}>
          Política de privacidad
        </Link>
        .
      </P>

      <H>Contacto</H>
      <P>
        <a href={`mailto:${CONTACTO}`} style={S.link}>
          {CONTACTO}
        </a>
      </P>
    </>
  )
}

/* ───────────────────────────────────────────────────────────────── Piezas y estilo */

const P = ({ children }: { children: React.ReactNode }) => <p style={S.p}>{children}</p>
const H = ({ children }: { children: React.ReactNode }) => <h2 style={S.h2}>{children}</h2>
const Ul = ({ children }: { children: React.ReactNode }) => <ul style={S.ul}>{children}</ul>
const Aviso = ({ children }: { children: React.ReactNode }) => <div style={S.aviso}>{children}</div>

const S: Record<string, React.CSSProperties> = {
  fondo: {
    minHeight: '100vh',
    background: 'var(--mo-canvas)',
    padding: '32px 16px 64px',
  },
  hoja: {
    maxWidth: 760,
    margin: '0 auto',
    background: 'var(--mo-surface)',
    border: '1px solid var(--mo-line)',
    borderRadius: 12,
    padding: '32px clamp(20px, 5vw, 44px) 36px',
    color: 'var(--mo-ink2)',
    fontSize: 15,
    lineHeight: 1.65,
  },
  encabezado: { borderBottom: '1px solid var(--mo-line)', paddingBottom: 20, marginBottom: 8 },
  marca: {
    fontSize: 12,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--mo-brand)',
    fontWeight: 600,
  },
  titulo: { fontSize: 27, lineHeight: 1.25, margin: '8px 0 6px', color: 'var(--mo-ink)' },
  fecha: { fontSize: 13, color: 'var(--mo-mut)' },
  h2: { fontSize: 17, margin: '28px 0 8px', color: 'var(--mo-ink)' },
  p: { margin: '0 0 12px' },
  ul: { margin: '0 0 12px', paddingLeft: 22 },
  aviso: {
    background: 'var(--mo-brand-bg)',
    border: '1px solid var(--mo-brand-border)',
    borderRadius: 8,
    padding: '12px 14px',
    margin: '4px 0 12px',
  },
  pie: {
    borderTop: '1px solid var(--mo-line)',
    marginTop: 32,
    paddingTop: 16,
    display: 'flex',
    gap: 20,
    flexWrap: 'wrap',
    fontSize: 14,
  },
  link: { color: 'var(--mo-brand)', textDecoration: 'underline' },
}
