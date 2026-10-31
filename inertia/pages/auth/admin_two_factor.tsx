import AsyncButton from '~/components/async_button'
import { Head, useForm } from '@inertiajs/react'
import type { FormEvent } from 'react'
import AdminAuthLayout from '~/components/admin_auth_layout'
export default function AdminTwoFactor() {
  const form = useForm({ code: '' })
  function submit(event: FormEvent) {
    event.preventDefault()
    form.post('/admin/two-factor', { onFinish: () => form.reset('code') })
  }
  return (
    <AdminAuthLayout
      title="Verify your sign-in"
      description="Enter the code from your authenticator app, or an unused recovery code."
    >
      <Head title="Two-factor verification" />
      <form onSubmit={submit} className="admin-auth-form">
        <label htmlFor="mfa-code">Authenticator or recovery code</label>
        <input
          id="mfa-code"
          autoFocus
          required
          maxLength={40}
          autoComplete="one-time-code"
          value={form.data.code}
          onChange={(e) => form.setData('code', e.target.value)}
        />
        {form.errors.code && (
          <p role="alert" className="admin-auth-error">
            {form.errors.code}
          </p>
        )}
        <AsyncButton pending={Boolean(form.processing)} disabled={form.processing}>
          {form.processing ? 'Verifying sign-in...' : 'Verify sign-in'}
        </AsyncButton>
      </form>
      <a href="/admin/login">Back to sign in</a>
    </AdminAuthLayout>
  )
}
