import { headers } from 'next/headers'
import { getAuth } from '../../../lib/auth.ts'
import { signOut } from './actions.ts'

/**
 * **Temporary.** Proof that the session is real, and nothing more.
 *
 * M3's actual finish line is "login -> org switcher -> wedding list"; this is the
 * scaffolding that proves the first arrow works before the other two exist. Everything on
 * screen comes from `getSession()`, so if it renders, the cookie was set, signed, sent
 * back, verified, and resolved to a row in `users`.
 *
 * Replaced by the real shell. Nothing here is designed and none of it should survive.
 */
export default async function DashboardPage() {
  const session = await getAuth().getSession(await headers())
  if (!session) return null

  const rows: Array<[string, string]> = [
    ['email', session.email],
    ['name', session.name ?? '— (not captured yet)'],
    ['user id', session.userId],
    ['org', session.lastOrgId ?? '— (org resolution is not built)'],
  ]

  return (
    <main className="bg-background text-foreground min-h-dvh p-8">
      <div className="mx-auto max-w-2xl">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.09em] uppercase">
          Signed in
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Guestnote</h1>
        <p className="text-muted-foreground mt-2 max-w-prose text-sm leading-relaxed">
          Temporary page. It exists to prove the session is real — every value below came back from{' '}
          <code className="font-mono text-xs">getSession()</code>, which means the cookie was
          signed, returned, verified and resolved to a row in{' '}
          <code className="font-mono text-xs">users</code>.
        </p>

        <table className="bg-card mt-6 w-full border-collapse overflow-hidden rounded-md border text-sm">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} className="border-b last:border-b-0">
                <th className="text-muted-foreground w-40 px-3 py-2 text-left font-medium">
                  {label}
                </th>
                <td className="px-3 py-2 font-mono text-xs break-all">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <form action={signOut} className="mt-6">
          <button
            type="submit"
            className="border-input hover:border-foreground inline-flex h-9 items-center rounded-[var(--radius)] border px-3.5 text-sm font-medium"
          >
            Afmelden
          </button>
        </form>
      </div>
    </main>
  )
}
