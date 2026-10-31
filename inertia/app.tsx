import RequestProgress from '~/components/request_progress'
import AsyncButton from '~/components/async_button'
import { MotionConfig } from 'framer-motion'
import './css/app.css'
import { startCurrency } from './lib/currency'
import { client } from './client'
import { createRoot } from 'react-dom/client'
import { TuyauProvider } from '@adonisjs/inertia/react'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'
import { createInertiaApp, router, type ResolvedComponent } from '@inertiajs/react'
import { refreshRestaurant, startRestaurantSync, useRestaurant } from './lib/restaurant_store'

const appName = import.meta.env.VITE_APP_NAME || 'Iceberg'

function RestaurantStatus() {
  const { error, loading, loaded } = useRestaurant()
  if (!error && (loaded || !loading)) return null
  return (
    <div
      role={error ? 'alert' : 'status'}
      style={{
        position: 'fixed',
        bottom: 20,
        left: 20,
        right: 20,
        zIndex: 10000,
        padding: '12px 18px',
        borderRadius: 12,
        background: error ? '#fff1f2' : '#ffffff',
        color: error ? '#9f1239' : '#44403c',
        boxShadow: '0 4px 24px #0002',
        textAlign: 'center',
      }}
    >
      {error || 'Loading the latest menu…'}
      {error && (
        <AsyncButton
          pending={loading}
          type="button"
          onClick={() => {
            void refreshRestaurant()
          }}
          style={{ marginLeft: 12, textDecoration: 'underline' }}
        >
          Retry
        </AsyncButton>
      )}
    </div>
  )
}

createInertiaApp({
  title: (title) => (title ? `${title} - ${appName}` : appName),
  resolve: async (name) => {
    const page = await resolvePageComponent(
      `./pages/${name}.tsx`,
      import.meta.glob<{ default: ResolvedComponent }>('./pages/**/*.tsx')
    )
    return page.default
  },
  setup({ el, App, props }) {
    startRestaurantSync()
    void startCurrency()
    const stopNavigationSync = router.on('navigate', () => {
      void refreshRestaurant()
    })
    // The entry can run again during Vite refresh. Reuse its root instead of
    // mounting two React trees into the same DOM container.
    const root = import.meta.hot?.data.root ?? createRoot(el)
    if (import.meta.hot) {
      import.meta.hot.data.root = root
      import.meta.hot.dispose(stopNavigationSync)
    }
    root.render(
      <TuyauProvider client={client}>
        <MotionConfig reducedMotion="user">
          <App {...props} />
        </MotionConfig>
        <RestaurantStatus />
        <RequestProgress />
      </TuyauProvider>
    )
  },
  progress: {
    color: '#4B5563',
  },
})

if (import.meta.hot) import.meta.hot.accept()
