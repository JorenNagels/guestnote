import type { FilesLabels } from './files-screen.tsx'
import type { MoodboardLabels } from './moodboard-screen.tsx'

/** English labels for the component tests, so an assertion reads as the sentence it checks. */
const errors = {
  not_found: 'Not found',
  invalid_name: 'Bad name',
  invalid_size: 'Bad size',
  too_large: 'Too large',
  type_not_allowed: 'Type not allowed',
  unavailable: 'Unavailable',
  network: 'No connection',
  upload_failed: 'Upload failed',
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
    removeConfirm: 'Remove “{name}”?',
    removeYes: 'Yes, remove',
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
  tileRemoveConfirm: 'Remove?',
  tileRemoveYes: 'Yes',
  tileCancel: 'Cancel',
  aria: { remove: 'Remove {name}', caption: 'Edit the caption of {name}' },
  captionField: 'Caption',
  captionSave: 'Save',
  imageUnavailable: 'Image not available',
  errors,
}
