import Link from 'next/link'
import { pagePath } from '../../../lib/marketing-pages.ts'
import { CONTACT_EMAIL } from '../../../lib/operator.ts'
import type { LegalText } from './types.ts'

/**
 * Privacy policy (spec 0006). Guestnote as CONTROLLER -- for planner accounts, the website,
 * logs, mail delivery and support. What planners enter about couples, guests and vendors is
 * processor territory and lives in the DPA; this page says so and points there. Drafted
 * 2026-09-27, not reviewed by a lawyer. Every data category here is one the code actually
 * holds: `users`/`sessions`/`passkeys` (Better Auth), `mail_deliveries`, Sentry (server-only,
 * `sendDefaultPii` off, plus "Report a problem" with its optional screenshot).
 *
 * The retention periods are commitments with no mechanism behind them -- no purge job, no
 * deletion flow; each is a manual task for the operator (spec 0006, "Still open"). "Up to 90
 * days" for logs is the longer of CloudWatch's one month (`sst.config.ts`) and Sentry's plan
 * retention, reasoned on 2026-09-27, not measured.
 */

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
const gba = {
  nl: <a href="https://www.gegevensbeschermingsautoriteit.be">Gegevensbeschermingsautoriteit</a>,
  en: <a href="https://www.dataprotectionauthority.be">Data Protection Authority</a>,
  fr: <a href="https://www.autoriteprotectiondonnees.be">Autorité de protection des données</a>,
}

