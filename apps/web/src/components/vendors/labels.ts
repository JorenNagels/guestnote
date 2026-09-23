import type { ErrorLabels } from './controls.tsx'
import type { DirectoryLabels } from './directory-view.tsx'
import type { StatusLabels } from './status.tsx'
import type { FormLabels } from './vendor-form.tsx'
import type { ManageLinkLabels, WeddingLabels } from './wedding-vendors-view.tsx'

/**
 * The client components take their copy as props, because the dashboard has no
 * `NextIntlClientProvider` and the shell set that convention (`ShellLabels`). These read the
 * `app.vendors` catalogue on the server and hand plain strings across.
 *
 * `raw` for the three templates that carry `{name}`: a formatted read throws for the missing
 * variable, and the browser fills it per row (the same trap `(app)/layout.tsx` records for the
 * countdown). Everything else is an ordinary read.
 */
export type Translate = {
  (key: string): string
  raw: (key: string) => unknown
}

const raw = (t: Translate, key: string) => String(t.raw(key))

function errors(t: Translate): ErrorLabels {
  return {
    invalid: t('errors.invalid'),
    forbidden: t('errors.forbidden'),
    notFound: t('errors.notFound'),
    duplicate: t('errors.duplicate'),
    generic: t('errors.generic'),
  }
}

function statuses(t: Translate): StatusLabels {
  return {
    considering: t('status.considering'),
    contacted: t('status.contacted'),
    quoted: t('status.quoted'),
    booked: t('status.booked'),
    declined: t('status.declined'),
  }
}

export function formLabels(t: Translate): FormLabels {
  return {
    titleNew: t('form.titleNew'),
    titleEdit: t('form.titleEdit'),
    name: t('form.name'),
    category: t('form.category'),
    categoryHint: t('form.categoryHint'),
    email: t('form.email'),
    phone: t('form.phone'),
    notes: t('form.notes'),
    save: t('form.save'),
    saving: t('form.saving'),
    cancel: t('form.cancel'),
    close: t('form.close'),
    archive: t('form.archive'),
    archiveConfirm: t('form.archiveConfirm'),
    archiveConfirmYes: t('form.archiveConfirmYes'),
    archiveNote: t('form.archiveNote'),
    errors: errors(t),
  }
}

export function directoryLabels(t: Translate): DirectoryLabels {
  return {
    add: t('directory.add'),
    searchLabel: t('directory.searchLabel'),
    searchPlaceholder: t('directory.searchPlaceholder'),
    emptyTitle: t('directory.emptyTitle'),
    emptyBody: t('directory.emptyBody'),
    emptyReadOnly: t('directory.emptyReadOnly'),
    noResults: t('directory.noResults'),
    caption: t('directory.caption'),
    colVendor: t('directory.colVendor'),
    colCategory: t('directory.colCategory'),
    colContact: t('directory.colContact'),
    colActions: t('directory.colActions'),
    edit: t('directory.edit'),
    editAria: raw(t, 'directory.editAria'),
    readOnly: t('directory.readOnly'),
    form: formLabels(t),
  }
}

/**
 * `app.vendorLink`'s catalogue, not `app.vendors`'s -- S10 owns the "create/copy/revoke a signed link"
 * copy (spec 0003), including the `manageLink` block this vendor-detail sheet renders and
 * the `/vendor/[token]` page's own strings the rest of that file reads directly. Kept as its
 * own function, taking its own translator, rather than folded into `weddingLabels` reading
 * two namespaces at once -- one function, one catalogue, same convention as `formLabels` /
 * `directoryLabels` above.
 */
export function manageLinkLabels(t: Translate): ManageLinkLabels {
  return {
    title: t('manageLink.title'),
    createButton: t('manageLink.createButton'),
    creating: t('manageLink.creating'),
    created: t('manageLink.created'),
    copyButton: t('manageLink.copyButton'),
    copied: t('manageLink.copied'),
    expiresLabel: raw(t, 'manageLink.expiresLabel'),
    revokeButton: t('manageLink.revokeButton'),
    revokeConfirm: t('manageLink.revokeConfirm'),
    revokeConfirmYes: t('manageLink.revokeConfirmYes'),
    revoked: t('manageLink.revoked'),
    cancel: t('manageLink.cancel'),
    error: t('manageLink.error'),
  }
}

export function weddingLabels(t: Translate, t10: Translate): WeddingLabels {
  return {
    addLabel: t('wedding.addLabel'),
    addPlaceholder: t('wedding.addPlaceholder'),
    addButton: t('wedding.addButton'),
    addNone: t('wedding.addNone'),
    newVendor: t('wedding.newVendor'),
    directoryLink: t('wedding.directoryLink'),
    emptyTitle: t('wedding.emptyTitle'),
    emptyBody: t('wedding.emptyBody'),
    emptyBodyReadOnly: t('wedding.emptyBodyReadOnly'),
    caption: t('wedding.caption'),
    colVendor: t('wedding.colVendor'),
    colCategory: t('wedding.colCategory'),
    colContact: t('wedding.colContact'),
    colStatus: t('wedding.colStatus'),
    colActions: t('wedding.colActions'),
    statusAria: raw(t, 'wedding.statusAria'),
    edit: t('wedding.edit'),
    editAria: raw(t, 'wedding.editAria'),
    sheetTitle: raw(t, 'wedding.sheetTitle'),
    status: t('wedding.status'),
    notes: t('wedding.notes'),
    notesHint: t('wedding.notesHint'),
    save: t('wedding.save'),
    saving: t('wedding.saving'),
    cancel: t('form.cancel'),
    close: t('form.close'),
    remove: t('wedding.remove'),
    removeConfirm: t('wedding.removeConfirm'),
    removeConfirmYes: t('wedding.removeConfirmYes'),
    removeNote: t('wedding.removeNote'),
    statuses: statuses(t),
    errors: errors(t),
    form: formLabels(t),
    manageLink: manageLinkLabels(t10),
  }
}
