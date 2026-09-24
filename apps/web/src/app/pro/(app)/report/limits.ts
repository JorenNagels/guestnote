/**
 * Shared by the dialog and the Server Function, so the browser's shrink target and the
 * server's refusal cannot drift apart. No `server-only`: the dialog imports it.
 *
 * 900 KB and not the 1 MB Next caps a Server Function body at by default: the category,
 * message and multipart framing ride in the same body. Raising the cap app-wide for one
 * dialog was rejected (spec 0005).
 */
export const REPORT_CATEGORIES = ['bug', 'idea', 'question'] as const
export type ReportCategory = (typeof REPORT_CATEGORIES)[number]
export const REPORT_MAX_CHARS = 4000
export const REPORT_SCREENSHOT_MAX_BYTES = 900 * 1024
export const REPORT_SCREENSHOT_MAX_EDGE = 1600
