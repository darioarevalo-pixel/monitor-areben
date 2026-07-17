import { SesionProvider } from '@/components/SesionProvider'
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
