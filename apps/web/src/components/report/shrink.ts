import {
  REPORT_SCREENSHOT_MAX_BYTES,
  REPORT_SCREENSHOT_MAX_EDGE,
} from '../../app/pro/(app)/report/limits.ts'

/**
 * A screenshot, made small enough to ride in a Server Function body.
 *
 * Next caps that body at 1 MB by default and a phone screenshot is routinely 2-4 MB as PNG, so
 * the browser redraws it as JPEG with the longest edge at most 1600px, stepping the quality
 * down until it fits. `null` when it still does not fit at the lowest step -- the dialog then
 * says so and the report can go without it. Rejected: raising `serverActions.bodySizeLimit`
 * app-wide for one dialog.
 *
 * Its own module so the component test can replace it: jsdom has no canvas.
 */
// Four fixed steps rather than a search: each `toBlob` is a full re-encode, slow on a phone.
// At 1600px a screenshot of this app lands under the cap at 0.85 or 0.7 in practice; 0.4 is
// the floor because below it small UI text in the screenshot stops being readable, and an
// unreadable screenshot is worth less than the dialog's honest "too large". Chosen, not measured.
const QUALITIES = [0.85, 0.7, 0.55, 0.4]

export async function shrinkScreenshot(file: File): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, REPORT_SCREENSHOT_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  for (const quality of QUALITIES) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (blob && blob.size <= REPORT_SCREENSHOT_MAX_BYTES) return blob
  }
  return null
}
