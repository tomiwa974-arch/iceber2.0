import { Resolver } from 'node:dns/promises'

export class EmailDomain {
  private cache = new Map<string, { valid: boolean; expires: number }>()
  constructor(
    private lookup = async (domain: string) => {
      const resolver = new Resolver({ timeout: 2000, tries: 1 })
      return resolver.resolveMx(domain)
    }
  ) {}

  async acceptsMail(email: string): Promise<boolean> {
    const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase()
    const cached = this.cache.get(domain)
    if (cached && cached.expires > Date.now()) return cached.valid
    try {
      const records = await this.lookup(domain)
      const valid = records.some((record) => Boolean(record.exchange) && record.exchange !== '.')
      if (this.cache.size >= 1000) this.cache.clear()
      this.cache.set(domain, { valid, expires: Date.now() + 300000 })
      return valid
    } catch (error) {
      if (['ENOTFOUND', 'ENODATA'].includes((error as NodeJS.ErrnoException).code ?? ''))
        return false
      // A DNS outage is not evidence that the guest supplied a fake email.
      throw new Error('Email domain could not be checked. Please try again shortly.')
    }
  }
}

export default new EmailDomain()
