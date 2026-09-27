import Link from 'next/link'
import { pagePath } from '../../../lib/marketing-pages.ts'
import { CONTACT_EMAIL } from '../../../lib/operator.ts'
import type { LegalText } from './types.ts'

/**
 * Data processing agreement, GDPR art. 28(3) (spec 0006). Guestnote as PROCESSOR for what a
 * studio enters about couples, guests and vendors. Incorporated into the terms, so it is accepted
 * with them at studio creation. Each art. 28(3) element has its own section so a reader can
 * check the list: (a) instructions -> 3, (b) confidentiality -> 4, (c) security -> 5 and the
 * annex, (d) subprocessors -> 6, (e) data-subject requests -> 7, (f) breach and assistance -> 8,
 * (g) deletion or return -> 9, (h) audits -> 10. Drafted 2026-09-27, not reviewed by a lawyer.
 *
 * The security annex describes what the code does: RLS forced on every tenant table
 * (`packages/db`), passkeys and one-time codes with no passwords, TLS, EU-only hosting. The
 * export, deletion, 48-hour breach and 30-day subprocessor periods do NOT describe code: they
 * are manual commitments for the operator (spec 0006, "Still open").
 */

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>

export const DPA: LegalText = {
  nl: {
    intro: (
      <p>
        Deze verwerkersovereenkomst maakt deel uit van onze{' '}
        <Link href={pagePath('terms', 'nl')}>algemene voorwaarden</Link> en geldt tussen jou, de
        onderneming die een studio in Guestnote gebruikt (de verwerkingsverantwoordelijke), en
        Guestnote (de verwerker). Ze voldoet aan artikel 28 van de Algemene Verordening
        Gegevensbescherming (AVG).
      </p>
    ),
    sections: [
      {
        id: 'voorwerp',
        title: '1. Voorwerp en duur',
        body: (
          <p>
            Guestnote verwerkt persoonsgegevens in jouw opdracht om je de dienst te leveren die in
            de algemene voorwaarden beschreven staat. Deze overeenkomst loopt zolang je studio
            bestaat, en daarna tot alle gegevens verwijderd zijn zoals in punt 9 beschreven.
          </p>
        ),
      },
      {
        id: 'verwerking',
        title: '2. Aard van de verwerking en betrokken gegevens',
        body: (
          <>
            <p>
              <strong>Aard en doel:</strong> bewaren, ordenen, tonen, delen met door jou aangeduide
              personen (je team, leveranciers via een link) en verwijderen, om trouwfeesten te
              plannen.
            </p>
            <p>
              <strong>Betrokkenen:</strong> je koppels, hun gasten, je leveranciers en hun
              contactpersonen, en je teamleden.
            </p>
            <p>
              <strong>Soorten gegevens:</strong> namen en contactgegevens, trouwdata en -locaties,
              taken, draaiboeken, budgetten en betalingen, notities, bestanden en afbeeldingen die
              je oplaadt. Je voert enkel bijzondere categorieën van gegevens in (zoals
              gezondheidsinformatie in dieetwensen) als dat nodig is voor de trouw, en je bent er
              verantwoordelijk voor dat je daar een grondslag voor hebt.
            </p>
          </>
        ),
      },
      {
        id: 'instructies',
        title: '3. Instructies',
        body: (
          <p>
            We verwerken de gegevens alleen op basis van jouw gedocumenteerde instructies. Die
            bestaan uit deze overeenkomst, de algemene voorwaarden en wat je in Guestnote zelf
            instelt en doet. Is een instructie volgens ons in strijd met de AVG, dan melden we je
            dat onmiddellijk. Moeten we gegevens verwerken omdat de wet dat oplegt, dan laten we je
            dat vooraf weten, tenzij de wet dat verbiedt.
          </p>
        ),
      },
      {
        id: 'vertrouwelijkheid',
        title: '4. Vertrouwelijkheid',
        body: (
          <p>
            Iedereen die in onze opdracht toegang heeft tot de gegevens, is tot geheimhouding
            verplicht. We kijken alleen in de gegevens van je studio als dat nodig is om de dienst
            te leveren, een probleem op te lossen dat je meldt, of als de wet het oplegt.
          </p>
        ),
      },
      {
        id: 'beveiliging',
        title: '5. Beveiliging',
        body: (
          <>
            <p>We nemen passende technische en organisatorische maatregelen, waaronder:</p>
            <ul>
              <li>hosting uitsluitend in de Europese Unie (Frankfurt);</li>
              <li>versleuteling van alle verbindingen (TLS) en van opgeslagen gegevens;</li>
              <li>
                afscherming van de gegevens per studio in de database zelf (row-level security),
                bovenop de controles in de applicatie;
              </li>
              <li>
                inloggen zonder wachtwoorden, met passkeys of eenmalige codes, en rollen binnen je
                studio;
              </li>
              <li>ondertekende, intrekbare links met een vervaldatum voor leveranciers;</li>
              <li>
                back-ups, en foutopvolging die persoonsgegevens uit automatische foutmeldingen
                filtert.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: 'subverwerkers',
        title: '6. Subverwerkers',
        body: (
          <p>
            Je geeft ons een algemene toestemming om de subverwerkers te gebruiken die op onze{' '}
            <Link href={pagePath('subprocessors', 'nl')}>pagina subverwerkers</Link> staan. Een
            nieuwe of vervangende subverwerker melden we minstens 30 dagen op voorhand per e-mail.
            Je kunt daar binnen die termijn gemotiveerd bezwaar tegen maken; vinden we geen
            oplossing, dan kun je de overeenkomst kosteloos beëindigen. We leggen elke subverwerker
            dezelfde verplichtingen op als in deze overeenkomst en blijven aansprakelijk voor hen.
          </p>
        ),
      },
      {
        id: 'rechten',
        title: '7. Rechten van betrokkenen',
        body: (
          <p>
            De meeste verzoeken (inzage, verbetering, verwijdering) kun je zelf in Guestnote
            afhandelen. Waar dat niet kan, helpen we je binnen redelijke termijn. Richt een
            betrokkene zich rechtstreeks tot ons, dan sturen we het verzoek naar jou door en
            antwoorden we niet zelf, tenzij je ons dat vraagt.
          </p>
        ),
      },
      {
        id: 'inbreuken',
        title: '8. Inbreuken en bijstand',
        body: (
          <p>
            Een inbreuk in verband met persoonsgegevens melden we je zonder onredelijke vertraging
            en uiterlijk binnen 48 uur nadat we ze vastgesteld hebben, met de informatie die je
            nodig hebt om ze zelf te melden. We helpen je ook, voor zover redelijk, bij een
            gegevensbeschermingseffectbeoordeling of een voorafgaande raadpleging van de
            toezichthouder.
          </p>
        ),
      },
      {
        id: 'einde',
        title: '9. Einde: teruggave en verwijdering',
        body: (
          <p>
            Na het einde van je overeenkomst bezorgen we je op vraag, binnen 30 dagen, een export
            van de gegevens van je studio. Uiterlijk 90 dagen na het einde verwijderen we de
            gegevens; kopieën in back-ups verdwijnen binnen 30 dagen daarna. Gegevens die we
            wettelijk moeten bewaren, bewaren we alleen daarvoor.
          </p>
        ),
      },
      {
        id: 'audit',
        title: '10. Informatie en audits',
        body: (
          <p>
            We geven je alle informatie die nodig is om aan te tonen dat we deze overeenkomst
            naleven. Een audit door jou of een onafhankelijke auditor is mogelijk, met 30 dagen
            vooraankondiging, maximaal één keer per jaar, op jouw kosten en zonder de dienst of
            andere klanten te hinderen.
          </p>
        ),
      },
      {
        id: 'doorgifte',
        title: '11. Doorgifte buiten de EU',
        body: (
          <p>
            We bewaren de gegevens in de Europese Unie. Zou een subverwerker toch gegevens buiten de
            Europese Economische Ruimte verwerken, dan gebeurt dat alleen met passende waarborgen,
            zoals de standaardcontractbepalingen van de Europese Commissie.
          </p>
        ),
      },
      {
        id: 'overig',
        title: '12. Aansprakelijkheid en contact',
        body: (
          <p>
            Voor de aansprakelijkheid onder deze overeenkomst gelden de beperkingen uit de algemene
            voorwaarden, voor zover de wet dat toelaat. Vragen over gegevensbescherming stuur je
            naar {mail}.
          </p>
        ),
      },
    ],
  },
  en: {
    intro: (
      <p>
        This data processing agreement forms part of our{' '}
        <Link href={pagePath('terms', 'en')}>terms of service</Link> and applies between you, the
        business that uses a studio in Guestnote (the controller), and Guestnote (the processor). It
        meets Article 28 of the General Data Protection Regulation (GDPR).
      </p>
    ),
    sections: [
      {
        id: 'subject',
        title: '1. Subject matter and duration',
        body: (
          <p>
            Guestnote processes personal data on your behalf to provide the service described in the
            terms. This agreement runs for as long as your studio exists, and after that until all
            data has been deleted as set out in section 9.
          </p>
        ),
      },
      {
        id: 'processing',
        title: '2. Nature of the processing and data concerned',
        body: (
          <>
            <p>
              <strong>Nature and purpose:</strong> storing, organising, displaying, sharing with
              people you designate (your team, vendors by link) and deleting, to plan weddings.
            </p>
            <p>
              <strong>Data subjects:</strong> your couples, their guests, your vendors and their
              contacts, and your team members.
            </p>
            <p>
              <strong>Types of data:</strong> names and contact details, wedding dates and venues,
              tasks, run sheets, budgets and payments, notes, and files and images you upload. You
              only enter special categories of data (such as health information in dietary
              requirements) where the wedding needs it, and you are responsible for having a legal
              basis for it.
            </p>
          </>
        ),
      },
      {
        id: 'instructions',
        title: '3. Instructions',
        body: (
          <p>
            We process the data only on your documented instructions. These consist of this
            agreement, the terms, and what you configure and do in Guestnote itself. If we believe
            an instruction infringes the GDPR, we tell you immediately. If the law requires us to
            process data, we tell you beforehand unless the law forbids it.
          </p>
        ),
      },
      {
        id: 'confidentiality',
        title: '4. Confidentiality',
        body: (
          <p>
            Everyone with access to the data on our behalf is bound to confidentiality. We only look
            at your studio’s data when needed to provide the service, to fix a problem you report,
            or when the law requires it.
          </p>
        ),
      },
      {
        id: 'security',
        title: '5. Security',
        body: (
          <>
            <p>We take appropriate technical and organisational measures, including:</p>
            <ul>
              <li>hosting exclusively in the European Union (Frankfurt);</li>
              <li>encryption of all connections (TLS) and of stored data;</li>
              <li>
                separation of each studio’s data in the database itself (row-level security), on top
                of the checks in the application;
              </li>
              <li>
                sign-in without passwords, using passkeys or one-time codes, and roles within your
                studio;
              </li>
              <li>signed, revocable, expiring links for vendors;</li>
              <li>
                backups, and error tracking that filters personal data out of automatic error
                reports.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: 'subprocessors',
        title: '6. Subprocessors',
        body: (
          <p>
            You give us general authorisation to use the subprocessors listed on our{' '}
            <Link href={pagePath('subprocessors', 'en')}>subprocessors page</Link>. We email you at
            least 30 days before adding or replacing one. You may object on reasonable grounds
            within that period; if we cannot find a solution, you may end the agreement at no cost.
            We impose the same obligations as in this agreement on every subprocessor and remain
            liable for them.
          </p>
        ),
      },
      {
        id: 'data-subjects',
        title: '7. Data subject rights',
        body: (
          <p>
            You can handle most requests (access, rectification, erasure) yourself in Guestnote.
            Where you cannot, we help you within a reasonable time. If a data subject contacts us
            directly, we forward the request to you and do not answer it ourselves unless you ask us
            to.
          </p>
        ),
      },
      {
        id: 'breaches',
        title: '8. Breaches and assistance',
        body: (
          <p>
            We notify you of a personal data breach without undue delay and no later than 48 hours
            after becoming aware of it, with the information you need to report it yourself. We also
            assist you, as far as reasonable, with a data protection impact assessment or a prior
            consultation of the supervisory authority.
          </p>
        ),
      },
      {
        id: 'end',
        title: '9. End: return and deletion',
        body: (
          <p>
            After your agreement ends, we provide an export of your studio’s data on request, within
            30 days. No later than 90 days after the end we delete the data; copies in backups
            disappear within 30 days after that. Data we are legally required to keep, we keep only
            for that purpose.
          </p>
        ),
      },
      {
        id: 'audits',
        title: '10. Information and audits',
        body: (
          <p>
            We give you all information needed to demonstrate compliance with this agreement. An
            audit by you or an independent auditor is possible with 30 days’ notice, at most once a
            year, at your cost and without disrupting the service or other customers.
          </p>
        ),
      },
      {
        id: 'transfers',
        title: '11. Transfers outside the EU',
        body: (
          <p>
            We keep the data in the European Union. Should a subprocessor nonetheless process data
            outside the European Economic Area, that happens only with appropriate safeguards, such
            as the European Commission’s standard contractual clauses.
          </p>
        ),
      },
      {
        id: 'other',
        title: '12. Liability and contact',
        body: (
          <p>
            Liability under this agreement is subject to the limits in the terms, as far as the law
            allows. Send data protection questions to {mail}.
          </p>
        ),
      },
    ],
  },
  fr: {
    intro: (
      <p>
        Cet accord de traitement des données fait partie de nos{' '}
        <Link href={pagePath('terms', 'fr')}>conditions générales</Link> et s’applique entre vous,
        l’entreprise qui utilise un studio dans Guestnote (le responsable du traitement), et
        Guestnote (le sous-traitant). Il répond à l’article 28 du Règlement général sur la
        protection des données (RGPD).
      </p>
    ),
    sections: [
      {
        id: 'objet',
        title: '1. Objet et durée',
        body: (
          <p>
            Guestnote traite des données personnelles pour votre compte afin de vous fournir le
            service décrit dans les conditions générales. Cet accord s’applique tant que votre
            studio existe, puis jusqu’à la suppression de toutes les données selon le point 9.
          </p>
        ),
      },
      {
        id: 'traitement',
        title: '2. Nature du traitement et données concernées',
        body: (
          <>
            <p>
              <strong>Nature et finalité :</strong> conserver, organiser, afficher, partager avec
              les personnes que vous désignez (votre équipe, les prestataires par lien) et
              supprimer, afin de planifier des mariages.
            </p>
            <p>
              <strong>Personnes concernées :</strong> vos couples, leurs invités, vos prestataires
              et leurs contacts, et les membres de votre équipe.
            </p>
            <p>
              <strong>Types de données :</strong> noms et coordonnées, dates et lieux de mariage,
              tâches, déroulés, budgets et paiements, notes, fichiers et images que vous téléversez.
              Vous ne saisissez des catégories particulières de données (comme des informations de
              santé dans les régimes alimentaires) que si le mariage l’exige, et vous êtes
              responsable de disposer d’une base légale pour cela.
            </p>
          </>
        ),
      },
      {
        id: 'instructions',
        title: '3. Instructions',
        body: (
          <p>
            Nous traitons les données uniquement sur vos instructions documentées : cet accord, les
            conditions générales, et ce que vous configurez et faites dans Guestnote. Si une
            instruction nous semble contraire au RGPD, nous vous en informons immédiatement. Si la
            loi nous impose un traitement, nous vous en informons au préalable, sauf si la loi
            l’interdit.
          </p>
        ),
      },
      {
        id: 'confidentialite',
        title: '4. Confidentialité',
        body: (
          <p>
            Toute personne ayant accès aux données pour notre compte est tenue au secret. Nous ne
            consultons les données de votre studio que lorsque c’est nécessaire pour fournir le
            service, résoudre un problème que vous signalez, ou lorsque la loi l’impose.
          </p>
        ),
      },
      {
        id: 'securite',
        title: '5. Sécurité',
        body: (
          <>
            <p>
              Nous prenons des mesures techniques et organisationnelles appropriées, notamment :
            </p>
            <ul>
              <li>un hébergement exclusivement dans l’Union européenne (Francfort) ;</li>
              <li>le chiffrement de toutes les connexions (TLS) et des données stockées ;</li>
              <li>
                le cloisonnement des données de chaque studio dans la base de données elle-même
                (row-level security), en plus des contrôles de l’application ;
              </li>
              <li>
                une connexion sans mot de passe, par clé d’accès ou code à usage unique, et des
                rôles au sein de votre studio ;
              </li>
              <li>des liens signés, révocables et à durée limitée pour les prestataires ;</li>
              <li>
                des sauvegardes, et un suivi des erreurs qui filtre les données personnelles des
                rapports automatiques.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: 'sous-traitants',
        title: '6. Sous-traitants ultérieurs',
        body: (
          <p>
            Vous nous donnez une autorisation générale d’utiliser les sous-traitants ultérieurs
            listés sur notre <Link href={pagePath('subprocessors', 'fr')}>page sous-traitants</Link>
            . Nous vous prévenons par e-mail au moins 30 jours avant d’en ajouter ou d’en remplacer
            un. Vous pouvez vous y opposer de manière motivée dans ce délai ; à défaut de solution,
            vous pouvez mettre fin au contrat sans frais. Nous imposons à chaque sous-traitant
            ultérieur les mêmes obligations que celles de cet accord et restons responsables à leur
            égard.
          </p>
        ),
      },
      {
        id: 'droits',
        title: '7. Droits des personnes concernées',
        body: (
          <p>
            Vous pouvez traiter vous-même la plupart des demandes (accès, rectification, effacement)
            dans Guestnote. Lorsque ce n’est pas possible, nous vous aidons dans un délai
            raisonnable. Si une personne concernée s’adresse directement à nous, nous vous
            transmettons sa demande et n’y répondons pas nous-mêmes, sauf si vous nous le demandez.
          </p>
        ),
      },
      {
        id: 'violations',
        title: '8. Violations et assistance',
        body: (
          <p>
            Nous vous notifions toute violation de données personnelles dans les meilleurs délais et
            au plus tard 48 heures après en avoir pris connaissance, avec les informations dont vous
            avez besoin pour la notifier vous-même. Nous vous assistons aussi, dans une mesure
            raisonnable, pour une analyse d’impact ou une consultation préalable de l’autorité de
            contrôle.
          </p>
        ),
      },
      {
        id: 'fin',
        title: '9. Fin : restitution et suppression',
        body: (
          <p>
            À la fin du contrat, nous vous fournissons sur demande, dans les 30 jours, un export des
            données de votre studio. Au plus tard 90 jours après la fin, nous supprimons les données
            ; les copies dans les sauvegardes disparaissent dans les 30 jours suivants. Les données
            que la loi nous oblige à conserver ne sont conservées qu’à cette fin.
          </p>
        ),
      },
      {
        id: 'audits',
        title: '10. Informations et audits',
        body: (
          <p>
            Nous vous fournissons toutes les informations nécessaires pour démontrer le respect de
            cet accord. Un audit par vous ou par un auditeur indépendant est possible moyennant un
            préavis de 30 jours, au maximum une fois par an, à vos frais et sans perturber le
            service ni les autres clients.
          </p>
        ),
      },
      {
        id: 'transferts',
        title: '11. Transferts hors de l’UE',
        body: (
          <p>
            Nous conservons les données dans l’Union européenne. Si un sous-traitant ultérieur
            devait néanmoins traiter des données hors de l’Espace économique européen, ce ne serait
            qu’avec des garanties appropriées, telles que les clauses contractuelles types de la
            Commission européenne.
          </p>
        ),
      },
      {
        id: 'divers',
        title: '12. Responsabilité et contact',
        body: (
          <p>
            La responsabilité au titre de cet accord est soumise aux limitations des conditions
            générales, dans la mesure permise par la loi. Envoyez vos questions relatives à la
            protection des données à {mail}.
          </p>
        ),
      },
    ],
  },
}
