import type { SeedTemplate, TaskAssigneeRole, TaskVisibility } from '@guestnote/db'
import type { Locale } from './locales.ts'

/**
 * The three checklists every new studio starts with (spec 0005, Sign-up): seeded by
 * `createStudioAction` right after `create_studio`, in the locale the planner signed up in, and
 * ordinary templates from then on -- renamed, edited or deleted in the Templates screen like any
 * other. They also mean a new studio's Templates screen is not empty, and that the first-wedding
 * step has a real plan to offer.
 *
 * ## Why code, and one table per template rather than one file per language
 *
 * Each task is written ONCE with its offset, visibility and owner, and its three titles beside
 * it. So the Dutch, English and French plans cannot drift apart in anything but wording: a task
 * added to one language is added to all three, and `starter-templates.test.ts` holds that.
 * Rejected: the message catalogue. This is content a planner will edit, not interface copy, and
 * `next-intl` would put three hundred lines of it into every dashboard render's catalogue.
 *
 * ## Where the content comes from
 *
 * `research/09-planner-app.md` P8/P9 (T-minus offsets, "apply a standard plan in one click") and
 * the order a Belgian wedding actually runs in: the venue and the civil date at the town hall
 * first, the `aangifte van huwelijk` no earlier than six months and no later than fourteen days
 * before, the final headcount to the caterer about three weeks out. Offsets are days relative to
 * the main wedding date (`TemplateItemInput`): negative before, positive after.
 * **Drafted, not yet reviewed by Joren** -- spec 0005 lists that as open.
 */

type Words = Readonly<Record<Locale, string>>
type Item = readonly [days: number, TaskVisibility, TaskAssigneeRole, Words]
type Starter = {
  readonly name: Words
  readonly description: Words
  readonly items: readonly Item[]
}

const S = 'shared'
const I = 'internal'
const P = 'planner'
const C = 'couple'

