import LoadingSkeleton from '~/components/loading_skeleton'
import DemoNotice from '~/components/demo_notice'
import PolicyLinks from '~/components/policy_links'
import OrderCart from '~/components/order_cart'
import { addToOrder } from '~/lib/order_cart'
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Head, router } from '@inertiajs/react'
import { UtensilsCrossed, Star, Coffee, ArrowLeft, ArrowUpRight } from 'lucide-react'
import IcebergLogo from '~/components/iceberg_logo'
import CurrencySelector from '~/components/currency_selector'
import MenuItemDetails, { MenuItemPhoto } from '~/components/menu_item_details'
import { useRestaurant, formatPrice, type MenuItem } from '~/lib/restaurant_store'

const MenuNavigation = () => {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    handleScroll()
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])
  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white shadow-lg' : 'bg-white/90 backdrop-blur-md'}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <button
            type="button"
            className="flex items-center"
            onClick={() => router.visit('/')}
            aria-label="IceBerg home"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            <IcebergLogo className="h-8 w-8" />
            <span className="ml-2 text-xl font-semibold">IceBerg</span>
          </button>
          <CurrencySelector />
          <button
            type="button"
            onClick={() => router.visit('/')}
            className="bg-gray-900 text-white px-5 py-2 rounded-full hover:bg-gray-800 text-sm"
          >
            Back to Home
          </button>
        </div>
      </div>
    </motion.nav>
  )
}

function ItemCard({ item, onOpen }: { item: MenuItem; onOpen: (id: string) => void }) {
  return (
    <div className="flex h-full flex-col gap-3">
      <button
        type="button"
        aria-label={`View ${item.name}`}
        onClick={() => onOpen(item.id)}
        className="group flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-sm transition-shadow hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gray-900"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
          <MenuItemPhoto item={item} />
          {item.popular && (
            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-gray-900 shadow-sm">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              Popular
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col p-5 sm:p-6">
          <span className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-600">
            {item.category}
          </span>
          <h3 className="break-words text-lg font-semibold text-gray-900">{item.name}</h3>
          <p className="mt-2 line-clamp-2 break-words text-sm leading-relaxed text-gray-500">
            {item.description}
          </p>
          <div className="mt-auto flex items-center justify-between gap-3 pt-5">
            <span className="font-semibold text-gray-900">{formatPrice(item.price)}</span>
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              View details <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={() => addToOrder(item.id)}
        className="rounded-full bg-gray-900 px-4 py-3 text-sm font-semibold text-white"
        aria-label={`Add ${item.name} to order`}
      >
        Add to order
      </button>
    </div>
  )
}

export default function FullMenu() {
  const { menu, loaded, error: loadError } = useRestaurant()
  const [activeTab, setActiveTab] = useState('food')
  const [activeCategory, setActiveCategory] = useState('Appetizers')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedItem = menu.find((item) => item.id === selectedId && item.available)
  const closeDetails = useCallback(() => setSelectedId(null), [])
  if (selectedId && !selectedItem) setSelectedId(null)
  const food = menu.filter((item) => item.available && item.kind !== 'drink')
  const drinks = menu.filter((item) => item.available && item.kind === 'drink')
  const foodCategories = [...new Set(food.map((item) => item.category))]
  const drinkCategories = [...new Set(drinks.map((item) => item.category))]
  const category = foodCategories.includes(activeCategory) ? activeCategory : foodCategories[0]
  const foodItems = food.filter((item) => item.category === category)
  return (
    <div className="restaurant min-h-screen bg-gray-50 pt-16">
      <Head title="Full Menu" />
      <MenuNavigation />
      <OrderCart />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <DemoNotice />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-4">Full Menu</h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            Browse food and drinks, compare prices and view item details.
          </p>
          <p className="mt-3 text-sm text-gray-600">
            Select any item for its full photo and details.
          </p>
        </motion.div>
        <div className="flex justify-center gap-3 sm:gap-4 mb-8">
          {[
            { key: 'food', label: 'Food Menu', icon: UtensilsCrossed },
            { key: 'drinks', label: 'Drinks Menu', icon: Coffee },
          ].map(({ key, label, icon: Icon }) => (
            <button
              type="button"
              key={key}
              onClick={() => setActiveTab(key)}
              aria-pressed={activeTab === key}
              className={`inline-flex items-center gap-2 rounded-full px-5 sm:px-8 py-3 text-sm sm:text-base font-semibold transition-all ${activeTab === key ? 'bg-gray-900 text-white shadow-lg' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
        {!loaded && !loadError && <LoadingSkeleton label="Loading full menu..." cards count={6} />}
        {loadError && !loaded && (
          <p role="alert">The menu could not be loaded. Use Retry to try again.</p>
        )}
        {loaded && (activeTab === 'food' ? food : drinks).length === 0 && (
          <p className="text-center text-gray-500 py-12">
            This menu is being refreshed. Please check back soon.
          </p>
        )}
        {activeTab === 'food' && (
          <>
            <div className="flex flex-wrap justify-center gap-3 mb-10">
              {foodCategories.map((name) => (
                <button
                  type="button"
                  key={name}
                  onClick={() => setActiveCategory(name)}
                  aria-pressed={category === name}
                  className={`px-5 py-2 rounded-full text-sm transition-colors ${category === name ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {foodItems.map((item) => (
                <ItemCard key={item.id} item={item} onOpen={setSelectedId} />
              ))}
            </div>
          </>
        )}
        {activeTab === 'drinks' && (
          <div className="space-y-12">
            {drinkCategories.map((name) => (
              <section key={name} aria-label={name}>
                <h2 className="mb-5 text-2xl font-semibold text-gray-900">{name}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {drinks
                    .filter((item) => item.category === name)
                    .map((item) => (
                      <ItemCard key={item.id} item={item} onOpen={setSelectedId} />
                    ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
      <PolicyLinks />
      <MenuItemDetails item={selectedItem} onClose={closeDetails} />
    </div>
  )
}
