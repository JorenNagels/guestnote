/**
 * Versions of the legal texts (spec 0006, "Legal texts").
 *
 * `TERMS_VERSION` is what `create_studio` stores beside the acceptance timestamp, so a studio
 * can later be shown exactly the terms it agreed to. Bump it in the same commit as any change
 * to the terms or the DPA (the DPA is part of the terms), and change `LEGAL_UPDATED` whenever
 * any legal page changes. Changing the terms also obliges 30 days' notice to existing studios
 * (terms, "Changes") -- the version is how the day they were notified becomes answerable.
 *
 * Drafted by Claude on 2026-09-27 and, by the user's decision recorded in the spec, **not
 * reviewed by a lawyer**.
 */
export const TERMS_VERSION = '2026-09-27'

/** The date shown as "last updated" on every legal page. */
export const LEGAL_UPDATED = '2026-09-27'
