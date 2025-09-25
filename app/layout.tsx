import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'RealmKit CRM',
  description: 'Complete AI-optimized CRM platform for modern sales teams',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}