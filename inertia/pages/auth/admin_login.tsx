import AsyncButton from '~/components/async_button'
import { Head, useForm } from '@inertiajs/react'
import type { FormEvent } from 'react'
import AdminAuthLayout from '~/components/admin_auth_layout'

export default function AdminLogin() {
  const form = useForm({ email: '', password: '' })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    form.post('/admin/login', { onFinish: () => form.reset('password') })
  }

  return (
    <AdminAuthLayout
      title="Welcome back."
      description="Sign in to manage your menu, daily specials, reservations, and website."
    >
      <Head title="Admin sign in" />
      <form onSubmit={submit} className="admin-auth-form">
        <div>
          <label htmlFor="admin-email">Email address</label>
          <input
            id="admin-email"
            name="email"
            type="email"
            value={form.data.email}
            onChange={(event) => form.setData('email', event.target.value)}
            autoComplete="username"
            autoFocus
            maxLength={254}
            required
            aria-invalid={Boolean(form.errors.email)}
            aria-describedby={form.errors.email ? 'admin-email-error' : undefined}
          />
          {form.errors.email && (
            <p id="admin-email-error" className="admin-auth-error" role="alert">
              {form.errors.email}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            name="password"
            type="password"
            value={form.data.password}
            onChange={(event) => form.setData('password', event.target.value)}
            autoComplete="current-password"
            maxLength={128}
            required
            aria-invalid={Boolean(form.errors.password)}
            aria-describedby={form.errors.password ? 'admin-password-error' : undefined}
          />
          {form.errors.password && (
            <p id="admin-password-error" className="admin-auth-error" role="alert">
              {form.errors.password}
            </p>
          )}
        </div>
        <AsyncButton pending={Boolean(form.processing)} type="submit" disabled={form.processing}>
          {form.processing ? 'Signing in…' : 'Sign in to admin'}
        </AsyncButton>
      </form>
      <p className="admin-auth-note">
        Customers can browse the menu and reserve a table without an account.
      </p>
    </AdminAuthLayout>
  )
}
