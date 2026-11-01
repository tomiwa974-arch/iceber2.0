import LoadingSkeleton from '~/components/loading_skeleton'
import AsyncButton from '~/components/async_button'
import DemoNotice from '~/components/demo_notice'
import PolicyLinks from '~/components/policy_links'
import OrderCart from '~/components/order_cart'
import { addToOrder } from '~/lib/order_cart'
import VerifyEmail from '~/components/verify_email'
import { RESERVATION_TERMS } from '../../shared/reservation_terms'
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Head, router } from '@inertiajs/react'
import { useRef } from 'react'
import ManageReservation from '~/components/manage_reservation'
import TablePicker from '~/components/table_picker'
import GuestCount from '~/components/guest_count'
import ReservationTime from '~/components/reservation_time'
import CurrencySelector from '~/components/currency_selector'
import {
  MapPin,
  Clock,
  X,
  Menu,
  Phone,
  Mail,
  Calendar,
  User,
  ArrowRight,
  ChevronRight,
} from 'lucide-react'

import IcebergLogo from '~/components/iceberg_logo'
import { activeSpecials, specialDate } from '~/lib/specials'
import { useSpecialsClock } from '~/lib/use_specials_clock'

import {
  useRestaurant,
  formatPrice,
  saveReservation,
  subscribeNewsletter,
} from '~/lib/restaurant_store'

