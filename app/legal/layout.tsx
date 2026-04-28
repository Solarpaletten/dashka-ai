import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Solar Legal Style',
  description: 'Multi-role Lithuanian legal document workflow'
}

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sl-layout">
      {children}
    </div>
  )
}
