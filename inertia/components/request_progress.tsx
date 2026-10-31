import { useEffect, useState } from 'react'
import { useRequestActivity } from '~/lib/request_activity'

export default function RequestProgress() {
  const { pending, mutations } = useRequestActivity()
  const [visible, setVisible] = useState(false)
  const active = pending > 0
  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }
    const timer = window.setTimeout(() => setVisible(true), 300)
    return () => window.clearTimeout(timer)
  }, [active])
  if (!pending || !visible) return null
  return (
    <div className="request-progress" role="status">
      <span className="action-spinner" aria-hidden="true" />
      {mutations ? 'Processing request...' : 'Updating data...'}
    </div>
  )
}
