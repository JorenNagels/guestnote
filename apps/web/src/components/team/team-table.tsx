import { Table, TableBody, TableCell, TableHead, TableHeaderCell } from '@guestnote/ui/table'

export type TeamRow = {
  readonly userId: string
  readonly name: string
  readonly email: string
  readonly initials: string
  readonly roleLabel: string
  /** "Seat 2". A static label by row order: no count against a plan, no billing. */
  readonly seatLabel: string
  /** Owner and admin have one entry, the "all weddings" word; a member lists theirs. */
  readonly weddings: readonly string[]
  readonly isYou: boolean
}

export type TeamTableCopy = {
  readonly caption: string
  readonly member: string
  readonly role: string
  readonly seat: string
  readonly weddings: string
  readonly you: string
  readonly noWeddings: string
}

/**
 * The team, one row per person. A server component: nothing on it is interactive, and role
 * change and removal are not built (`team/SPEC.md`, "Not built") so there is no menu to hang
 * on a client boundary yet.
 *
 * The avatar is initials on a neutral chip, not a tint per person. A tint would be a colour
 * chosen from the name, and the only colour a person carries in this app is a wedding's dot.
 */
export function TeamTable({ rows, copy }: { rows: readonly TeamRow[]; copy: TeamTableCopy }) {
  return (
    <Table caption={copy.caption}>
      <TableHead>
        <tr>
          <TableHeaderCell>{copy.member}</TableHeaderCell>
          <TableHeaderCell>{copy.role}</TableHeaderCell>
          <TableHeaderCell>{copy.seat}</TableHeaderCell>
          <TableHeaderCell>{copy.weddings}</TableHeaderCell>
        </tr>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <tr key={row.userId}>
            <TableCell>
              <span className="flex min-w-0 items-center gap-2.5 py-1.5">
                <span
                  aria-hidden="true"
                  className="bg-muted text-muted-foreground grid size-7 flex-none place-items-center rounded-full text-[11px] font-semibold"
                >
                  {row.initials}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px]">
                    {row.name}
                    {row.isYou ? (
                      <span className="text-muted-foreground ml-1.5 text-xs">({copy.you})</span>
                    ) : null}
                  </span>
                  {row.name !== row.email ? (
                    <span className="text-muted-foreground block truncate text-[11.5px]">
                      {row.email}
                    </span>
                  ) : null}
                </span>
              </span>
            </TableCell>
            <TableCell>{row.roleLabel}</TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs">
              {row.seatLabel}
            </TableCell>
            <TableCell className="text-muted-foreground text-[12.5px] leading-snug">
              {row.weddings.length > 0 ? row.weddings.join(', ') : copy.noWeddings}
            </TableCell>
          </tr>
        ))}
      </TableBody>
    </Table>
  )
}
