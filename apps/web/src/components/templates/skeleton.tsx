/**
 * The loading state for both template routes. Shapes only, no words: the page it stands in for
 * carries the copy, and a skeleton with its own text would be a string to translate three times
 * for a screen that shows for a few hundred milliseconds.
 */
export function TemplatesSkeleton() {
  return (
    <div aria-busy="true" className="mx-auto max-w-5xl px-6 py-8">
      <div aria-hidden="true" className="animate-pulse">
        <div className="bg-muted h-7 w-48 rounded" />
        <div className="bg-muted mt-2 h-4 w-72 rounded" />
        <div className="border-border bg-card mt-8 divide-y overflow-hidden rounded-[var(--radius)] border">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[var(--row-h)] px-4 py-3">
              <div className="bg-muted h-4 w-2/3 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
