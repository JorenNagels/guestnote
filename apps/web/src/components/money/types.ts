/**
 * What a money Server Function answers with. Plain data, so it crosses the client boundary.
 *
 * The error is a key into `app.s4.errors`, never a message: the action does not know the
 * planner's language, and the client shows the copy it was handed.
 */
export type MoneyError =
  | 'category'
  | 'label'
  | 'estimate'
  | 'actual'
  | 'vendor'
  | 'line'
  | 'due'
  | 'amount'
  | 'paidOn'
  | 'notFound'
  | 'failed'

export type ActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: MoneyError }
