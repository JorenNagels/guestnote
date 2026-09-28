import type { FilesLabels } from './files-screen.tsx'
import type { MoodboardLabels } from './moodboard-screen.tsx'

/**
 * Builds the two screens' label objects from `app.files`.
 *
 * `raw`, never a formatted read: several strings are templates with a `{name}` the browser
 * fills per row, and a formatted `t()` with no value for it fails rather than returning the
 * template. The same reason `(app)/layout.tsx` reads its countdown strings this way. The cost
 * is that nothing here is ICU-processed, so the copy uses curly quotes and no plural forms.
 */
export type Raw = (key: string) => unknown

const ERROR_CODES = [
  'notFound',
  'invalidName',
  'invalidSize',
  'tooLarge',
  'typeNotAllowed',
  'unavailable',
  'network',
  'uploadFailed',
  'unknown',
] as const

function errors(raw: Raw) {
  const s = (key: string) => String(raw(key))
  return {
    notFound: s('errors.notFound'),
    invalidName: s('errors.invalidName'),
    invalidSize: s('errors.invalidSize'),
    tooLarge: s('errors.tooLarge'),
    typeNotAllowed: s('errors.typeNotAllowed'),
    unavailable: s('errors.unavailable'),
    network: s('errors.network'),
    uploadFailed: s('errors.uploadFailed'),
    unknown: s('errors.unknown'),
  } satisfies Record<(typeof ERROR_CODES)[number], string>
}

function upload(raw: Raw, scope: 'files' | 'moodboard') {
  const s = (key: string) => String(raw(key))
  return {
    button: s(`${scope}.upload.button`),
    hint: s(`${scope}.upload.hint`),
    uploading: s('uploading'),
    dismiss: s('dismiss'),
    errors: errors(raw),
  }
}

export function filesLabels(raw: Raw): FilesLabels {
  const s = (key: string) => String(raw(`files.${key}`))
  return {
    title: s('title'),
    tableCaption: s('tableCaption'),
    columnName: s('columnName'),
    columnActions: s('columnActions'),
    empty: { title: s('emptyTitle'), body: s('emptyBody') },
    internalOnly: s('internalOnly'),
    internalNext: s('internalNext'),
    by: s('by'),
    upload: upload(raw, 'files'),
    actions: {
      download: s('actions.download'),
      rename: s('actions.rename'),
      makeInternal: s('actions.makeInternal'),
      makeShared: s('actions.makeShared'),
      remove: s('actions.remove'),
      removeConfirm: s('actions.removeConfirm'),
      removeYes: s('actions.removeYes'),
      save: s('actions.save'),
      cancel: s('actions.cancel'),
      renameField: s('actions.renameField'),
    },
    aria: {
      download: s('aria.download'),
      rename: s('aria.rename'),
      makeInternal: s('aria.makeInternal'),
      makeShared: s('aria.makeShared'),
      remove: s('aria.remove'),
    },
    errors: errors(raw),
  }
}

export function moodboardLabels(raw: Raw): MoodboardLabels {
  const s = (key: string) => String(raw(`moodboard.${key}`))
  return {
    title: s('title'),
    empty: { title: s('emptyTitle'), body: s('emptyBody') },
    upload: upload(raw, 'moodboard'),
    tileRemove: s('tileRemove'),
    tileRemoveConfirm: s('tileRemoveConfirm'),
    tileRemoveYes: s('tileRemoveYes'),
    tileCancel: s('tileCancel'),
    aria: { remove: s('aria.remove'), caption: s('aria.caption') },
    captionField: s('captionField'),
    captionSave: s('captionSave'),
    imageUnavailable: s('imageUnavailable'),
    moveTo: s('moveTo'),
    moveAria: s('moveAria'),
    boards: {
      switcher: s('boards.switcher'),
      new: s('boards.new'),
      newName: s('boards.newName'),
      nameField: s('boards.nameField'),
      save: s('boards.save'),
      cancel: s('boards.cancel'),
      rename: s('boards.rename'),
      sharedWith: s('boards.sharedWith'),
      notShared: s('boards.notShared'),
      share: s('boards.share'),
      shareTitle: s('boards.shareTitle'),
      shareCouple: s('boards.shareCouple'),
      shareCoupleHint: s('boards.shareCoupleHint'),
      shareNoLink: s('boards.shareNoLink'),
      shareNoVendors: s('boards.shareNoVendors'),
      couple: s('boards.couple'),
      close: s('boards.close'),
      delete: s('boards.delete'),
      deleteConfirm: s('boards.deleteConfirm'),
      deleteConfirmEmpty: s('boards.deleteConfirmEmpty'),
      deleteYes: s('boards.deleteYes'),
      empty: s('boards.empty'),
      // The file errors, with the two a board adds: its own name limit (80, not a file's 200)
      // and the default board's refusal.
      errors: {
        ...errors(raw),
        invalidName: s('boards.errors.invalidName'),
        isDefault: s('boards.errors.isDefault'),
      },
    },
    errors: errors(raw),
  }
}
