import { useRestaurant } from '~/lib/restaurant_store'

export default function DemoNotice() {
  const { live } = useRestaurant()
  if (live) return null
  return (
    <aside
      aria-label="Demonstration website"
      className="mx-auto max-w-7xl border-b border-amber-300 bg-amber-50 px-6 py-4 text-sm text-amber-950"
    >
      <strong>Restaurant website demo.</strong> Iceberg is a sample brand, not a registered
      restaurant. Menu, prices and hours are examples. Customer submissions and payments are
      disabled. Do not enter real personal or payment details. Policies are template text for the
      eventual operator to review.
    </aside>
  )
}
