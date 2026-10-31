import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  pending?: boolean
}

/** Keep the action's label visible; indeterminate progress never invents a percentage. */
export default function AsyncButton({ pending = false, disabled, children, ...props }: Props) {
  return (
    <button {...props} disabled={disabled || pending} aria-busy={pending}>
      {pending && <span className="action-spinner" aria-hidden="true" />}
      {children}
      {pending && <span className="sr-only"> Action in progress.</span>}
    </button>
  )
}
