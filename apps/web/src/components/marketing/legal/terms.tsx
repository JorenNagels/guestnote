import Link from 'next/link'
import { pagePath } from '../../../lib/marketing-pages.ts'
import { CONTACT_EMAIL } from '../../../lib/operator.ts'
import type { LegalText } from './types.ts'

/**
 * Terms of service (spec 0006). B2B only, Belgian law. Drafted 2026-09-27, not reviewed by a
 * lawyer (the user's decision). The liability section is written against the Belgian B2B
 * unfair-terms rules (WER art. VI.91/1 ff., in force 2020): it never excludes liability for
 * fraud, intent or gross negligence, which that law blacklists. Bump `TERMS_VERSION` in
 * `lib/legal.ts` with any change here.
 */

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>

export const TERMS: LegalText = {
  nl: {
    intro: (
      <p>
        Deze algemene voorwaarden gelden voor elk gebruik van Guestnote. Guestnote („wij”) is de
        handelsnaam van de onderneming vermeld op onze pagina{' '}
        <Link href={pagePath('legal', 'nl')}>Wettelijke vermeldingen</Link>. Wie een studio
        aanmaakt, aanvaardt deze voorwaarden en de{' '}
        <Link href={pagePath('dpa', 'nl')}>verwerkersovereenkomst</Link>, die er deel van uitmaakt,
        namens de onderneming waarvoor hij of zij handelt („jij”).
      </p>
    ),
    sections: [
      {
        id: 'toepassing',
        title: '1. Toepassing',
        body: (
          <>
            <p>
              Guestnote is een dienst voor professionals: weddingplanners, locaties en andere
              ondernemingen die trouwfeesten organiseren. Je verklaart dat je Guestnote gebruikt in
              het kader van je beroepsactiviteit, en niet als consument.
            </p>
            <p>
              Deze voorwaarden gaan voor op je eigen algemene voorwaarden, tenzij we schriftelijk
              anders afspreken.
            </p>
          </>
        ),
      },
      {
        id: 'dienst',
        title: '2. De dienst',
        body: (
          <>
            <p>
              Guestnote is software om trouwfeesten te plannen: bruiloften, taken, draaiboeken,
              leveranciers, budgetten en bestanden, gedeeld met je team en met leveranciers. We
              leveren de dienst online, „zoals hij is”, en ontwikkelen hem voortdurend verder.
              Functies kunnen veranderen of verdwijnen; een wijziging die je wezenlijk benadeelt,
              melden we je minstens 30 dagen op voorhand.
            </p>
            <p>
              We doen redelijke inspanningen om Guestnote beschikbaar en veilig te houden, maar
              garanderen geen ononderbroken werking en bieden geen service level agreement. We
              voeren onderhoud zoveel mogelijk buiten de kantooruren uit.
            </p>
          </>
        ),
      },
      {
        id: 'account',
        title: '3. Je account en je studio',
        body: (
          <>
            <p>
              Je studio is de ruimte van je onderneming in Guestnote. De persoon die de studio
              aanmaakt, is de eigenaar. Je bent verantwoordelijk voor wie je in je studio uitnodigt,
              voor wat je teamleden en de leveranciers aan wie je een link stuurt ermee doen, en
              voor het veilig houden van je toegangsmiddelen (passkeys, e-mailaccount, links).
            </p>
            <p>
              Meld ons meteen via {mail} als je denkt dat iemand zonder toestemming toegang heeft
              tot je studio.
            </p>
          </>
        ),
      },
      {
        id: 'prijzen',
        title: '4. Early access, proefperiode en prijzen',
        body: (
          <>
            <p>
              Zolang Guestnote in early access is, is het gebruik gratis. We laten je minstens 30
              dagen op voorhand per e-mail weten wanneer we beginnen aan te rekenen. Je beslist dan
              zelf of je een betalend abonnement neemt; zonder abonnement kunnen we de toegang tot
              je studio na afloop van de proefperiode beperken.
            </p>
            <p>
              Eenmaal de facturatie gestart is, krijgt elke studio een gratis proefperiode van één
              kalendermaand. Daarna gelden de prijzen op onze{' '}
              <Link href={pagePath('pricing', 'nl')}>prijzenpagina</Link> op het moment dat je je
              abonnement neemt. Alle prijzen zijn exclusief btw. Een prijswijziging melden we je
              minstens 30 dagen op voorhand; ze geldt vanaf je volgende facturatieperiode.
            </p>
          </>
        ),
      },
      {
        id: 'betaling',
        title: '5. Betaling',
        body: (
          <p>
            Abonnementen worden vooraf gefactureerd, per maand of per jaar. Bij laattijdige betaling
            zijn van rechtswege en zonder ingebrekestelling interesten verschuldigd volgens de wet
            van 2 augustus 2002 betreffende de bestrijding van de betalingsachterstand bij
            handelstransacties. Blijft een factuur 14 dagen na een herinnering onbetaald, dan mogen
            we de toegang tot je studio opschorten tot ze betaald is. Je gegevens blijven in die
            periode bewaard.
          </p>
        ),
      },
      {
        id: 'gegevens',
        title: '6. Jouw gegevens',
        body: (
          <>
            <p>
              Wat je in Guestnote invoert, blijft van jou. Je geeft ons enkel het recht om het te
              bewaren, te verwerken en te tonen voor zover nodig om de dienst te leveren. Voor
              persoonsgegevens van je koppels, gasten en leveranciers treden wij op als verwerker en
              geldt onze <Link href={pagePath('dpa', 'nl')}>verwerkersovereenkomst</Link>. Hoe we
              omgaan met gegevens over jou en je team, lees je in onze{' '}
              <Link href={pagePath('privacy', 'nl')}>privacyverklaring</Link>.
            </p>
            <p>
              Je bent zelf verantwoordelijk voor de rechtmatigheid van wat je invoert, en voor het
              informeren van je koppels en hun gasten over het gebruik van Guestnote.
            </p>
          </>
        ),
      },
      {
        id: 'gebruik',
        title: '7. Aanvaardbaar gebruik',
        body: (
          <>
            <p>Je gebruikt Guestnote niet om:</p>
            <ul>
              <li>iets onwettigs te doen, of inhoud op te laden waarop je geen rechten hebt;</li>
              <li>malware te verspreiden of de dienst te overbelasten;</li>
              <li>
                toegang te proberen krijgen tot gegevens van een andere studio, of beveiliging te
                omzeilen;
              </li>
              <li>de dienst door te verkopen of er een concurrerend product mee te bouwen.</li>
            </ul>
            <p>
              Bij een ernstige inbreuk mogen we de toegang onmiddellijk opschorten. We laten je
              weten waarom.
            </p>
          </>
        ),
      },
      {
        id: 'ie',
        title: '8. Intellectuele eigendom',
        body: (
          <p>
            De software, het ontwerp en de merknaam Guestnote blijven van ons. Je krijgt een
            niet-exclusief, niet-overdraagbaar recht om Guestnote te gebruiken zolang je account
            loopt. Suggesties die je ons geeft, mogen we vrij gebruiken om het product te
            verbeteren.
          </p>
        ),
      },
      {
        id: 'aansprakelijkheid',
        title: '9. Aansprakelijkheid',
        body: (
          <>
            <p>
              Onze totale aansprakelijkheid voor alle schade in verband met Guestnote is beperkt tot
              het bedrag dat je ons betaalde in de twaalf maanden voor het schadegeval, en tot 100
              euro zolang je Guestnote gratis gebruikt. We zijn niet aansprakelijk voor indirecte
              schade, zoals gederfde winst, verlies van klanten of reputatieschade.
            </p>
            <p>
              Deze beperkingen gelden niet voor schade door bedrog, opzet of zware fout van onze
              kant, en niet voor zover de wet ze niet toelaat.
            </p>
            <p>
              Guestnote ondersteunt je planning, maar vervangt je professionele oordeel niet. Je
              blijft verantwoordelijk voor de afspraken met je koppels en leveranciers.
            </p>
          </>
        ),
      },
      {
        id: 'duur',
        title: '10. Duur en opzegging',
        body: (
          <>
            <p>
              Je overeenkomst loopt voor onbepaalde duur. Je kunt altijd opzeggen; een betaald
              abonnement loopt dan tot het einde van de lopende periode, zonder terugbetaling. Wij
              kunnen opzeggen met een termijn van 30 dagen, of onmiddellijk bij een ernstige inbreuk
              op deze voorwaarden.
            </p>
            <p>
              Na het einde bezorgen we je op vraag, binnen 30 dagen, een export van je gegevens.
              Uiterlijk 90 dagen na het einde verwijderen we je studio en haar gegevens, behalve wat
              we wettelijk moeten bewaren.
            </p>
          </>
        ),
      },
      {
        id: 'wijzigingen',
        title: '11. Wijzigingen van deze voorwaarden',
        body: (
          <p>
            We kunnen deze voorwaarden wijzigen. We melden dat minstens 30 dagen op voorhand per
            e-mail aan de eigenaar van je studio. Ga je niet akkoord, dan kun je opzeggen voor de
            wijziging ingaat. Blijf je Guestnote daarna gebruiken, dan geldt de nieuwe versie.
          </p>
        ),
      },
      {
        id: 'overmacht',
        title: '12. Overmacht',
        body: (
          <p>
            We zijn niet aansprakelijk voor een tekortkoming door omstandigheden buiten onze
            redelijke controle, zoals een storing bij een hostingpartner, een grootschalige
            internetstoring, een cyberaanval of een beslissing van een overheid.
          </p>
        ),
      },
      {
        id: 'recht',
        title: '13. Toepasselijk recht en bevoegde rechter',
        body: (
          <p>
            Op deze voorwaarden is het Belgisch recht van toepassing. We proberen elk geschil eerst
            in onderling overleg op te lossen. Lukt dat niet, dan zijn uitsluitend de rechtbanken
            van het gerechtelijk arrondissement van onze vestiging bevoegd.
          </p>
        ),
      },
      {
        id: 'contact',
        title: '14. Contact',
        body: <p>Vragen over deze voorwaarden? Mail ons via {mail}.</p>,
      },
    ],
  },
  en: {
    intro: (
      <p>
        These terms apply to every use of Guestnote. Guestnote (“we”) is the trade name of the
        business listed on our <Link href={pagePath('legal', 'en')}>legal notice</Link>. Whoever
        creates a studio accepts these terms and the{' '}
        <Link href={pagePath('dpa', 'en')}>data processing agreement</Link>, which forms part of
        them, on behalf of the business they act for (“you”).
      </p>
    ),
    sections: [
      {
        id: 'scope',
        title: '1. Scope',
        body: (
          <>
            <p>
              Guestnote is a service for professionals: wedding planners, venues and other
              businesses that organise weddings. You confirm that you use Guestnote in the course of
              your business, and not as a consumer.
            </p>
            <p>
              These terms take precedence over your own terms and conditions unless we agree
              otherwise in writing.
            </p>
          </>
        ),
      },
      {
        id: 'service',
        title: '2. The service',
        body: (
          <>
            <p>
              Guestnote is software for planning weddings: weddings, tasks, run sheets, vendors,
              budgets and files, shared with your team and with vendors. We provide it online, “as
              is”, and keep developing it. Features may change or be removed; we give you at least
              30 days’ notice of a change that materially disadvantages you.
            </p>
            <p>
              We make reasonable efforts to keep Guestnote available and secure, but do not
              guarantee uninterrupted operation and offer no service level agreement. We schedule
              maintenance outside office hours where we can.
            </p>
          </>
        ),
      },
      {
        id: 'account',
        title: '3. Your account and your studio',
        body: (
          <>
            <p>
              Your studio is your business’s space in Guestnote. The person who creates it is its
              owner. You are responsible for whom you invite into your studio, for what your team
              and the vendors you send links to do with it, and for keeping your means of access
              safe (passkeys, email account, links).
            </p>
            <p>
              Tell us immediately at {mail} if you believe someone has access to your studio without
              permission.
            </p>
          </>
        ),
      },
      {
        id: 'pricing',
        title: '4. Early access, trial and prices',
        body: (
          <>
            <p>
              While Guestnote is in early access, it is free to use. We will email you at least 30
              days before we start charging. You then decide whether to take a paid subscription;
              without one, we may restrict access to your studio after the trial ends.
            </p>
            <p>
              Once billing has started, every studio gets a free trial of one calendar month. After
              that, the prices on our <Link href={pagePath('pricing', 'en')}>pricing page</Link> at
              the time you subscribe apply. All prices exclude VAT. We give at least 30 days’ notice
              of a price change; it applies from your next billing period.
            </p>
          </>
        ),
      },
      {
        id: 'payment',
        title: '5. Payment',
        body: (
          <p>
            Subscriptions are invoiced in advance, monthly or yearly. Late payment automatically
            bears interest, without notice of default, under the Belgian Act of 2 August 2002 on
            combating late payment in commercial transactions. If an invoice remains unpaid 14 days
            after a reminder, we may suspend access to your studio until it is paid. Your data is
            kept during that time.
          </p>
        ),
      },
      {
        id: 'data',
        title: '6. Your data',
        body: (
          <>
            <p>
              What you put into Guestnote remains yours. You only give us the right to store,
              process and display it as far as needed to provide the service. For personal data of
              your couples, guests and vendors we act as a processor, and our{' '}
              <Link href={pagePath('dpa', 'en')}>data processing agreement</Link> applies. How we
              handle data about you and your team is set out in our{' '}
              <Link href={pagePath('privacy', 'en')}>privacy policy</Link>.
            </p>
            <p>
              You are responsible for the lawfulness of what you enter, and for informing your
              couples and their guests that you use Guestnote.
            </p>
          </>
        ),
      },
      {
        id: 'use',
        title: '7. Acceptable use',
        body: (
          <>
            <p>You do not use Guestnote to:</p>
            <ul>
              <li>do anything unlawful, or upload content you have no rights to;</li>
              <li>spread malware or overload the service;</li>
              <li>try to access another studio’s data, or get around security;</li>
              <li>resell the service or build a competing product with it.</li>
            </ul>
            <p>For a serious breach we may suspend access immediately. We will tell you why.</p>
          </>
        ),
      },
      {
        id: 'ip',
        title: '8. Intellectual property',
        body: (
          <p>
            The software, the design and the Guestnote name remain ours. You get a non-exclusive,
            non-transferable right to use Guestnote for as long as your account runs. We may freely
            use suggestions you give us to improve the product.
          </p>
        ),
      },
      {
        id: 'liability',
        title: '9. Liability',
        body: (
          <>
            <p>
              Our total liability for all damage in connection with Guestnote is limited to the
              amount you paid us in the twelve months before the event giving rise to it, and to 100
              euros while you use Guestnote for free. We are not liable for indirect damage, such as
              lost profit, lost clients or reputational harm.
            </p>
            <p>
              These limits do not apply to damage caused by fraud, intent or gross negligence on our
              part, nor to the extent the law does not allow them.
            </p>
            <p>
              Guestnote supports your planning but does not replace your professional judgement. You
              remain responsible for your arrangements with your couples and vendors.
            </p>
          </>
        ),
      },
      {
        id: 'term',
        title: '10. Term and termination',
        body: (
          <>
            <p>
              Your agreement runs for an indefinite period. You can cancel at any time; a paid
              subscription then runs to the end of the current period, without refund. We can
              terminate with 30 days’ notice, or immediately for a serious breach of these terms.
            </p>
            <p>
              After the end, we provide an export of your data on request, within 30 days. No later
              than 90 days after the end we delete your studio and its data, except what we are
              legally required to keep.
            </p>
          </>
        ),
      },
      {
        id: 'changes',
        title: '11. Changes to these terms',
        body: (
          <p>
            We may change these terms. We will email your studio’s owner at least 30 days before a
            change takes effect. If you do not agree, you can cancel before it does. If you keep
            using Guestnote after that, the new version applies.
          </p>
        ),
      },
      {
        id: 'force-majeure',
        title: '12. Force majeure',
        body: (
          <p>
            We are not liable for a failure caused by circumstances beyond our reasonable control,
            such as an outage at a hosting partner, a large-scale internet failure, a cyberattack or
            a government decision.
          </p>
        ),
      },
      {
        id: 'law',
        title: '13. Governing law and jurisdiction',
        body: (
          <p>
            These terms are governed by Belgian law. We first try to resolve any dispute together.
            If that fails, the courts of the judicial district of our place of business have
            exclusive jurisdiction.
          </p>
        ),
      },
      {
        id: 'contact',
        title: '14. Contact',
        body: <p>Questions about these terms? Email us at {mail}.</p>,
      },
    ],
  },
  fr: {
    intro: (
      <p>
        Les présentes conditions générales s’appliquent à toute utilisation de Guestnote. Guestnote
        (« nous ») est le nom commercial de l’entreprise mentionnée dans nos{' '}
        <Link href={pagePath('legal', 'fr')}>mentions légales</Link>. Quiconque crée un studio
        accepte ces conditions et l’
        <Link href={pagePath('dpa', 'fr')}>accord de traitement des données</Link>, qui en fait
        partie, au nom de l’entreprise pour laquelle il ou elle agit (« vous »).
      </p>
    ),
    sections: [
      {
        id: 'champ',
        title: '1. Champ d’application',
        body: (
          <>
            <p>
              Guestnote est un service destiné aux professionnels : wedding planners, lieux de
              réception et autres entreprises qui organisent des mariages. Vous déclarez utiliser
              Guestnote dans le cadre de votre activité professionnelle, et non en tant que
              consommateur.
            </p>
            <p>
              Ces conditions prévalent sur vos propres conditions générales, sauf accord écrit
              contraire.
            </p>
          </>
        ),
      },
      {
        id: 'service',
        title: '2. Le service',
        body: (
          <>
            <p>
              Guestnote est un logiciel de planification de mariages : mariages, tâches, déroulés,
              prestataires, budgets et fichiers, partagés avec votre équipe et vos prestataires.
              Nous le fournissons en ligne, « en l’état », et continuons à le développer. Des
              fonctionnalités peuvent changer ou disparaître ; nous vous prévenons au moins 30 jours
              à l’avance de tout changement qui vous désavantage de manière significative.
            </p>
            <p>
              Nous faisons des efforts raisonnables pour que Guestnote reste disponible et sûr, mais
              ne garantissons pas un fonctionnement ininterrompu et n’offrons pas de contrat de
              niveau de service. Nous effectuons la maintenance autant que possible en dehors des
              heures de bureau.
            </p>
          </>
        ),
      },
      {
        id: 'compte',
        title: '3. Votre compte et votre studio',
        body: (
          <>
            <p>
              Votre studio est l’espace de votre entreprise dans Guestnote. La personne qui le crée
              en est le propriétaire. Vous êtes responsable des personnes que vous invitez dans
              votre studio, de ce que votre équipe et les prestataires à qui vous envoyez un lien en
              font, et de la sécurité de vos moyens d’accès (clés d’accès, compte e-mail, liens).
            </p>
            <p>
              Prévenez-nous immédiatement à {mail} si vous pensez que quelqu’un accède à votre
              studio sans autorisation.
            </p>
          </>
        ),
      },
      {
        id: 'prix',
        title: '4. Accès anticipé, période d’essai et prix',
        body: (
          <>
            <p>
              Tant que Guestnote est en accès anticipé, son utilisation est gratuite. Nous vous
              prévenons par e-mail au moins 30 jours avant de commencer à facturer. Vous décidez
              alors de souscrire ou non un abonnement payant ; sans abonnement, nous pouvons
              restreindre l’accès à votre studio à la fin de la période d’essai.
            </p>
            <p>
              Une fois la facturation lancée, chaque studio bénéficie d’un essai gratuit d’un mois
              calendrier. Ensuite, les prix de notre{' '}
              <Link href={pagePath('pricing', 'fr')}>page tarifs</Link> au moment de votre
              souscription s’appliquent. Tous les prix s’entendent hors TVA. Nous annonçons toute
              modification de prix au moins 30 jours à l’avance ; elle s’applique à partir de votre
              période de facturation suivante.
            </p>
          </>
        ),
      },
      {
        id: 'paiement',
        title: '5. Paiement',
        body: (
          <p>
            Les abonnements sont facturés à l’avance, mensuellement ou annuellement. Tout retard de
            paiement produit de plein droit et sans mise en demeure des intérêts conformément à la
            loi du 2 août 2002 concernant la lutte contre le retard de paiement dans les
            transactions commerciales. Si une facture reste impayée 14 jours après un rappel, nous
            pouvons suspendre l’accès à votre studio jusqu’à son paiement. Vos données sont
            conservées pendant cette période.
          </p>
        ),
      },
      {
        id: 'donnees',
        title: '6. Vos données',
        body: (
          <>
            <p>
              Ce que vous saisissez dans Guestnote vous appartient. Vous nous accordez uniquement le
              droit de le stocker, de le traiter et de l’afficher dans la mesure nécessaire à la
              fourniture du service. Pour les données personnelles de vos couples, invités et
              prestataires, nous agissons en tant que sous-traitant et notre{' '}
              <Link href={pagePath('dpa', 'fr')}>accord de traitement des données</Link> s’applique.
              La manière dont nous traitons les données vous concernant, vous et votre équipe, est
              décrite dans notre{' '}
              <Link href={pagePath('privacy', 'fr')}>politique de confidentialité</Link>.
            </p>
            <p>
              Vous êtes responsable de la licéité de ce que vous saisissez, et d’informer vos
              couples et leurs invités de votre utilisation de Guestnote.
            </p>
          </>
        ),
      },
      {
        id: 'usage',
        title: '7. Utilisation acceptable',
        body: (
          <>
            <p>Vous n’utilisez pas Guestnote pour :</p>
            <ul>
              <li>
                faire quoi que ce soit d’illégal, ou téléverser un contenu sur lequel vous n’avez
                pas de droits ;
              </li>
              <li>diffuser des logiciels malveillants ou surcharger le service ;</li>
              <li>tenter d’accéder aux données d’un autre studio, ou contourner la sécurité ;</li>
              <li>revendre le service ou construire un produit concurrent avec celui-ci.</li>
            </ul>
            <p>
              En cas de manquement grave, nous pouvons suspendre l’accès immédiatement. Nous vous en
              indiquerons la raison.
            </p>
          </>
        ),
      },
      {
        id: 'pi',
        title: '8. Propriété intellectuelle',
        body: (
          <p>
            Le logiciel, le design et le nom Guestnote restent notre propriété. Vous recevez un
            droit non exclusif et non transférable d’utiliser Guestnote tant que votre compte est
            actif. Nous pouvons librement utiliser les suggestions que vous nous faites pour
            améliorer le produit.
          </p>
        ),
      },
      {
        id: 'responsabilite',
        title: '9. Responsabilité',
        body: (
          <>
            <p>
              Notre responsabilité totale pour tout dommage lié à Guestnote est limitée au montant
              que vous nous avez payé au cours des douze mois précédant le fait dommageable, et à
              100 euros tant que vous utilisez Guestnote gratuitement. Nous ne sommes pas
              responsables des dommages indirects, tels que le manque à gagner, la perte de clients
              ou l’atteinte à la réputation.
            </p>
            <p>
              Ces limitations ne s’appliquent pas aux dommages causés par un dol, une faute
              intentionnelle ou une faute grave de notre part, ni dans la mesure où la loi ne les
              autorise pas.
            </p>
            <p>
              Guestnote soutient votre planification mais ne remplace pas votre jugement
              professionnel. Vous restez responsable de vos engagements envers vos couples et vos
              prestataires.
            </p>
          </>
        ),
      },
      {
        id: 'duree',
        title: '10. Durée et résiliation',
        body: (
          <>
            <p>
              Votre contrat est conclu pour une durée indéterminée. Vous pouvez résilier à tout
              moment ; un abonnement payant court alors jusqu’à la fin de la période en cours, sans
              remboursement. Nous pouvons résilier moyennant un préavis de 30 jours, ou
              immédiatement en cas de manquement grave à ces conditions.
            </p>
            <p>
              Après la fin du contrat, nous vous fournissons sur demande, dans les 30 jours, un
              export de vos données. Au plus tard 90 jours après la fin, nous supprimons votre
              studio et ses données, sauf ce que la loi nous oblige à conserver.
            </p>
          </>
        ),
      },
      {
        id: 'modifications',
        title: '11. Modification des présentes conditions',
        body: (
          <p>
            Nous pouvons modifier ces conditions. Nous en informons le propriétaire de votre studio
            par e-mail au moins 30 jours à l’avance. Si vous n’êtes pas d’accord, vous pouvez
            résilier avant l’entrée en vigueur. Si vous continuez à utiliser Guestnote ensuite, la
            nouvelle version s’applique.
          </p>
        ),
      },
      {
        id: 'force-majeure',
        title: '12. Force majeure',
        body: (
          <p>
            Nous ne sommes pas responsables d’un manquement dû à des circonstances échappant à notre
            contrôle raisonnable, telles qu’une panne chez un hébergeur, une panne internet de
            grande ampleur, une cyberattaque ou une décision des autorités.
          </p>
        ),
      },
      {
        id: 'droit',
        title: '13. Droit applicable et juridiction compétente',
        body: (
          <p>
            Ces conditions sont régies par le droit belge. Nous tentons d’abord de résoudre tout
            litige à l’amiable. À défaut, les tribunaux de l’arrondissement judiciaire de notre
            établissement sont seuls compétents.
          </p>
        ),
      },
      {
        id: 'contact',
        title: '14. Contact',
        body: <p>Des questions sur ces conditions ? Écrivez-nous à {mail}.</p>,
      },
    ],
  },
}