const FULL: Starter = {
  name: {
    nl: 'Volledige planning · 12 maanden',
    en: 'Full planning · 12 months',
    fr: 'Organisation complète · 12 mois',
  },
  description: {
    nl: 'Van het eerste gesprek tot de eindafrekening, voor een koppel dat alles uit handen geeft.',
    en: 'From the first meeting to the final invoice, for a couple who hand over everything.',
    fr: 'Du premier rendez-vous au décompte final, pour un couple qui délègue tout.',
  },
  items: [
    [
      -365,
      S,
      P,
      {
        nl: 'Kennismakingsgesprek: wensen en stijl van het koppel vastleggen',
        en: 'First meeting: note the couple’s wishes and style',
        fr: 'Premier rendez-vous : noter les envies et le style du couple',
      },
    ],
    [
      -360,
      S,
      P,
      {
        nl: 'Budgetplafond afspreken met het koppel',
        en: 'Agree the budget ceiling with the couple',
        fr: 'Fixer le budget maximal avec le couple',
      },
    ],
    [
      -350,
      I,
      P,
      {
        nl: 'Planningscontract en betalingsschema laten ondertekenen',
        en: 'Get the planning contract and fee schedule signed',
        fr: 'Faire signer le contrat et l’échéancier des honoraires',
      },
    ],
    [
      -340,
      S,
      C,
      {
        nl: 'Eerste versie van de gastenlijst opstellen',
        en: 'Draft the first guest list',
        fr: 'Établir une première liste d’invités',
      },
    ],
    [
      -330,
      S,
      P,
      {
        nl: 'Locaties bezoeken en een keuze maken',
        en: 'Visit venues and choose one',
        fr: 'Visiter des lieux et en choisir un',
      },
    ],
    [
      -300,
      S,
      P,
      {
        nl: 'Locatiecontract laten ondertekenen',
        en: 'Get the venue contract signed',
        fr: 'Faire signer le contrat du lieu',
      },
    ],
    [
      -300,
      S,
      C,
      {
        nl: 'Datum voor het burgerlijk huwelijk vastleggen bij de gemeente',
        en: 'Book the civil ceremony date at the town hall',
        fr: 'Réserver la date du mariage civil à la commune',
      },
    ],
    [
      -270,
      S,
      P,
      {
        nl: 'Fotograaf en videograaf boeken',
        en: 'Book the photographer and videographer',
        fr: 'Réserver le photographe et le vidéaste',
      },
    ],
    [
      -250,
      S,
      P,
      {
        nl: 'Cateraar kiezen en een proeverij plannen',
        en: 'Choose the caterer and plan a tasting',
        fr: 'Choisir le traiteur et planifier une dégustation',
      },
    ],
    [
      -240,
      S,
      P,
      {
        nl: 'Muziek boeken: dj of band',
        en: 'Book the music: DJ or band',
        fr: 'Réserver la musique : DJ ou groupe',
      },
    ],
    [
      -210,
      S,
      P,
      {
        nl: 'Bloemist en decoratie vastleggen',
        en: 'Book the florist and decoration',
        fr: 'Réserver le fleuriste et la décoration',
      },
    ],
    [
      -180,
      S,
      C,
      {
        nl: 'Save-the-dates versturen',
        en: 'Send the save-the-dates',
        fr: 'Envoyer les save-the-date',
      },
    ],
    [
      -180,
      S,
      C,
      {
        nl: 'Aangifte van huwelijk doen bij de gemeente',
        en: 'File the declaration of marriage at the town hall',
        fr: 'Faire la déclaration de mariage à la commune',
      },
    ],
    [
      -150,
      S,
      C,
      {
        nl: 'Trouwkleding kiezen en pasbeurten plannen',
        en: 'Choose the wedding outfits and plan fittings',
        fr: 'Choisir les tenues et planifier les essayages',
      },
    ],
    [
      -120,
      S,
      C,
      {
        nl: 'Uitnodigingen laten drukken',
        en: 'Have the invitations printed',
        fr: 'Faire imprimer les faire-part',
      },
    ],
    [
      -120,
      S,
      P,
      {
        nl: 'Overnachtingen voor gasten reserveren',
        en: 'Reserve rooms for guests',
        fr: 'Réserver des chambres pour les invités',
      },
    ],
    [
      -100,
      S,
      C,
      { nl: 'Uitnodigingen versturen', en: 'Send the invitations', fr: 'Envoyer les faire-part' },
    ],
    [
      -90,
      S,
      C,
      {
        nl: 'Ceremonie uitwerken met de ambtenaar of voorganger',
        en: 'Work out the ceremony with the officiant',
        fr: 'Préparer la cérémonie avec l’officiant',
      },
    ],
    [
      -60,
      S,
      P,
      {
        nl: 'Menu vastleggen na de proeverij',
        en: 'Settle the menu after the tasting',
        fr: 'Arrêter le menu après la dégustation',
      },
    ],
    [
      -45,
      I,
      P,
      {
        nl: 'Eerste versie van het draaiboek opstellen',
        en: 'Write the first run sheet',
        fr: 'Rédiger la première version du déroulé',
      },
    ],
    [
      -30,
      S,
      C,
      {
        nl: 'Dieetwensen en allergieën van gasten verzamelen',
        en: 'Collect guests’ dietary needs and allergies',
        fr: 'Recueillir les régimes et allergies des invités',
      },
    ],
    [
      -30,
      S,
      C,
      {
        nl: 'Tafelschikking opmaken',
        en: 'Draw up the seating plan',
        fr: 'Établir le plan de table',
      },
    ],
    [
      -21,
      S,
      P,
      {
        nl: 'Definitief aantal gasten doorgeven aan cateraar en locatie',
        en: 'Give the final headcount to the caterer and venue',
        fr: 'Communiquer le nombre final d’invités au traiteur et au lieu',
      },
    ],
    [
      -14,
      I,
      P,
      {
        nl: 'Aankomsttijden bevestigen met elke leverancier',
        en: 'Confirm arrival times with every vendor',
        fr: 'Confirmer les heures d’arrivée avec chaque prestataire',
      },
    ],
    [
      -10,
      S,
      P,
      {
        nl: 'Draaiboek delen met alle leveranciers',
        en: 'Share the run sheet with every vendor',
        fr: 'Partager le déroulé avec tous les prestataires',
      },
    ],
    [
      -7,
      S,
      C,
      {
        nl: 'Laatste betalingen aan leveranciers klaarzetten',
        en: 'Prepare the final vendor payments',
        fr: 'Préparer les derniers paiements aux prestataires',
      },
    ],
    [
      -2,
      S,
      P,
      {
        nl: 'Decoratie en persoonlijke spullen afleveren op de locatie',
        en: 'Drop off decoration and personal items at the venue',
        fr: 'Déposer la décoration et les effets personnels sur le lieu',
      },
    ],
    [
      7,
      I,
      P,
      {
        nl: 'Gehuurd materiaal terugbrengen en eindafrekening maken',
        en: 'Return rentals and send the final invoice',
        fr: 'Rendre le matériel loué et établir le décompte final',
      },
    ],
  ],
}

