import { Head } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import AdminAuthLayout from '~/components/admin_auth_layout'

export default function Signup() {
  return (
    <AdminAuthLayout
      title="No account needed."
      description="Browse our menu and reserve a table without signing up."
    >
      <Head title="Welcome to Iceberg" />
      <Link route="home">Visit the restaurant</Link>
    </AdminAuthLayout>
  )
}
