import { CONTACT_EMAIL } from '../../../lib/operator.ts'
import type { LegalText } from './types.ts'

/**
 * Accessibility statement (spec 0006). The European Accessibility Act gives Belgian
 * micro-enterprises a transition to 2030 rather than an exemption; a statement and a stated
 * target cost little now. Honest about the gaps: there is no external audit, and the vendor link
 * and dashboard were built to the brief's contrast and focus rules but not tested with a screen
 * reader end to end.
 */

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>

export const ACCESSIBILITY: LegalText = {
  nl: {
    intro: (
      <p>
        We willen dat iedereen Guestnote kan gebruiken, ook met een schermlezer, alleen met het
        toetsenbord of met vergroting.
      </p>
    ),
    sections: [
      {
        id: 'doel',
        title: 'Ons doel',
        body: (
          <p>
            We streven naar conformiteit met WCAG 2.1 niveau AA, de norm achter de Europese
            toegankelijkheidsrichtlijnen (EN 301 549), voor deze website en voor de app.
          </p>
        ),
      },
      {
        id: 'stand',
        title: 'Waar we staan',
        body: (
          <>
            <p>
              Kleurcontrasten zijn gecontroleerd, alles werkt met het toetsenbord met een zichtbare
              focus, en animaties vallen weg als je besturingssysteem minder beweging vraagt. Wat we
              nog niet deden:
            </p>
            <ul>
              <li>een onafhankelijke toegankelijkheidsaudit;</li>
              <li>een volledige test van de app met een schermlezer.</li>
            </ul>
          </>
        ),
      },
      {
        id: 'contact',
        title: 'Loop je ergens vast?',
        body: (
          <p>
            Laat het ons weten via {mail}. We antwoorden binnen vijf werkdagen en zoeken samen met
            jou een oplossing.
          </p>
        ),
      },
    ],
  },
  en: {
    intro: (
      <p>
        We want everyone to be able to use Guestnote, including with a screen reader, the keyboard
        alone or magnification.
      </p>
    ),
    sections: [
      {
        id: 'target',
        title: 'Our target',
        body: (
          <p>
            We aim to conform to WCAG 2.1 level AA, the standard behind the European accessibility
            requirements (EN 301 549), for this website and for the app.
          </p>
        ),
      },
      {
        id: 'status',
        title: 'Where we are',
        body: (
          <>
            <p>
              Colour contrast is checked, everything works from the keyboard with a visible focus,
              and animations are dropped when your operating system asks for reduced motion. What we
              have not done yet:
            </p>
            <ul>
              <li>an independent accessibility audit;</li>
              <li>a full test of the app with a screen reader.</li>
            </ul>
          </>
        ),
      },
      {
        id: 'contact',
        title: 'Stuck somewhere?',
        body: (
          <p>
            Tell us at {mail}. We reply within five working days and look for a solution with you.
          </p>
        ),
      },
    ],
  },
  fr: {
    intro: (
      <p>
        Nous voulons que chacun puisse utiliser Guestnote, y compris avec un lecteur d’écran, au
        clavier seul ou avec un agrandissement.
      </p>
    ),
    sections: [
      {
        id: 'objectif',
        title: 'Notre objectif',
        body: (
          <p>
            Nous visons la conformité au niveau AA des WCAG 2.1, la norme derrière les exigences
            européennes d’accessibilité (EN 301 549), pour ce site et pour l’application.
          </p>
        ),
      },
      {
        id: 'etat',
        title: 'Où nous en sommes',
        body: (
          <>
            <p>
              Les contrastes de couleur sont vérifiés, tout fonctionne au clavier avec un focus
              visible, et les animations disparaissent lorsque votre système demande moins de
              mouvement. Ce que nous n’avons pas encore fait :
            </p>
            <ul>
              <li>un audit d’accessibilité indépendant ;</li>
              <li>un test complet de l’application avec un lecteur d’écran.</li>
            </ul>
          </>
        ),
      },
      {
        id: 'contact',
        title: 'Vous êtes bloqué ?',
        body: (
          <p>
            Dites-le-nous à {mail}. Nous répondons dans les cinq jours ouvrables et cherchons une
            solution avec vous.
          </p>
        ),
      },
    ],
  },
}
