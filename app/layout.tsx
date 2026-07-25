import { SesionProvider } from '@/components/SesionProvider'
// Orden importante: tokens (las vars) → kit (los primitivos, que las usan) → globals
// (el chrome del shell y lo que queda del CSS legacy, que se va vaciando por tanda).
import './tokens.css'
import '@/components/ui/kit.css'
import './globals.css'

export const metadata = {
  title: 'Monitor AREBEN SRL',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <SesionProvider>{children}</SesionProvider>
      </body>
    </html>
  )
}
