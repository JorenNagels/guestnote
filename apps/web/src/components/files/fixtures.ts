import type { FilesLabels } from './files-screen.tsx'
import type { MoodboardLabels } from './moodboard-screen.tsx'

/** English labels for the component tests, so an assertion reads as the sentence it checks. */
const errors = {
  notFound: 'Not found',
  invalidName: 'Bad name',
  invalidSize: 'Bad size',
  tooLarge: 'Too large',
  typeNotAllowed: 'Type not allowed',
  unavailable: 'Unavailable',
  network: 'No connection',
  uploadFailed: 'Upload failed',
  unknown: 'Something went wrong',
}

const upload = {
  button: 'Add files',
  hint: 'Drop files here',
  uploading: 'Uploading',
  dismiss: 'Dismiss',
  errors,
}

export const FILES_LABELS: FilesLabels = {
  title: 'Files',
  tableCaption: 'Files for this wedding',
  columnName: 'Name',
  columnActions: 'Actions',
  empty: { title: 'No files yet', body: 'Add one' },
  internalOnly: 'Internal only',
  internalNext: 'Internal only next',
  by: 'by',
  upload,
  actions: {
    download: 'Download',
    rename: 'Rename',
    makeInternal: 'Make internal',
    makeShared: 'Share',
    remove: 'Remove',
    removed: '“{name}” removed.',
    save: 'Save',
    cancel: 'Cancel',
    renameField: 'New name',
  },
  aria: {
    download: 'Download {name}',
    rename: 'Rename {name}',
    makeInternal: 'Make {name} internal',
    makeShared: 'Share {name}',
    remove: 'Remove {name}',
  },
  errors,
}

export const MOODBOARD_LABELS: MoodboardLabels = {
  title: 'Moodboard',
  empty: { title: 'No images yet', body: 'Add some' },
  upload: { ...upload, button: 'Add images' },
  tileRemove: 'Remove',
  tileRemoved: 'Image “{name}” removed.',
  tileCancel: 'Cancel',
  aria: { remove: 'Remove {name}', caption: 'Edit the caption of {name}' },
  captionField: 'Caption',
  captionSave: 'Save',
  imageUnavailable: 'Image not available',
  moveTo: 'Move to…',
  moveAria: 'Move {name} to another board',
  boards: {
    switcher: 'Boards',
    new: '+ New board',
    newName: 'New board',
    nameField: 'Board name',
    save: 'Save board',
    cancel: 'Cancel',
    rename: 'Rename {name}',
    sharedWith: 'Shared with: {names}',
    notShared: 'Not shared',
    share: 'Share',
    shareTitle: 'Share {name}',
    shareCouple: 'Couple',
    shareCoupleHint: 'Visible once the couple portal is live.',
    shareNoLink: 'no link yet',
    shareNoVendors: 'No vendors yet.',
    couple: 'Couple',
    close: 'Close',
    delete: 'Delete board',
    deleteConfirm: 'Delete the board and {count} images?',
    deleteConfirmEmpty: 'Delete the board?',
    deleteYes: 'Yes, delete',
    empty: 'No images on this board yet.',
    errors: {
      ...errors,
      invalidName: 'Bad board name',
      isDefault: 'Cannot delete the first board',
    },
  },
  errors,
}
