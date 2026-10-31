import AsyncButton from '~/components/async_button'
import { Head, useForm } from '@inertiajs/react'
import type { FormEvent } from 'react'
import AdminAuthLayout from '~/components/admin_auth_layout'

export default function AdminSetup() {
  const form = useForm({ fullName: '', email: '', password: '', passwordConfirmation: '' })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    form.post('/admin/setup', {
      onFinish: () => form.reset('password', 'passwordConfirmation'),
    })
  }

  return (
    <AdminAuthLayout
      title="Set up your admin."
      description="Create the administrator account for Iceberg. This setup closes after your account is created."
    >
      <Head title="Set up administrator" />
      <form onSubmit={submit} className="admin-auth-form">
        <div>
          <label htmlFor="admin-name">Your name</label>
          <input
            id="admin-name"
            name="fullName"
            value={form.data.fullName}
            onChange={(event) => form.setData('fullName', event.target.value)}
            autoComplete="name"
            autoFocus
            minLength={2}
            maxLength={100}
            required
            aria-invalid={Boolean(form.errors.fullName)}
            aria-describedby={form.errors.fullName ? 'admin-name-error' : undefined}
          />
          {form.errors.fullName && (
            <p id="admin-name-error" className="admin-auth-error" role="alert">
              {form.errors.fullName}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="admin-email">Email address</label>
          <input
            id="admin-email"
            name="email"
            type="email"
            value={form.data.email}
            onChange={(event) => form.setData('email', event.target.value)}
            autoComplete="username"
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
            autoComplete="new-password"
            pattern={String.raw`(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9\s]).+`}
            minLength={12}
            maxLength={128}
            required
            aria-invalid={Boolean(form.errors.password)}
            aria-describedby="admin-password-hint"
          />
          <p id="admin-password-hint" className="admin-auth-hint">
            Use 12?128 characters with an uppercase letter, a lowercase letter, a number and a
            symbol.
          </p>
          {form.errors.password && (
            <p className="admin-auth-error" role="alert">
              {form.errors.password}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="admin-confirm-password">Confirm password</label>
          <input
            id="admin-confirm-password"
            name="passwordConfirmation"
            type="password"
            value={form.data.passwordConfirmation}
            onChange={(event) => form.setData('passwordConfirmation', event.target.value)}
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            aria-invalid={Boolean(form.errors.passwordConfirmation)}
            aria-describedby={form.errors.passwordConfirmation ? 'admin-confirm-error' : undefined}
          />
          {form.errors.passwordConfirmation && (
            <p id="admin-confirm-error" className="admin-auth-error" role="alert">
              {form.errors.passwordConfirmation}
            </p>
          )}
        </div>
        <AsyncButton pending={Boolean(form.processing)} type="submit" disabled={form.processing}>
          {form.processing ? 'Creating account…' : 'Create administrator account'}
        </AsyncButton>
      </form>
      <p className="admin-auth-note">
        Keep these credentials safe. Only administrators sign in; your customers do not need
        accounts.
      </p>
    </AdminAuthLayout>
  )
}
