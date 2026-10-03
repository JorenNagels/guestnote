import { FilesIcon } from '../nav/icons.tsx'
import { kindLabel } from './format.ts'

/**
 * Where a moodboard tile shows its image, for an item that is not one (2026-10-04): a file icon,
 * the type a person recognises ("PDF", "XLSX") and, where the caller knows it, the size. The same
 * 4:3 box an image fills, so a board mixing the two keeps its grid.
 *
 * Presentational only; the caller wraps it in the control that opens the file and names it.
 * Rejected: rendering a PDF's first page as a thumbnail, which is a PDF renderer in the bundle or
 * a thumbnailing job on upload -- `packages/storage/README.md` lists thumbnails as not planned.
 */
export function DocPreview({ mime, size }: { mime: string; size?: string | null | undefined }) {
  return (
    <span className="bg-muted text-muted-foreground flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 px-2 text-center">
      <FilesIcon className="size-8 shrink-0" />
      <span className="text-foreground text-xs font-semibold tracking-wide">{kindLabel(mime)}</span>
      {size && <span className="text-[11px]">{size}</span>}
    </span>
  )
}