const PARTIAL: Starter = {
  name: {
    nl: 'Gedeeltelijke planning · 6 maanden',
    en: 'Partial planning · 6 months',
    fr: 'Organisation partielle · 6 mois',
  },
  description: {
    nl: 'Voor een koppel dat de locatie en een deel van de leveranciers al heeft.',
    en: 'For a couple who already have the venue and some of the vendors.',
    fr: 'Pour un couple qui a déjà le lieu et une partie des prestataires.',
  },
  items: [
    [
      -180,
      S,
      P,
      {
        nl: 'Kennismakingsgesprek: wat staat er al vast?',
        en: 'First meeting: what is already booked?',
        fr: 'Premier rendez-vous : qu’est-ce qui est déjà réservé ?',
      },
    ],
    [
      -175,
      I,
      P,
      {
        nl: 'Contracten van de geboekte leveranciers doornemen',
        en: 'Read through the booked vendors’ contracts',
        fr: 'Relire les contrats des prestataires réservés',
      },
    ],
    [
      -170,
      S,
      P,
      {
        nl: 'Budget en betalingsschema overlopen',
        en: 'Go through the budget and payment schedule',
        fr: 'Passer en revue le budget et l’échéancier',
      },
    ],
    [
      -170,
      S,
      C,
      {
        nl: 'Aangifte van huwelijk doen bij de gemeente',
        en: 'File the declaration of marriage at the town hall',
        fr: 'Faire la déclaration de mariage à la commune',
      },
    ],
    [
      -160,
      S,
      P,
      {
        nl: 'Ontbrekende leveranciers boeken',
        en: 'Book the missing vendors',
        fr: 'Réserver les prestataires manquants',
      },
    ],
    [
      -120,
      S,
      C,
      { nl: 'Uitnodigingen versturen', en: 'Send the invitations', fr: 'Envoyer les faire-part' },
    ],
    [
      -90,
      S,
      C,
      {
        nl: 'Ceremonie uitwerken met de ambtenaar of voorganger',
        en: 'Work out the ceremony with the officiant',
        fr: 'Préparer la cérémonie avec l’officiant',
      },
    ],
    [
      -75,
      S,
      P,
      {
        nl: 'Styling en decoratie vastleggen',
        en: 'Settle styling and decoration',
        fr: 'Arrêter le stylisme et la décoration',
      },
    ],
    [
      -60,
      S,
      P,
      {
        nl: 'Menu bevestigen met de cateraar',
        en: 'Confirm the menu with the caterer',
        fr: 'Confirmer le menu avec le traiteur',
      },
    ],
    [
      -45,
      I,
      P,
      {
        nl: 'Eerste versie van het draaiboek opstellen',
        en: 'Write the first run sheet',
        fr: 'Rédiger la première version du déroulé',
      },
    ],
    [
      -30,
      S,
      C,
      {
        nl: 'Dieetwensen en allergieën van gasten verzamelen',
        en: 'Collect guests’ dietary needs and allergies',
        fr: 'Recueillir les régimes et allergies des invités',
      },
    ],
    [
      -30,
      S,
      C,
      {
        nl: 'Tafelschikking opmaken',
        en: 'Draw up the seating plan',
        fr: 'Établir le plan de table',
      },
    ],
    [
      -21,
      S,
      P,
      {
        nl: 'Definitief aantal gasten doorgeven aan cateraar en locatie',
        en: 'Give the final headcount to the caterer and venue',
        fr: 'Communiquer le nombre final d’invités au traiteur et au lieu',
      },
    ],
    [
      -14,
      I,
      P,
      {
        nl: 'Aankomsttijden bevestigen met elke leverancier',
        en: 'Confirm arrival times with every vendor',
        fr: 'Confirmer les heures d’arrivée avec chaque prestataire',
      },
    ],
    [
      -10,
      S,
      P,
      {
        nl: 'Draaiboek delen met alle leveranciers',
        en: 'Share the run sheet with every vendor',
        fr: 'Partager le déroulé avec tous les prestataires',
      },
    ],
    [
      -7,
      S,
      C,
      {
        nl: 'Laatste betalingen aan leveranciers klaarzetten',
        en: 'Prepare the final vendor payments',
        fr: 'Préparer les derniers paiements aux prestataires',
      },
    ],
    [
      7,
      I,
      P,
      { nl: 'Eindafrekening maken', en: 'Send the final invoice', fr: 'Établir le décompte final' },
    ],
  ],
}

