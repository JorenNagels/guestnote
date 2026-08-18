import { notFound } from 'next/navigation'

/**
 * Guest wedding sites -- `<slug>.guestnote.be/...` -- rewritten here by `proxy.ts`.
 *
 * ## Why this is a stub and not a page
 *
 * There is currently **no legal way to read wedding content for an anonymous visitor.**
 * `packages/db/src/tenant.ts` requires a non-empty `userId`, `orgId` and `role`;
 * `assertScoped` throws otherwise, and all three members of the `Principal` union are
 * authenticated. But research/05-architecture.md section 1 has this page rendering
 * inside a `use cache` scope with no user at all, and `migrations/0001_rls.sql` fails
 * closed when the GUCs are unset. So the schema correctly refuses to serve a public
 * page, and it will keep refusing until `packages/db` grows a fourth path.
 *
 * The intended shape is `withPublicWedding(db, weddingId, fn)` setting
 * `app.wedding_role = 'public'`, with the visibility policies extended to treat
 * `'public'` as shared-only -- rather than making `userId` optional and weakening
 * `assertScoped` for every caller. That is a packages/db change with its own isolation
 * cases, and it belongs to PH4 along with M1b's per-tenant ISR.
 *
 * ## Why the stub exists anyway
 *
 * So the tenant branch of `proxy.ts` is a real, tested route from day one rather than
 * something bolted on later, and so the slug arrives as a **route param**. That last
 * part is the load-bearing bit: section 1 notes a `use cache` scope cannot read
 * headers, so the tenant has to be part of the cache key. Proving the rewrite carries
 * it now means PH4 inherits the right shape.
 */
export default async function GuestSitePage({
  params,
}: {
  params: Promise<{ tenant: string; slug?: string[] }>
}) {
  // Awaited even though the result is discarded: sync `params` access was removed in
  // Next 16, and this is the assertion that the rewrite really does deliver the slug
  // here as a param.
  const { tenant } = await params
  void tenant

  notFound()
}
