import { useEffect, useState } from 'react'
import type { DailySpecial } from './specials'
import { restaurantNow } from './restaurant_store'

export function useSpecialsClock(posts: DailySpecial[]) {
  const [now, setNow] = useState(restaurantNow)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const current = restaurantNow()
      setNow(current)
      const boundary = Math.min(
        ...posts.flatMap((post) => [post.startsAt, post.endsAt]).filter((time) => time > current)
      )
      timer = setTimeout(tick, Math.max(1, Math.min(60_000, boundary - current)))
    }
    const refresh = () => {
      clearTimeout(timer)
      tick()
    }
    tick()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [posts])
  return now
}
