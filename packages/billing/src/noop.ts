import type { BillingProvider } from './types.ts'

/**
 * The only provider there is (spec 0005: the provider is chosen when payments go live, not
 * now). Checkout and the portal answer `unavailable`, and the Billing screen says so inline;
 * `setSeats` is ignored; there are no invoices and no subscription.
 *
 * Rejected: a fake that "succeeds" and sends the browser to the success banner. That would make
 * the screen look finished to anyone reviewing it on staging, which is the one thing it must
 * not do -- the paid state is exercised with fixtures in component tests instead.
 */
export function createNoopProvider(): BillingProvider {
  return {
    name: 'noop',
    async startCheckout() {
      return { ok: false, reason: 'unavailable' }
    },
    async openPortal() {
      return { ok: false, reason: 'unavailable' }
    },
    async setSeats() {},
    async invoices() {
      return []
    },
    async subscription() {
      return null
    },
  }
}
