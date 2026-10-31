self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {}
  event.waitUntil(
    self.registration.showNotification(
      data.kind === 'order' ? 'Iceberg orders' : 'Iceberg reservations',
      {
        body: data.message || 'There is a reservation update. Open the admin page.',
        tag: data.kind === 'order' ? 'iceberg-orders' : 'iceberg-reservations',
        data: { kind: data.kind },
      }
    )
  )
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const admin = clients.find((client) => new URL(client.url).pathname === '/admin')
      const url = event.notification.data?.kind === 'order' ? '/admin?tab=orders' : '/admin'
      if (admin) {
        await admin.navigate(url)
        return admin.focus()
      }
      return self.clients.openWindow(url)
    })
  )
})
