import { UtensilsCrossed } from 'lucide-react'

// Temporary mark: replace with the original iceberg.png when available.
export default function IcebergLogo({ className = 'h-10 w-10' }: { className?: string }) {
  return <UtensilsCrossed className={className} aria-label="Iceberg logo" />
}