// Rotating Plate Component
const RotatingPlate = ({
  image,
  alt,
  isSpinning = true,
}: {
  image: string
  alt: string
  isSpinning?: boolean
}) => {
  const reduceMotion = useReducedMotion()
  const [failedImage, setFailedImage] = useState('')
  return (
    <motion.div
      className="relative w-full h-full"
      animate={isSpinning && !reduceMotion ? { rotate: 360 } : { rotate: 0 }}
      transition={{
        duration: 20,
        repeat: Infinity,
        ease: 'linear',
      }}
    >
      <div className="absolute inset-0 rounded-full shadow-xl overflow-hidden">
        {image && failedImage !== image ? (
          <img
            src={image}
            alt={alt}
            onError={() => setFailedImage(image)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full grid place-items-center bg-gray-100 text-gray-600">
            <IcebergLogo className="h-24 w-24" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
      </div>
      <div className="absolute inset-0 rounded-full ring-2 ring-white/30 ring-offset-2 ring-offset-transparent" />
      <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </motion.div>
  )
}

// Navigation Component
const Navigation = () => {
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
      setMobileMenuOpen(false)
    }
  }

  const goToFullMenu = () => {
    router.visit('/full-menu')
  }

  useEffect(() => {
    if (!mobileMenuOpen) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [mobileMenuOpen])
  const navLinks = ['Home', 'Menu', 'Drinks', 'About', 'Reservations', 'Contact']

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5 }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? 'bg-white shadow-lg' : 'bg-white/90 backdrop-blur-md'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <button
              type="button"
              aria-label="Iceberg home"
              className="flex items-center cursor-pointer"
              onClick={() => scrollToSection('home')}
            >
              <IcebergLogo className="h-10 w-10" />
              <span className="ml-2 text-xl font-semibold text-gray-900">IceBerg</span>
            </button>

            <div className="hidden md:flex items-center space-x-8">
              {navLinks.map((link) => (
                <button
                  key={link}
                  onClick={() => scrollToSection(link.toLowerCase())}
                  className="text-gray-700 hover:text-gray-900 font-medium transition-colors"
                >
                  {link}
                </button>
              ))}
              <button
                onClick={goToFullMenu}
                className="bg-gray-900 text-white px-6 py-2 rounded-full hover:bg-gray-800 transition-colors"
              >
                Full Menu
              </button>
            </div>

            <CurrencySelector />
            <button
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </motion.nav>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            id="mobile-navigation"
            className="fixed top-16 left-0 right-0 bg-white shadow-lg z-40 md:hidden"
          >
            <div className="px-4 py-6 space-y-4">
              {navLinks.map((link) => (
                <button
                  key={link}
                  onClick={() => scrollToSection(link.toLowerCase())}
                  className="block w-full text-left text-gray-700 hover:text-gray-900 font-medium"
                >
                  {link}
                </button>
              ))}
              <button
                onClick={() => {
                  goToFullMenu()
                  setMobileMenuOpen(false)
                }}
                className="w-full bg-gray-900 text-white px-6 py-2 rounded-full hover:bg-gray-800 transition-colors"
              >
                Full Menu
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// Hero Section
const Hero = () => {
  const { settings, specials, loaded, error: loadError } = useRestaurant()
  const now = useSpecialsClock(specials)
  const liveSpecials = activeSpecials(specials, now)

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <section
      id="home"
      className="relative min-h-screen flex items-center pt-16 overflow-hidden bg-white"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 mt-4 mb-6">
              {settings.heroTitle}
              <span className="block text-gray-600">{settings.heroSubtitle}</span>
            </h1>
            <p className="text-lg text-gray-600 mb-8 leading-relaxed">{settings.heroDescription}</p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => scrollToSection('reservations')}
                className="bg-gray-900 text-white px-8 py-3 rounded-full hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 group"
              >
                Reserve a Table
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => scrollToSection('menu')}
                className="border-2 border-gray-900 text-gray-900 px-8 py-3 rounded-full hover:bg-gray-900 hover:text-white transition-colors"
              >
                View Menu
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="text-center mx-auto" data-testid="daily-special" aria-live="polite">
              <span className="inline-block rounded-full bg-emerald-50 text-emerald-800 px-3 py-1 text-xs font-medium mb-3">
                Daily Specials
              </span>
              {!loaded && !loadError ? (
                <LoadingSkeleton label="Loading today's special..." count={1} />
              ) : liveSpecials.length ? (
                <div className={`special-plates special-plates-${liveSpecials.length}`}>
                  {liveSpecials.map((special) => (
                    <article key={special.id} className="special-plate-card">
                      <div className="special-plate-image">
                        <RotatingPlate image={special.image} alt={special.title} />
                      </div>
                      <h2 className="text-lg font-semibold text-gray-900 mt-4">{special.title}</h2>
                      <p className="text-gray-600 text-sm mt-1">{special.caption}</p>
                      <p className="font-semibold text-gray-900 mt-2">
                        {formatPrice(special.price)}
                      </p>
                      <p className="text-gray-600 text-xs mt-2">
                        Until {specialDate(special.endsAt)}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <>
                  <div className="special-plate-image mx-auto mb-8">
                    <RotatingPlate image="" alt="Iceberg kitchen" />
                  </div>
                  <p className="text-gray-600 font-medium">Something delicious is coming</p>
                  <p className="text-gray-600 text-sm mt-1">
                    Check back for our next daily special.
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// Menu Section
const MenuSection = () => {
  const { menu, loaded, error: loadError } = useRestaurant()
  const DISHES = menu
    .filter((item) => item.available && item.kind !== 'drink')
    .map((item) => ({ ...item, desc: item.description, price: formatPrice(item.price) }))
  const [selectedCategory, setSelectedCategory] = useState('All')
  const categories = ['All', ...new Set(DISHES.map((dish) => dish.category))]

  const filteredDishes =
    selectedCategory === 'All' || !categories.includes(selectedCategory)
      ? DISHES
      : DISHES.filter((dish) => dish.category === selectedCategory)

  const goToFullMenu = () => router.visit('/full-menu')

  return (
    <section id="menu" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <span className="text-gray-600 uppercase tracking-wider text-sm font-medium">
            Our Menu
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mt-2 mb-4">Food menu</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Browse dishes, descriptions and prices before placing an order.
          </p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-3 mb-12">
          {categories.map((category) => (
            <button
              key={category}
              aria-pressed={selectedCategory === category}
              onClick={() => setSelectedCategory(category)}
              className={`px-6 py-2 rounded-full transition-colors ${
                selectedCategory === category
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {!loaded && !loadError && (
            <div className="col-span-full">
              <LoadingSkeleton label="Loading menu..." cards count={6} />
            </div>
          )}
          {loadError && !loaded && (
            <p className="col-span-full" role="alert">
              The menu could not be loaded. Use Retry to try again.
            </p>
          )}
          {loaded && filteredDishes.length === 0 && (
            <p className="col-span-full text-center text-gray-600 py-8">
              Our menu is being refreshed. Please check back soon.
            </p>
          )}
          {filteredDishes.slice(0, 6).map((dish, index) => (
            <motion.div
              key={dish.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow"
            >
              <div className="relative h-48 overflow-hidden">
                {dish.image ? (
                  <img
                    src={dish.image}
                    alt={dish.name}
                    className="w-full h-full object-cover hover:scale-110 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center bg-gray-100 text-gray-600">
                    <IcebergLogo className="h-12 w-12" />
                  </div>
                )}
                {dish.popular && (
                  <span className="absolute top-4 right-4 bg-gray-900 text-white px-3 py-1 rounded-full text-xs font-medium">
                    Popular
                  </span>
                )}
              </div>
              <div className="p-6">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-xl font-semibold text-gray-900">{dish.name}</h3>
                  <span className="text-lg font-bold text-gray-900">{dish.price}</span>
                </div>
                <p className="text-gray-600 text-sm mb-4">{dish.desc}</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => addToOrder(dish.id)}
                    className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-full text-sm hover:bg-gray-800 transition-colors"
                  >
                    Add to order
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="text-center mt-12">
          <button
            onClick={goToFullMenu}
            className="bg-transparent border-2 border-gray-900 text-gray-900 px-8 py-3 rounded-full hover:bg-gray-900 hover:text-white transition-colors inline-flex items-center gap-2 font-semibold"
          >
            View Full Menu
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </section>
  )
}

// Drinks Section
const DrinksSection = () => {
  const { menu, loaded, error: loadError } = useRestaurant()
  const DRINKS = menu
    .filter((item) => item.available && item.kind === 'drink')
    .map((item) => ({ ...item, desc: item.description, price: formatPrice(item.price) }))
  return (
    <section id="drinks" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <span className="text-gray-600 uppercase tracking-wider text-sm font-medium">
            Drinks menu
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mt-2 mb-4">
            Drinks for your table
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Browse drinks, compare prices and add your choice to the order.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {!loaded && !loadError && (
            <div className="col-span-full">
              <LoadingSkeleton label="Loading drinks..." cards />
            </div>
          )}
          {loaded && DRINKS.length === 0 && (
            <p className="col-span-full text-center text-gray-600 py-8">
              Our drinks menu is being refreshed. Please check back soon.
            </p>
          )}
          {DRINKS.slice(0, 6).map((drink, index) => (
            <motion.div
              key={drink.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="bg-gray-50 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow"
            >
              <div className="relative h-48 overflow-hidden">
                {drink.image ? (
                  <img
                    src={drink.image}
                    alt={drink.name}
                    className="w-full h-full object-cover hover:scale-110 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center bg-gray-100 text-gray-600">
                    <IcebergLogo className="h-12 w-12" />
                  </div>
                )}
                {drink.popular && (
                  <span className="absolute top-4 right-4 bg-gray-900 text-white px-3 py-1 rounded-full text-xs font-medium">
                    Popular
                  </span>
                )}
              </div>
              <div className="p-6">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-xl font-semibold text-gray-900">{drink.name}</h3>
                  <span className="text-lg font-bold text-gray-900">{drink.price}</span>
                </div>
                <p className="text-gray-600 text-sm mb-4">{drink.desc}</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => addToOrder(drink.id)}
                    className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-full text-sm hover:bg-gray-800 transition-colors"
                  >
                    Add to order
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// About Section
const AboutSection = () => {
  const { menu } = useRestaurant()
  const DISHES = menu
    .filter((item) => item.available && item.kind !== 'drink')
    .map((item) => ({ ...item, desc: item.description, price: formatPrice(item.price) }))
  const spinningDish = DISHES[3] ?? DISHES[0] ?? { image: '', name: 'Our kitchen' }

  return (
    <section id="about" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-gray-600 uppercase tracking-wider text-sm font-medium">
              Our Story
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mt-2 mb-6">
              Welcome to
              <span className="block">Iceberg</span>
            </h2>
            <div className="space-y-4 text-gray-600">
              <p>
                Explore our food and drinks menu, see current specials and reserve a table for your
                visit.
              </p>
              <p>
                For menu questions, dietary requirements or help with your booking, contact the
                restaurant before your visit.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="relative w-80 h-80 mx-auto">
              <RotatingPlate image={spinningDish.image} alt={spinningDish.name} />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// Reservation Section
const emptyReservationForm = () => ({
  name: '',
  email: '',
  phone: '',
  date: '',
  time: '',
  guests: '2',
  specialRequests: '',
})
const ReservationSection = () => {
  const { live } = useRestaurant()
  const [tableId, setTableId] = useState('')
  const [availabilityRevision, setAvailabilityRevision] = useState(0)
  const [formData, setFormData] = useState(emptyReservationForm)
  const [verificationToken, setVerificationToken] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const pending = useRef(false)

  const resetBookingForm = useCallback(() => {
    setFormData(emptyReservationForm())
    setTableId('')
    setVerificationToken('')
    setAcceptedTerms(false)
    setError('')
    setSubmitting(false)
    pending.current = false
    setAvailabilityRevision((value) => value + 1)
  }, [])

  useEffect(() => {
    // Browsers can restore this entire React tree when returning with Back.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) resetBookingForm()
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [resetBookingForm])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (pending.current) return
    if (!tableId) {
      setError('Choose an available table for your date, time and party size.')
      return
    }
    if (!verificationToken) {
      setError('Verify your email before continuing to payment.')
      return
    }
    pending.current = true
    setSubmitting(true)
    try {
      const result = await saveReservation({
        ...formData,
        acceptedTerms,
        tableId,
        verificationToken,
      })
      resetBookingForm()
      window.location.assign(result.url)
    } catch (cause) {
      setAvailabilityRevision((value) => value + 1)
      setTableId('')
      setError(
        cause instanceof Error ? cause.message : 'Unable to save. Please call us to reserve.'
      )
      return
    } finally {
      pending.current = false
      setSubmitting(false)
    }
  }

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    if (e.target.name === 'email') setVerificationToken('')
    if (['date', 'time', 'guests'].includes(e.target.name)) setTableId('')
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  return (
    <section id="reservations" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <span className="text-gray-600 uppercase tracking-wider text-sm font-medium">
            Reservations
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mt-2 mb-4">
            Secure Your Table
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Book your dining experience with us. We look forward to serving you.
          </p>
        </motion.div>

        <div className="max-w-3xl mx-auto">
          {error && (
            <p role="alert" className="mb-4 text-red-600">
              {error}
            </p>
          )}
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-8">
            <fieldset disabled={submitting || !live}>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label
                    htmlFor="reservation-name"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input
                      type="text"
                      autoComplete="name"
                      id="reservation-name"
                      name="name"
                      minLength={2}
                      maxLength={100}
                      required
                      value={formData.name}
                      onChange={handleChange}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      placeholder="Your full name"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="reservation-email"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input
                      type="email"
                      autoComplete="email"
                      id="reservation-email"
                      name="email"
                      maxLength={254}
                      required
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="reservation-phone"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Phone
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input
                      type="tel"
                      autoComplete="tel"
                      id="reservation-phone"
                      name="phone"
                      minLength={8}
                      maxLength={25}
                      pattern={String.raw`(?:0[789][01][0-9]{8}|\+[1-9][0-9]{7,14})`}
                      title="Use a Nigerian mobile number (08012345678) or international format (+2348012345678)."
                      required
                      value={formData.phone}
                      onChange={handleChange}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      placeholder="08012345678 or +2348012345678"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="reservation-guests"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Number of Guests
                  </label>
                  <GuestCount
                    date={formData.date}
                    time={formData.time}
                    value={formData.guests}
                    onChange={(guests) => {
                      setTableId('')
                      setFormData({ ...formData, guests })
                    }}
                  />
                </div>
                <div>
                  <label
                    htmlFor="reservation-date"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Date
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input
                      type="date"
                      id="reservation-date"
                      name="date"
                      required
                      value={formData.date}
                      onChange={handleChange}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="reservation-time"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Time
                  </label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <ReservationTime
                      date={formData.date}
                      value={formData.time}
                      onChange={(time) => {
                        setTableId('')
                        setFormData({ ...formData, time })
                      }}
                    />
                  </div>
                </div>
                <TablePicker
                  date={formData.date}
                  time={formData.time}
                  guests={formData.guests}
                  value={tableId}
                  onChange={setTableId}
                  refreshKey={availabilityRevision}
                />
                <div className="md:col-span-2">
                  <label
                    htmlFor="reservation-specialRequests"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Special Requests (optional)
                  </label>
                  <textarea
                    id="reservation-specialRequests"
                    name="specialRequests"
                    maxLength={2000}
                    rows={3}
                    value={formData.specialRequests}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    placeholder="Only include details needed for this visit; discuss allergies with staff."
                  />
                </div>
              </div>
              <VerifyEmail
                key={formData.email.trim().toLowerCase()}
                email={formData.email.trim().toLowerCase()}
                onVerified={setVerificationToken}
              />
              <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-700">
                <p className="font-semibold">Before you reserve</p>
                <p>
                  We use your contact details to manage this booking, verify your email and send
                  booking messages.{' '}
                  <a className="underline" href="/privacy">
                    Privacy policy
                  </a>{' '}
                  ?{' '}
                  <a className="underline" href="/terms">
                    Terms &amp; Conditions
                  </a>{' '}
                  ?{' '}
                  <a className="underline" href="/refunds">
                    Refund policy
                  </a>
                  . Booking does not sign you up for marketing.
                </p>
                <ul className="mt-2 list-disc space-y-2 pl-5">
                  {RESERVATION_TERMS.map((term) => (
                    <li key={term}>{term}</li>
                  ))}
                </ul>
                <label className="flex gap-3 mt-3">
                  <input
                    type="checkbox"
                    required
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                  />
                  I agree to the reservation terms, including the cancellation fees.
                </label>
              </div>
              <AsyncButton
                pending={Boolean(submitting)}
                type="submit"
                disabled={submitting}
                className="w-full mt-6 bg-gray-900 text-white px-8 py-3 rounded-full hover:bg-gray-800 transition-colors"
              >
                {submitting ? 'Preparing checkout…' : `Continue to payment · ${formatPrice(30000)}`}
              </AsyncButton>
            </fieldset>
          </form>
          <ManageReservation recentReference="" />
        </div>
      </div>
    </section>
  )
}

// Contact Section
const ContactSection = () => {
  const { settings } = useRestaurant()
  return (
    <section id="contact" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <span className="text-gray-600 uppercase tracking-wider text-sm font-medium">
            Contact Us
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mt-2 mb-4">Get In Touch</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Have questions? We&apos;d love to hear from you
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white rounded-2xl p-8 text-center hover:shadow-lg transition-shadow">
            <MapPin className="w-10 h-10 text-gray-900 mx-auto mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">Visit Us</h3>
            <p className="text-gray-600">
              {settings.address || 'Business address to be supplied by the operator'}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-8 text-center hover:shadow-lg transition-shadow">
            <Phone className="w-10 h-10 text-gray-900 mx-auto mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">Call Us</h3>
            <p className="text-gray-600">
              {settings.phone ? (
                <a href={`tel:${settings.phone}`}>{settings.phone}</a>
              ) : (
                'Business phone to be supplied by the operator'
              )}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-8 text-center hover:shadow-lg transition-shadow">
            <Mail className="w-10 h-10 text-gray-900 mx-auto mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">Email Us</h3>
            <p className="text-gray-600">
              {settings.email ? (
                <a href={`mailto:${settings.email}`}>{settings.email}</a>
              ) : (
                'Business email to be supplied by the operator'
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

// Footer
const Footer = () => {
  const { settings, live } = useRestaurant()
  const [email, setEmail] = useState('')
  const [subscribing, setSubscribing] = useState(false)
  const [newsletterMessage, setNewsletterMessage] = useState('')
  const [newsletterConsent, setNewsletterConsent] = useState(false)
  const [newsletterError, setNewsletterError] = useState('')
  const subscribingRef = useRef(false)
  const subscribe = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (subscribingRef.current) return
    subscribingRef.current = true
    setSubscribing(true)
    setNewsletterMessage('')
    setNewsletterError('')
    try {
      await subscribeNewsletter(email.trim(), newsletterConsent)
      setNewsletterMessage('You’re subscribed. Thank you!')
      setEmail('')
      setNewsletterConsent(false)
    } catch (cause) {
      setNewsletterError(
        cause instanceof Error ? cause.message : 'Could not subscribe. Please try again.'
      )
    } finally {
      subscribingRef.current = false
      setSubscribing(false)
    }
  }
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const goToFullMenu = () => router.visit('/full-menu')

  return (
    <footer className="bg-gray-900 text-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <button
              type="button"
              aria-label="Iceberg home"
              className="flex items-center mb-4 cursor-pointer"
              onClick={() => scrollToSection('home')}
            >
              <IcebergLogo className="h-6 w-6" />
              <span className="ml-2 text-xl font-semibold">IceBerg</span>
            </button>
            <p className="text-gray-400 text-sm">
              Browse food and drinks, check prices and plan your visit.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2 text-gray-400">
              <li>
                <button
                  onClick={() => scrollToSection('home')}
                  className="hover:text-white transition-colors"
                >
                  Home
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('menu')}
                  className="hover:text-white transition-colors"
                >
                  Menu
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('drinks')}
                  className="hover:text-white transition-colors"
                >
                  Drinks
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('about')}
                  className="hover:text-white transition-colors"
                >
                  About
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('contact')}
                  className="hover:text-white transition-colors"
                >
                  Contact
                </button>
              </li>
              <li>
                <button onClick={goToFullMenu} className="hover:text-white transition-colors">
                  Full Menu
                </button>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Hours</h4>
            <ul className="space-y-2 text-gray-400">
              <li>{settings.weekdayHours}</li>
              <li>{settings.weekendHours}</li>
              <li>{settings.sundayHours}</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Newsletter</h4>
            <p className="text-gray-400 text-sm mb-3">Get exclusive offers and updates</p>
            <form onSubmit={subscribe} className="flex flex-wrap gap-2">
              <fieldset disabled={!live} className="contents">
                <input
                  type="email"
                  required
                  aria-label="Newsletter email address"
                  disabled={subscribing}
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Your email"
                  className="min-w-0 flex-1 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-400"
                />
                <AsyncButton
                  pending={Boolean(subscribing)}
                  type="submit"
                  disabled={subscribing}
                  className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  {subscribing ? 'Subscribing…' : 'Subscribe'}
                </AsyncButton>
                <label className="flex basis-full items-start gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    required
                    checked={newsletterConsent}
                    onChange={(event) => setNewsletterConsent(event.target.checked)}
                  />
                  <span>
                    I want newsletter emails. I can withdraw by contacting the restaurant.{' '}
                    <a className="underline" href="/privacy">
                      Privacy policy
                    </a>
                  </span>
                </label>
              </fieldset>
            </form>
            {newsletterMessage && (
              <p role="status" className="mt-3 text-sm text-green-300">
                {newsletterMessage}
              </p>
            )}
            {newsletterError && (
              <p role="alert" className="mt-3 text-sm text-red-300">
                {newsletterError}
              </p>
            )}
          </div>
        </div>
        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400 text-sm">
          <PolicyLinks />
          <p>&copy; {new Date().getFullYear()} Iceberg Restaurant.</p>
        </div>
      </div>
    </footer>
  )
}

// Main Component
export default function IcebergLanding() {
  return (
    <div className="restaurant w-full min-h-screen bg-white">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <OrderCart />
      <Head title="Fine Dining" />
      <Navigation />
      <main id="main-content" tabIndex={-1} className="pt-16">
        <DemoNotice />
        <Hero />
        <MenuSection />
        <DrinksSection />
        <AboutSection />
        <ReservationSection />
        <ContactSection />
      </main>
      <Footer />
    </div>
  )
}
