import { useSyncExternalStore } from 'react'

let snapshot = { pending: 0, mutations: 0 }
const initial = snapshot
const listeners = new Set<() => void>()

export function beginRequest(method = 'GET') {
  const mutation = !['GET', 'HEAD'].includes(method.toUpperCase())
  const publish = (change: number) => {
    snapshot = {
      pending: snapshot.pending + change,
      mutations: snapshot.mutations + (mutation ? change : 0),
    }
    listeners.forEach((listener) => listener())
  }
  publish(1)
  let ended = false
  return () => {
    if (ended) return
    ended = true
    publish(-1)
  }
}

export function useRequestActivity() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => snapshot,
    () => initial
  )
}
