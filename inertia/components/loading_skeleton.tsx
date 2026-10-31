export default function LoadingSkeleton({
  label,
  count = 3,
  cards = false,
}: {
  label: string
  count?: number
  cards?: boolean
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="loading-skeleton">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className={cards ? 'skeleton-grid' : 'skeleton-rows'}>
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="skeleton-card">
            {cards && <div className="skeleton-block skeleton-image" />}
            <div className="skeleton-block skeleton-title" />
            <div className="skeleton-block skeleton-line" />
            <div className="skeleton-block skeleton-short" />
          </div>
        ))}
      </div>
    </div>
  )
}
