/**
 * Shapes only, no words: the page it stands in for carries the copy, and a skeleton with its own
 * text would be one more string to translate three times for a screen shown for a moment.
 */
export default function Loading() {
  return (
    <div aria-busy="true" className="mx-auto max-w-5xl px-6 pt-6 pb-8">
      <div aria-hidden="true" className="animate-pulse">
        <div className="bg-muted h-7 w-56 rounded" />
        <div className="bg-muted mt-2 h-4 w-72 rounded" />
        <div className="bg-muted mt-6 h-11 w-full rounded" />
        <div className="border-border bg-card mt-6 divide-y overflow-hidden rounded-[var(--radius)] border">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 px-4 py-3">
              <div className="bg-muted h-4 w-2/3 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