export const PRIVACY: LegalText = {
  nl: {
    intro: (
      <p>
        Deze verklaring legt uit welke persoonsgegevens Guestnote verwerkt over jou als gebruiker en
        als bezoeker van onze website, waarom, en welke rechten je hebt. Guestnote is daarvoor de
        verwerkingsverantwoordelijke; onze gegevens staan op de pagina{' '}
        <Link href={pagePath('legal', 'nl')}>Wettelijke vermeldingen</Link>.
      </p>
    ),
    sections: [
      {
        id: 'rollen',
        title: '1. Twee rollen',
        body: (
          <p>
            Voor je account, je studio en je gebruik van Guestnote zijn wij verantwoordelijk. Voor
            de gegevens die jij als planner invoert over koppels, gasten en leveranciers ben jij de
            verantwoordelijke en zijn wij verwerker; daarvoor geldt onze{' '}
            <Link href={pagePath('dpa', 'nl')}>verwerkersovereenkomst</Link>. Ben je een koppel,
            gast of leverancier, neem dan voor vragen over je gegevens eerst contact op met de
            planner die je in Guestnote heeft opgenomen.
          </p>
        ),
      },
      {
        id: 'gegevens',
        title: '2. Welke gegevens we verwerken',
        body: (
          <ul>
            <li>
              <strong>Account:</strong> je naam, je e-mailadres, de publieke sleutel van je
              passkeys, en je sessies (met IP-adres en browsergegevens, om ze te beveiligen).
            </li>
            <li>
              <strong>Studio:</strong> de naam en het logo van je studio, en wie er lid van is en
              met welke rol.
            </li>
            <li>
              <strong>Technische gegevens:</strong> serverlogs en foutmeldingen met tijdstip,
              IP-adres en de gevraagde pagina, om de dienst te laten werken en fouten op te lossen.
            </li>
            <li>
              <strong>E-mail:</strong> de e-mails die we je sturen (zoals inlogcodes en
              uitnodigingen) en of ze afgeleverd werden.
            </li>
            <li>
              <strong>Support:</strong> wat je ons meldt via „Meld een probleem”, eventueel met een
              schermafbeelding, en je e-mails aan ons.
            </li>
            <li>
              <strong>Facturatie:</strong> zodra de facturatie start, de facturatiegegevens van je
              onderneming.
            </li>
          </ul>
        ),
      },
      {
        id: 'doelen',
        title: '3. Waarom, en op welke grond',
        body: (
          <ul>
            <li>
              Om de dienst te leveren waarvoor je een account aanmaakte: uitvoering van de
              overeenkomst (art. 6.1.b AVG).
            </li>
            <li>
              Om Guestnote te beveiligen, misbruik te voorkomen en fouten op te lossen: ons
              gerechtvaardigd belang bij een veilige en werkende dienst (art. 6.1.f AVG).
            </li>
            <li>
              Om te factureren en onze boekhouding te voeren: een wettelijke verplichting (art.
              6.1.c AVG).
            </li>
            <li>
              Om je te informeren over wijzigingen aan de dienst, de prijzen of deze voorwaarden:
              uitvoering van de overeenkomst. We sturen je geen reclame zonder je toestemming.
            </li>
          </ul>
        ),
      },
      {
        id: 'bewaring',
        title: '4. Hoe lang we bewaren',
        body: (
          <ul>
            <li>Account- en studiogegevens: zolang je account bestaat, en tot 90 dagen daarna.</li>
            <li>Serverlogs en foutmeldingen: maximaal 90 dagen.</li>
            <li>
              Gegevens over de aflevering van e-mails: zolang je account bestaat, en tot 90 dagen
              daarna.
            </li>
            <li>
              Facturen en boekhoudstukken: zolang de boekhoud- en btw-wetgeving dat vereist (tot 10
              jaar).
            </li>
          </ul>
        ),
      },
      {
        id: 'ontvangers',
        title: '5. Met wie we gegevens delen',
        body: (
          <p>
            We verkopen geen gegevens en gebruiken ze niet voor reclame. We werken met een beperkt
            aantal dienstverleners voor hosting, e-mail en foutopvolging. Zij verwerken gegevens
            enkel in onze opdracht; de volledige lijst staat op onze pagina{' '}
            <Link href={pagePath('subprocessors', 'nl')}>subverwerkers</Link>.
          </p>
        ),
      },
      {
        id: 'doorgifte',
        title: '6. Waar je gegevens staan',
        body: (
          <p>
            Guestnote draait in de Europese Unie (Frankfurt). Enkele van onze dienstverleners hebben
            een moederbedrijf buiten de EU; waar dat tot een doorgifte kan leiden, steunen we op de
            standaardcontractbepalingen van de Europese Commissie of het EU-VS Data Privacy
            Framework. Log je in met Google, dan verwerkt Google je gegevens volgens zijn eigen
            privacybeleid.
          </p>
        ),
      },
      {
        id: 'beveiliging',
        title: '7. Beveiliging',
        body: (
          <p>
            Verbindingen zijn versleuteld, gegevens worden versleuteld opgeslagen, en de gegevens
            van elke studio zijn in de database van die van andere studio’s afgeschermd. Er zijn
            geen wachtwoorden: je logt in met een passkey of een eenmalige code.
          </p>
        ),
      },
      {
        id: 'rechten',
        title: '8. Je rechten',
        body: (
          <>
            <p>
              Je hebt het recht op inzage, verbetering, wissing, beperking van de verwerking,
              overdraagbaarheid en bezwaar. Mail ons via {mail}; we antwoorden binnen een maand.
            </p>
            <p>
              Ben je niet tevreden over hoe we met je gegevens omgaan, dan kun je een klacht
              indienen bij de {gba.nl}, Drukpersstraat 35, 1000 Brussel.
            </p>
          </>
        ),
      },
      {
        id: 'cookies',
        title: '9. Cookies',
        body: (
          <p>
            We gebruiken alleen cookies die strikt nodig zijn. Meer daarover op onze{' '}
            <Link href={pagePath('cookies', 'nl')}>cookiepagina</Link>.
          </p>
        ),
      },
      {
        id: 'wijzigingen',
        title: '10. Wijzigingen',
        body: (
          <p>
            We passen deze verklaring aan wanneer onze verwerking verandert. De datum bovenaan toont
            de laatste versie; belangrijke wijzigingen melden we je per e-mail.
          </p>
        ),
      },
    ],
  },
  en: {
    intro: (
      <p>
        This policy explains which personal data Guestnote processes about you as a user and as a
        visitor to our website, why, and what rights you have. Guestnote is the controller for this;
        our details are on our <Link href={pagePath('legal', 'en')}>legal notice</Link>.
      </p>
    ),
    sections: [
      {
        id: 'roles',
        title: '1. Two roles',
        body: (
          <p>
            For your account, your studio and your use of Guestnote, we are responsible. For the
            data you enter as a planner about couples, guests and vendors, you are the controller
            and we are the processor; our{' '}
            <Link href={pagePath('dpa', 'en')}>data processing agreement</Link> covers that. If you
            are a couple, guest or vendor, please contact the planner who added you to Guestnote
            first with questions about your data.
          </p>
        ),
      },
      {
        id: 'data',
        title: '2. What data we process',
        body: (
          <ul>
            <li>
              <strong>Account:</strong> your name, your email address, the public key of your
              passkeys, and your sessions (with IP address and browser details, to secure them).
            </li>
            <li>
              <strong>Studio:</strong> your studio’s name and logo, and who its members are and in
              which role.
            </li>
            <li>
              <strong>Technical data:</strong> server logs and error reports with time, IP address
              and the page requested, to run the service and fix faults.
            </li>
            <li>
              <strong>Email:</strong> the emails we send you (such as sign-in codes and invitations)
              and whether they were delivered.
            </li>
            <li>
              <strong>Support:</strong> what you report through “Report a problem”, optionally with
              a screenshot, and your emails to us.
            </li>
            <li>
              <strong>Billing:</strong> once billing starts, your business’s billing details.
            </li>
          </ul>
        ),
      },
      {
        id: 'purposes',
        title: '3. Why, and on what basis',
        body: (
          <ul>
            <li>
              To provide the service you created an account for: performance of the contract (Art.
              6(1)(b) GDPR).
            </li>
            <li>
              To secure Guestnote, prevent abuse and fix faults: our legitimate interest in a safe
              and working service (Art. 6(1)(f) GDPR).
            </li>
            <li>To invoice and keep our accounts: a legal obligation (Art. 6(1)(c) GDPR).</li>
            <li>
              To tell you about changes to the service, prices or these terms: performance of the
              contract. We do not send you marketing without your consent.
            </li>
          </ul>
        ),
      },
      {
        id: 'retention',
        title: '4. How long we keep it',
        body: (
          <ul>
            <li>
              Account and studio data: as long as your account exists, and up to 90 days after.
            </li>
            <li>Server logs and error reports: up to 90 days.</li>
            <li>Email delivery data: as long as your account exists, and up to 90 days after.</li>
            <li>
              Invoices and accounting records: as long as accounting and VAT law requires (up to 10
              years).
            </li>
          </ul>
        ),
      },
      {
        id: 'recipients',
        title: '5. Who we share data with',
        body: (
          <p>
            We do not sell data or use it for advertising. We work with a small number of service
            providers for hosting, email and error tracking. They process data only on our
            instructions; the full list is on our{' '}
            <Link href={pagePath('subprocessors', 'en')}>subprocessors</Link> page.
          </p>
        ),
      },
      {
        id: 'transfers',
        title: '6. Where your data is',
        body: (
          <p>
            Guestnote runs in the European Union (Frankfurt). Some of our providers have a parent
            company outside the EU; where that could lead to a transfer, we rely on the European
            Commission’s standard contractual clauses or the EU-US Data Privacy Framework. If you
            sign in with Google, Google processes your data under its own privacy policy.
          </p>
        ),
      },
      {
        id: 'security',
        title: '7. Security',
        body: (
          <p>
            Connections are encrypted, data is encrypted at rest, and each studio’s data is walled
            off from every other studio’s in the database. There are no passwords: you sign in with
            a passkey or a one-time code.
          </p>
        ),
      },
      {
        id: 'rights',
        title: '8. Your rights',
        body: (
          <>
            <p>
              You have the right of access, rectification, erasure, restriction, portability and
              objection. Email us at {mail}; we reply within one month.
            </p>
            <p>
              If you are unhappy with how we handle your data, you can lodge a complaint with the
              Belgian {gba.en}, Rue de la Presse 35, 1000 Brussels.
            </p>
          </>
        ),
      },
      {
        id: 'cookies',
        title: '9. Cookies',
        body: (
          <p>
            We only use strictly necessary cookies. More on our{' '}
            <Link href={pagePath('cookies', 'en')}>cookie page</Link>.
          </p>
        ),
      },
      {
        id: 'changes',
        title: '10. Changes',
        body: (
          <p>
            We update this policy when our processing changes. The date at the top shows the latest
            version; we email you about significant changes.
          </p>
        ),
      },
    ],
  },
  fr: {
    intro: (
      <p>
        Cette politique explique quelles données personnelles Guestnote traite à votre sujet en tant
        qu’utilisateur et visiteur de notre site, pourquoi, et quels sont vos droits. Guestnote en
        est le responsable du traitement ; nos coordonnées figurent dans nos{' '}
        <Link href={pagePath('legal', 'fr')}>mentions légales</Link>.
      </p>
    ),
    sections: [
      {
        id: 'roles',
        title: '1. Deux rôles',
        body: (
          <p>
            Pour votre compte, votre studio et votre utilisation de Guestnote, nous sommes
            responsables. Pour les données que vous saisissez en tant que planner sur des couples,
            invités et prestataires, vous êtes le responsable du traitement et nous sommes
            sous-traitant ; notre{' '}
            <Link href={pagePath('dpa', 'fr')}>accord de traitement des données</Link> s’applique.
            Si vous êtes un couple, un invité ou un prestataire, adressez d’abord vos questions sur
            vos données au planner qui vous a ajouté dans Guestnote.
          </p>
        ),
      },
      {
        id: 'donnees',
        title: '2. Les données que nous traitons',
        body: (
          <ul>
            <li>
              <strong>Compte :</strong> votre nom, votre adresse e-mail, la clé publique de vos clés
              d’accès, et vos sessions (avec adresse IP et informations du navigateur, pour les
              sécuriser).
            </li>
            <li>
              <strong>Studio :</strong> le nom et le logo de votre studio, ses membres et leur rôle.
            </li>
            <li>
              <strong>Données techniques :</strong> journaux serveur et rapports d’erreur avec
              l’heure, l’adresse IP et la page demandée, pour faire fonctionner le service et
              corriger les erreurs.
            </li>
            <li>
              <strong>E-mail :</strong> les e-mails que nous vous envoyons (codes de connexion,
              invitations) et leur bonne délivrance.
            </li>
            <li>
              <strong>Support :</strong> ce que vous signalez via « Signaler un problème »,
              éventuellement avec une capture d’écran, et vos e-mails.
            </li>
            <li>
              <strong>Facturation :</strong> dès le début de la facturation, les données de
              facturation de votre entreprise.
            </li>
          </ul>
        ),
      },
      {
        id: 'finalites',
        title: '3. Pourquoi, et sur quelle base',
        body: (
          <ul>
            <li>
              Pour fournir le service pour lequel vous avez créé un compte : exécution du contrat
              (art. 6.1.b RGPD).
            </li>
            <li>
              Pour sécuriser Guestnote, prévenir les abus et corriger les erreurs : notre intérêt
              légitime à un service sûr et fonctionnel (art. 6.1.f RGPD).
            </li>
            <li>
              Pour facturer et tenir notre comptabilité : une obligation légale (art. 6.1.c RGPD).
            </li>
            <li>
              Pour vous informer des changements du service, des prix ou de ces conditions :
              exécution du contrat. Nous ne vous envoyons pas de publicité sans votre consentement.
            </li>
          </ul>
        ),
      },
      {
        id: 'conservation',
        title: '4. Durée de conservation',
        body: (
          <ul>
            <li>
              Données de compte et de studio : tant que votre compte existe, et jusqu’à 90 jours
              après.
            </li>
            <li>Journaux serveur et rapports d’erreur : 90 jours maximum.</li>
            <li>
              Données de délivrance des e-mails : tant que votre compte existe, et jusqu’à 90 jours
              après.
            </li>
            <li>
              Factures et pièces comptables : aussi longtemps que l’exige la législation comptable
              et TVA (jusqu’à 10 ans).
            </li>
          </ul>
        ),
      },
      {
        id: 'destinataires',
        title: '5. Avec qui nous partageons des données',
        body: (
          <p>
            Nous ne vendons pas de données et ne les utilisons pas à des fins publicitaires. Nous
            travaillons avec un nombre limité de prestataires pour l’hébergement, l’e-mail et le
            suivi des erreurs. Ils ne traitent les données que sur nos instructions ; la liste
            complète figure sur notre page{' '}
            <Link href={pagePath('subprocessors', 'fr')}>sous-traitants</Link>.
          </p>
        ),
      },
      {
        id: 'transferts',
        title: '6. Où se trouvent vos données',
        body: (
          <p>
            Guestnote fonctionne dans l’Union européenne (Francfort). Certains de nos prestataires
            ont une société mère hors de l’UE ; lorsque cela peut entraîner un transfert, nous nous
            appuyons sur les clauses contractuelles types de la Commission européenne ou sur le Data
            Privacy Framework UE-États-Unis. Si vous vous connectez avec Google, Google traite vos
            données selon sa propre politique de confidentialité.
          </p>
        ),
      },
      {
        id: 'securite',
        title: '7. Sécurité',
        body: (
          <p>
            Les connexions sont chiffrées, les données sont chiffrées au repos, et les données de
            chaque studio sont cloisonnées de celles des autres dans la base de données. Il n’y a
            pas de mot de passe : vous vous connectez avec une clé d’accès ou un code à usage
            unique.
          </p>
        ),
      },
      {
        id: 'droits',
        title: '8. Vos droits',
        body: (
          <>
            <p>
              Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation, de
              portabilité et d’opposition. Écrivez-nous à {mail} ; nous répondons dans un délai d’un
              mois.
            </p>
            <p>
              Si vous n’êtes pas satisfait de la manière dont nous traitons vos données, vous pouvez
              introduire une plainte auprès de l’{gba.fr}, rue de la Presse 35, 1000 Bruxelles.
            </p>
          </>
        ),
      },
      {
        id: 'cookies',
        title: '9. Cookies',
        body: (
          <p>
            Nous n’utilisons que des cookies strictement nécessaires. Plus d’informations sur notre{' '}
            <Link href={pagePath('cookies', 'fr')}>page cookies</Link>.
          </p>
        ),
      },
      {
        id: 'modifications',
        title: '10. Modifications',
        body: (
          <p>
            Nous mettons cette politique à jour lorsque nos traitements changent. La date en haut de
            page indique la dernière version ; nous vous informons par e-mail des changements
            importants.
          </p>
        ),
      },
    ],
  },
}
