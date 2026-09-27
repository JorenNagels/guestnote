import Link from 'next/link'
import type { Locale } from '../../../lib/locales.ts'
import { pagePath } from '../../../lib/marketing-pages.ts'
import type { LegalText } from './types.ts'

/**
 * Who processes data on Guestnote's behalf (spec 0006, "Subprocessors"). Every row is a vendor the
 * code actually calls, checked 2026-09-27: AWS (`sst.config.ts`, SES in ADR 0002, S3 in
 * `packages/storage`), Neon (project region read from the Neon API: `aws-eu-central-1`), Sentry
 * (`env.ts`, `de.sentry.io` ingest), Zoho (ADR 0005, human mail only) and Google (optional
 * sign-in, `better-auth.ts`, only where `GOOGLE_CLIENT_ID` is set). A new vendor is added here
 * 30 days BEFORE it receives data -- the DPA promises that notice.
 */

type Row = Readonly<{
  name: string
  purpose: Record<Locale, string>
  location: Record<Locale, string>
}>

const ROWS: readonly Row[] = [
  {
    name: 'Amazon Web Services EMEA SARL',
    purpose: {
      nl: 'Hosting van de applicatie, opslag van bestanden, verzending van e-mail',
      en: 'Application hosting, file storage, sending email',
      fr: 'Hébergement de l’application, stockage des fichiers, envoi d’e-mails',
    },
    location: {
      nl: 'EU (Frankfurt); publieke webpagina’s via een wereldwijd netwerk',
      en: 'EU (Frankfurt); public web pages via a global network',
      fr: 'UE (Francfort) ; pages web publiques via un réseau mondial',
    },
  },
  {
    name: 'Neon Inc.',
    purpose: { nl: 'Database', en: 'Database', fr: 'Base de données' },
    location: {
      nl: 'EU (Frankfurt, op AWS)',
      en: 'EU (Frankfurt, on AWS)',
      fr: 'UE (Francfort, sur AWS)',
    },
  },
  {
    name: 'Functional Software, Inc. (Sentry)',
    purpose: {
      nl: 'Foutopvolging en meldingen via „Meld een probleem”',
      en: 'Error tracking and “Report a problem” submissions',
      fr: 'Suivi des erreurs et signalements via « Signaler un problème »',
    },
    location: { nl: 'EU (Duitsland)', en: 'EU (Germany)', fr: 'UE (Allemagne)' },
  },
  {
    name: 'Zoho Corporation B.V.',
    purpose: {
      nl: 'E-mailverkeer met ons (support en contact)',
      en: 'Email correspondence with us (support and contact)',
      fr: 'Correspondance par e-mail avec nous (support et contact)',
    },
    location: { nl: 'EU', en: 'EU', fr: 'UE' },
  },
  {
    name: 'Google Ireland Limited',
    purpose: {
      nl: 'Inloggen met Google, alleen als je daarvoor kiest',
      en: 'Sign in with Google, only if you choose it',
      fr: 'Connexion avec Google, uniquement si vous la choisissez',
    },
    location: {
      nl: 'EU en VS (EU-VS Data Privacy Framework)',
      en: 'EU and US (EU-US Data Privacy Framework)',
      fr: 'UE et États-Unis (Data Privacy Framework UE-États-Unis)',
    },
  },
]

const HEAD = {
  nl: ['Subverwerker', 'Doel', 'Locatie'],
  en: ['Subprocessor', 'Purpose', 'Location'],
  fr: ['Sous-traitant', 'Finalité', 'Localisation'],
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
            <td>{r.name}</td>
            <td>{r.purpose[locale]}</td>
            <td>{r.location[locale]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export const SUBPROCESSORS: LegalText = {
  nl: {
    intro: (
      <p>
        Dit zijn de dienstverleners die persoonsgegevens verwerken in opdracht van Guestnote, zoals
        bedoeld in onze <Link href={pagePath('dpa', 'nl')}>verwerkersovereenkomst</Link>. Een nieuwe
        subverwerker melden we minstens 30 dagen op voorhand per e-mail aan de eigenaar van elke
        studio.
      </p>
    ),
    sections: [{ id: 'lijst', title: 'Huidige subverwerkers', body: table('nl') }],
  },
  en: {
    intro: (
      <p>
        These are the service providers that process personal data on Guestnote’s behalf, as
        referred to in our <Link href={pagePath('dpa', 'en')}>data processing agreement</Link>. We
        email every studio owner at least 30 days before adding a new one.
      </p>
    ),
    sections: [{ id: 'list', title: 'Current subprocessors', body: table('en') }],
  },
  fr: {
    intro: (
      <p>
        Voici les prestataires qui traitent des données personnelles pour le compte de Guestnote, au
        sens de notre <Link href={pagePath('dpa', 'fr')}>accord de traitement des données</Link>.
        Nous prévenons chaque propriétaire de studio par e-mail au moins 30 jours avant d’en ajouter
        un nouveau.
      </p>
    ),
    sections: [{ id: 'liste', title: 'Sous-traitants actuels', body: table('fr') }],
  },
}
