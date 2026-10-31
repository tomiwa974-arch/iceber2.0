import type { ReactNode } from 'react'
import { Link } from '@adonisjs/inertia/react'
import { ArrowLeft, LockKeyhole } from 'lucide-react'
import IcebergLogo from '~/components/iceberg_logo'
import '~/css/admin_auth.css'

export default function AdminAuthLayout({
  children,
  title,
  description,
}: {
  children: ReactNode
  title: string
  description: string
}) {
  return (
    <main className="admin-auth">
      <section className="admin-auth-card" aria-labelledby="admin-auth-title">
        <Link route="home" className="admin-auth-brand" aria-label="Iceberg home">
          <span>
            <IcebergLogo className="h-7 w-7" />
          </span>
          <strong>
            Iceberg<small>RESTAURANT & LOUNGE</small>
          </strong>
        </Link>
        <span className="admin-auth-label">
          <LockKeyhole size={14} /> ADMINISTRATION
        </span>
        <h1 id="admin-auth-title">{title}</h1>
        <p className="admin-auth-description">{description}</p>
        {children}
        <Link route="home" className="admin-auth-home">
          <ArrowLeft size={15} /> Back to restaurant
        </Link>
      </section>
    </main>
  )
}