const DAY_OF: Starter = {
  name: { nl: 'Dagcoördinatie', en: 'Day-of coordination', fr: 'Coordination du jour J' },
  description: {
    nl: 'Het koppel plant zelf; jij neemt twee maanden vooraf over en leidt de dag.',
    en: 'The couple plan it themselves; you take over two months out and run the day.',
    fr: 'Le couple organise lui-même ; vous reprenez deux mois avant et gérez le jour J.',
  },
  items: [
    [
      -60,
      S,
      P,
      {
        nl: 'Overdrachtsgesprek: contracten en afspraken verzamelen',
        en: 'Handover meeting: collect contracts and arrangements',
        fr: 'Rendez-vous de passation : rassembler contrats et accords',
      },
    ],
    [
      -56,
      S,
      C,
      {
        nl: 'Leverancierslijst met contactpersonen aanvullen',
        en: 'Complete the vendor list with contact people',
        fr: 'Compléter la liste des prestataires et leurs contacts',
      },
    ],
    [
      -45,
      S,
      P,
      {
        nl: 'Locatiebezoek met de verantwoordelijke ter plaatse',
        en: 'Site visit with the venue’s contact person',
        fr: 'Visite du lieu avec le responsable sur place',
      },
    ],
    [-30, I, P, { nl: 'Draaiboek opstellen', en: 'Write the run sheet', fr: 'Rédiger le déroulé' }],
    [
      -21,
      S,
      C,
      {
        nl: 'Draaiboek nalezen en goedkeuren',
        en: 'Review and approve the run sheet',
        fr: 'Relire et valider le déroulé',
      },
    ],
    [
      -14,
      I,
      P,
      {
        nl: 'Aankomsttijden en opbouw bevestigen met elke leverancier',
        en: 'Confirm arrival and set-up times with every vendor',
        fr: 'Confirmer arrivées et montage avec chaque prestataire',
      },
    ],
    [
      -10,
      S,
      P,
      {
        nl: 'Draaiboek delen met alle leveranciers',
        en: 'Share the run sheet with every vendor',
        fr: 'Partager le déroulé avec tous les prestataires',
      },
    ],
    [
      -7,
      S,
      P,
      {
        nl: 'Repetitie van de ceremonie plannen',
        en: 'Schedule the ceremony rehearsal',
        fr: 'Planifier la répétition de la cérémonie',
      },
    ],
    [
      -3,
      I,
      P,
      { nl: 'Noodkit samenstellen', en: 'Pack the emergency kit', fr: 'Préparer le kit d’urgence' },
    ],
    [
      -2,
      S,
      C,
      {
        nl: 'Persoonlijke spullen en decoratie klaarzetten voor levering',
        en: 'Get personal items and decoration ready for drop-off',
        fr: 'Préparer effets personnels et décoration pour le dépôt',
      },
    ],
    [
      -1,
      I,
      P,
      {
        nl: 'Laatste controle van de opbouw op de locatie',
        en: 'Final check of the set-up at the venue',
        fr: 'Dernier contrôle du montage sur le lieu',
      },
    ],
    [
      3,
      I,
      P,
      {
        nl: 'Terugbrengen van gehuurd materiaal opvolgen',
        en: 'Follow up the return of rentals',
        fr: 'Suivre le retour du matériel loué',
      },
    ],
  ],
}

/** In the order the first-wedding step offers them; the first is its default. */
export const STARTERS: readonly Starter[] = [FULL, PARTIAL, DAY_OF]

/** The three starters in one language, shaped for `seedTemplates`. */
export function starterTemplates(locale: Locale): SeedTemplate[] {
  return STARTERS.map((t) => ({
    name: t.name[locale],
    description: t.description[locale],
    items: t.items.map(([dueOffsetDays, visibility, assigneeRole, title]) => ({
      title: title[locale],
      dueOffsetDays,
      visibility,
      assigneeRole,
    })),
  }))
}
