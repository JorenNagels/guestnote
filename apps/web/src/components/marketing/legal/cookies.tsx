import type { Locale } from '../../../lib/locales.ts'
import type { LegalText } from './types.ts'

/**
 * The cookie page (spec 0006). **Strictly necessary cookies only, so no consent banner** -- the
 * ePrivacy exemption covers them. That stays true only while nothing else is set: a later
 * analytics tool must be cookieless (Plausible, Umami), or this page and a banner arrive with it.
 *
 * Every row is a cookie the code sets, checked 2026-09-27: the session (`better-auth.ts`,
 * `AUTH_POLICY.sessionTtlSeconds` = 30 days), `NEXT_LOCALE` (`components/auth/actions.ts`, one
 * year) and the four `gn_*` preferences (`lib/prefs.ts`, `PREF_COOKIE_OPTIONS`, one year). The
 * apex -- the marketing site -- sets none.
 */

type Row = Readonly<{
  name: string
  purpose: Record<Locale, string>
  lifetime: Record<Locale, string>
}>

const ROWS: readonly Row[] = [
  {
    name: '__Host-guestnote.session_token',
    purpose: {
      nl: 'Houdt je ingelogd. Zonder dit cookie werkt Guestnote niet.',
      en: 'Keeps you signed in. Guestnote does not work without it.',
      fr: 'Vous garde connecté. Guestnote ne fonctionne pas sans lui.',
    },
    lifetime: { nl: '30 dagen', en: '30 days', fr: '30 jours' },
  },
  {
    name: 'NEXT_LOCALE',
    purpose: {
      nl: 'Onthoudt de taal die je koos.',
      en: 'Remembers the language you chose.',
      fr: 'Mémorise la langue choisie.',
    },
    lifetime: { nl: '1 jaar', en: '1 year', fr: '1 an' },
  },
  {
    name: 'gn_theme, gn_density, gn_nav',
    purpose: {
      nl: 'Onthouden je weergave: licht of donker, compact of ruim, de zijbalk open of dicht.',
      en: 'Remember your display: light or dark, compact or comfortable, the sidebar open or closed.',
      fr: 'Mémorisent votre affichage : clair ou sombre, compact ou aéré, barre latérale ouverte ou fermée.',
    },
    lifetime: { nl: '1 jaar', en: '1 year', fr: '1 an' },
  },
  {
    name: 'gn_org',
    purpose: {
      nl: 'Onthoudt in welke studio je werkt, als je lid bent van meer dan één.',
      en: 'Remembers which studio you are working in, if you belong to more than one.',
      fr: 'Mémorise le studio dans lequel vous travaillez, si vous en avez plusieurs.',
    },
    lifetime: { nl: '1 jaar', en: '1 year', fr: '1 an' },
  },
]

const HEAD = {
  nl: ['Cookie', 'Waarvoor', 'Bewaard'],
  en: ['Cookie', 'What for', 'Kept for'],
  fr: ['Cookie', 'À quoi il sert', 'Durée'],
} as const

function table(locale: Locale) {
  const [a, b, c] = HEAD[locale]
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">{a}</th>
          <th scope="col">{b}</th>
          <th scope="col">{c}</th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map((r) => (
          <tr key={r.name}>
            <td>
              <code>{r.name}</code>
            </td>
            <td>{r.purpose[locale]}</td>
            <td>{r.lifetime[locale]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export const COOKIES: LegalText = {
  nl: {
    intro: (
      <p>
        Guestnote gebruikt alleen cookies die strikt nodig zijn om de dienst te laten werken. We
        gebruiken geen analytische, advertentie- of trackingcookies, en daarom vragen we ook geen
        toestemming via een cookiebanner.
      </p>
    ),
    sections: [
      {
        id: 'website',
        title: 'Op deze website',
        body: <p>Deze website (guestnote.be) plaatst geen cookies.</p>,
      },
      {
        id: 'app',
        title: 'In de app (app.guestnote.be)',
        body: (
          <>
            {table('nl')}
            <p>
              Tijdens het inloggen kunnen ook enkele kortstondige technische cookies nodig zijn
              (bijvoorbeeld voor een passkey of voor inloggen met Google). Die verdwijnen binnen
              enkele minuten.
            </p>
          </>
        ),
      },
    ],
  },
  en: {
    intro: (
      <p>
        Guestnote only uses cookies that are strictly necessary for the service to work. We use no
        analytics, advertising or tracking cookies, which is why we don’t ask for consent with a
        cookie banner.
      </p>
    ),
    sections: [
      {
        id: 'website',
        title: 'On this website',
        body: <p>This website (guestnote.be) sets no cookies.</p>,
      },
      {
        id: 'app',
        title: 'In the app (app.guestnote.be)',
        body: (
          <>
            {table('en')}
            <p>
              Signing in may also need a few short-lived technical cookies (for example for a
              passkey or for signing in with Google). They disappear within minutes.
            </p>
          </>
        ),
      },
    ],
  },
  fr: {
    intro: (
      <p>
        Guestnote n’utilise que des cookies strictement nécessaires au fonctionnement du service.
        Nous n’utilisons aucun cookie d’analyse, de publicité ou de suivi, c’est pourquoi nous ne
        demandons pas de consentement via une bannière cookies.
      </p>
    ),
    sections: [
      {
        id: 'site',
        title: 'Sur ce site',
        body: <p>Ce site (guestnote.be) ne dépose aucun cookie.</p>,
      },
      {
        id: 'app',
        title: 'Dans l’application (app.guestnote.be)',
        body: (
          <>
            {table('fr')}
            <p>
              La connexion peut aussi nécessiter quelques cookies techniques de courte durée (par
              exemple pour une clé d’accès ou une connexion avec Google). Ils disparaissent en
              quelques minutes.
            </p>
          </>
        ),
      },
    ],
  },
}
