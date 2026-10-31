export default function PolicyLinks() {
  return (
    <nav aria-label="Policies" className="flex flex-wrap justify-center gap-5 p-6 text-sm">
      <a className="underline" href="/privacy">
        Privacy
      </a>
      <a className="underline" href="/terms">
        Terms &amp; Conditions
      </a>
      <a className="underline" href="/refunds">
        Refund policy
      </a>
      <a className="underline" href="/cookies">
        Cookies &amp; storage
      </a>
    </nav>
  )
}
