interface Props {
  status: string
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, size = 'md' }: Props) {
  const normalized = status.replace(/_/g, '_')
  return (
    <span
      className={`badge badge--${normalized}`}
      style={size === 'sm' ? { fontSize: '11px', padding: '1px 6px' } : undefined}
    >
      {status.replace(/_/g, ' ')}
    </span>
  )
}
