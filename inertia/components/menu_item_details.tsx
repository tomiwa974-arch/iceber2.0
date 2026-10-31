import { addToOrder } from '~/lib/order_cart'
import { useEffect, useRef, useState } from 'react'
import { Link } from '@adonisjs/inertia/react'
import { X, Star, ArrowUpRight } from 'lucide-react'
import { formatPrice, type MenuItem } from '~/lib/restaurant_store'
import IcebergLogo from './iceberg_logo'

export function MenuItemPhoto({ item, full = false }: { item: MenuItem; full?: boolean }) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  return item.image && failedSource !== item.image ? (
    <img
      src={item.image}
      alt={item.name}
      loading={full ? 'eager' : 'lazy'}
      className={
        full
          ? 'w-full max-h-[55vh] object-contain'
          : 'h-full w-full object-cover transition-transform duration-500 group-hover:scale-105'
      }
      onError={() => setFailedSource(item.image)}
    />
  ) : (
    <div
      className={`flex w-full flex-col items-center justify-center gap-3 bg-gray-100 text-gray-400 ${full ? 'min-h-56' : 'h-full'}`}
    >
      <IcebergLogo className="h-12 w-12" />
      {full && <span className="text-sm">Photo coming soon</span>}
    </div>
  )
}

export default function MenuItemDetails({
  item,
  onClose,
}: {
  item: MenuItem | undefined
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!item) {
      dialog.current?.close()
      return
    }
    dialog.current?.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [item?.id])

  return (
    <dialog
      ref={dialog}
      aria-labelledby="menu-detail-title"
      aria-describedby="menu-detail-description"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto rounded-2xl border-0 bg-white p-0 text-gray-900 shadow-2xl backdrop:bg-black/65 backdrop:backdrop-blur-sm"
    >
      {item && (
        <div>
          <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
              {item.category}
            </span>
            <button
              autoFocus
              type="button"
              onClick={onClose}
              aria-label="Close item details"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gray-100 hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="bg-gray-50 p-3 sm:p-6">
            <MenuItemPhoto item={item} full />
          </div>
          <div className="p-6 sm:p-8">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                {item.available ? 'Available' : 'Currently unavailable'}
              </span>
              {item.popular && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                  <Star className="h-3 w-3 fill-current" />
                  Popular
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2
                id="menu-detail-title"
                className="min-w-0 break-words text-2xl font-semibold tracking-tight sm:text-3xl"
              >
                {item.name}
              </h2>
              <p className="text-xl font-semibold">{formatPrice(item.price)}</p>
            </div>
            <p
              id="menu-detail-description"
              className="mt-4 whitespace-pre-line break-words leading-relaxed text-gray-600"
            >
              {item.description}
            </p>
            <button
              type="button"
              disabled={!item.available}
              onClick={() => {
                addToOrder(item.id)
                onClose()
              }}
              className="mt-6 mr-3 rounded-full bg-gray-900 px-6 py-3 font-semibold text-white disabled:opacity-50"
            >
              Add to order
            </button>
            <Link
              href="/#reservations"
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800"
            >
              Reserve a table <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </dialog>
  )
}
