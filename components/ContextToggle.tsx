'use client'

interface Props {
  enabled: boolean
  msgCount: number
  onToggle: () => void
  theme: 'dark' | 'light'
}

export default function ContextToggle({ enabled, msgCount, onToggle, theme }: Props) {
  const isDark = theme === 'dark'

  return (
    <button
      onClick={onToggle}
      className={[
        'ctx-toggle',
        isDark ? 'ctx-toggle--dark' : 'ctx-toggle--light',
        enabled ? '' : 'ctx-toggle--off'
      ].join(' ')}
    >
      <span className="ctx-dot" />
      <span>Shared context</span>
      <span className="ctx-status">{enabled ? 'ON' : 'OFF'}</span>
      {msgCount > 0 && (
        <span className="ctx-count">{msgCount} msg</span>
      )}
    </button>
  )
}
