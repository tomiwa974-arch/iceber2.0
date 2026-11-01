export type DailySpecial = {
  id: string
  title: string
  caption: string
  image: string
  price: number
  startsAt: number
  endsAt: number
  durationDays: number
}
export const DAY_MS = 24 * 60 * 60 * 1000
export const SPECIAL_CAPACITY = 3
export function specialStatus(post: DailySpecial, now: number) {
  return now < post.startsAt ? 'Queued' : now < post.endsAt ? 'Live' : 'Expired'
}
export function activeSpecial(posts: DailySpecial[], now: number) {
  return posts.find((post) => post.startsAt <= now && now < post.endsAt)
}
export function activeSpecials(posts: DailySpecial[], now: number) {
  return posts
    .filter((post) => post.startsAt <= now && now < post.endsAt)
    .slice(0, SPECIAL_CAPACITY)
}
export function nextSpecialStart(posts: DailySpecial[], now: number) {
  const slots = Array<number>(SPECIAL_CAPACITY).fill(now)
  for (const post of posts
    .filter((entry) => entry.endsAt > now)
    .sort((a, b) => a.startsAt - b.startsAt)) {
    slots.sort((a, b) => a - b)
    slots[0] = Math.max(slots[0], post.endsAt)
  }
  return Math.min(...slots)
}
export function appendSpecial(
  posts: DailySpecial[],
  post: Omit<DailySpecial, 'startsAt' | 'endsAt'>,
  now: number
): DailySpecial[] {
  if (
    !post.title.trim() ||
    !Number.isFinite(post.durationDays) ||
    !Number.isInteger(post.durationDays) ||
    post.durationDays < 1 ||
    !Number.isFinite(post.price) ||
    post.price < 0
  )
    throw new Error('Enter a title, valid price and a whole number of days.')
  const startsAt = nextSpecialStart(posts, now)
  const endsAt = startsAt + post.durationDays * DAY_MS
  if (!Number.isSafeInteger(endsAt) || endsAt > 8640000000000000)
    throw new Error('Duration is too large.')
  return [...posts, { ...post, startsAt, endsAt }]
}
// Reflow only future posts. Elapsed time on the live post is never restarted.
export function reflowSpecials(posts: DailySpecial[], queued: DailySpecial[], now: number) {
  const historyAndLive = posts.filter((post) => post.startsAt <= now)
  const slots = Array<number>(SPECIAL_CAPACITY).fill(now)
  for (const post of historyAndLive.filter((entry) => entry.endsAt > now)) {
    slots.sort((a, b) => a - b)
    slots[0] = post.endsAt
  }
  return [
    ...historyAndLive,
    ...queued.map((post) => {
      slots.sort((a, b) => a - b)
      const startsAt = slots[0]
      const endsAt = startsAt + post.durationDays * DAY_MS
      slots[0] = endsAt
      return { ...post, startsAt, endsAt }
    }),
  ]
}
export function removeSpecial(posts: DailySpecial[], id: string, now: number) {
  const target = posts.find((post) => post.id === id)
  if (!target) return posts
  const remaining = posts.filter((post) => post.id !== id)
  return target.endsAt <= now
    ? remaining
    : reflowSpecials(
        remaining,
        remaining.filter((post) => post.startsAt > now),
        now
      )
}
export function moveSpecial(posts: DailySpecial[], id: string, direction: -1 | 1, now: number) {
  const queued = posts.filter((post) => post.startsAt > now)
  const index = queued.findIndex((post) => post.id === id)
  const next = index + direction
  if (index < 0 || next < 0 || next >= queued.length) return posts
  ;[queued[index], queued[next]] = [queued[next], queued[index]]
  return reflowSpecials(posts, queued, now)
}
export const specialDate = (timestamp: number) =>
  new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp) + ' WAT'
