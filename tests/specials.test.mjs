import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../shared/daily_specials.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText
const { DAY_MS, appendSpecial, activeSpecials, removeSpecial, moveSpecial } = await import(
  'data:text/javascript;base64,' + Buffer.from(output).toString('base64')
)
const now = Date.parse('2026-11-01T12:00:00Z')
const draft = (id, durationDays = 1) => ({
  id,
  title: id,
  caption: 'Special',
  image: '',
  price: 15000,
  durationDays,
})
const queue = () =>
  ['a', 'b', 'c', 'd', 'e'].reduce((posts, id) => appendSpecial(posts, draft(id), now), [])

test('three specials go live together, further specials wait for capacity', () => {
  const posts = queue()
  assert.deepEqual(
    activeSpecials(posts, now).map((p) => p.id),
    ['a', 'b', 'c']
  )
  assert.equal(posts[3].startsAt, now + DAY_MS)
  assert.equal(posts[4].startsAt, now + DAY_MS)
  assert.deepEqual(
    activeSpecials(posts, now + DAY_MS).map((p) => p.id),
    ['d', 'e']
  )
  assert.equal(activeSpecials(posts, now + 2 * DAY_MS).length, 0)
})
test('different durations release slots independently at exact boundaries', () => {
  let posts = []
  for (const [id, days] of [
    ['a', 3],
    ['b', 1],
    ['c', 2],
    ['d', 4],
  ])
    posts = appendSpecial(posts, draft(id, days), now)
  assert.equal(posts[3].startsAt, now + DAY_MS)
  assert.equal(posts[3].endsAt, now + 5 * DAY_MS)
  assert.deepEqual(
    activeSpecials(posts, now + DAY_MS).map((p) => p.id),
    ['a', 'c', 'd']
  )
})
test('reordering and deleting queue entries preserves live durations', () => {
  const posts = queue()
  const midway = now + DAY_MS / 2
  const moved = moveSpecial(posts, 'e', -1, midway)
  assert.deepEqual(
    moved.slice(3).map((p) => p.id),
    ['e', 'd']
  )
  assert.deepEqual(moved.slice(0, 3), posts.slice(0, 3))
  const removed = removeSpecial(posts, 'a', midway)
  assert.equal(removed.find((p) => p.id === 'd').startsAt, midway)
  assert.equal(removed.find((p) => p.id === 'd').endsAt, midway + DAY_MS)
  assert.equal(removed.find((p) => p.id === 'b').endsAt, now + DAY_MS)
})
test('removing expired history does not reschedule live specials', () => {
  const posts = queue()
  const result = removeSpecial(posts, 'a', now + DAY_MS)
  assert.deepEqual(
    result.find((p) => p.id === 'd'),
    posts[3]
  )
})
test('invalid durations and prices are rejected', () => {
  for (const days of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])
    assert.throws(() => appendSpecial([], draft('invalid', days), now))
  assert.throws(() => appendSpecial([], { ...draft('invalid'), price: NaN }, now))
})
