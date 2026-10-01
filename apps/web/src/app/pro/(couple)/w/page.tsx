import { myCoupleWeddings } from '@guestnote/db'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatCivilDate } from '../../../../lib/civil-date.ts'
import { getDb } from '../../../../lib/db.ts'
import { currentSession } from '../../../../lib/principal.ts'
import { app } from '../../../../lib/routes.ts'
import { signOut } from '../../(app)/actions.ts'

/**
 * `/w`: which wedding (spec 0008). One goes straight in; several get a list; none says so and
 * offers the way out -- a partner who was removed, or whose wedding was deleted, lands here and
 * must not face a blank page.
 */
export default async function CouplePicker() {
  const [session, t, locale] = await Promise.all([
    currentSession(),
    getTranslations('app.couple.portal'),
    getLocale(),
  ])
  if (!session) redirect(app.loginAfterExpiry())
  const weddings = await myCoupleWeddings(getDb(), session.userId)
  const only = weddings[0]
  if (weddings.length === 1 && only) redirect(app.couple(only.weddingId))

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">
        {weddings.length === 0 ? t('title') : t('pick')}
      </h1>
      {weddings.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">{t('noWedding')}</p>
      ) : (
        <ul className="mt-4 flex list-none flex-col gap-2 p-0">
          {weddings.map((w) => (
            <li key={w.weddingId}>
              <Link
                href={app.couple(w.weddingId)}
                className="border-border bg-background hover:bg-muted block rounded-[var(--radius-container)] border p-4"
              >
                <span className="block font-medium">{w.coupleDisplayName}</span>
                {w.weddingDate && (
                  <span className="text-muted-foreground text-sm">
                    {formatCivilDate(locale, w.weddingDate)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <form action={signOut} className="mt-8">
        <button
          type="submit"
          className="text-muted-foreground text-sm underline underline-offset-2"
        >
          {t('signOut')}
        </button>
      </form>
    </main>
  )
}
