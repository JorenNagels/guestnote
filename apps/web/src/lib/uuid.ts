const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Ids arrive from a URL segment or a POST body. Postgres raises `invalid input syntax for type
 * uuid` on anything else rather than matching nothing, so an unchecked one is an uncaught 500
 * where the rule is a 404. Every page and Server Function checks with this, before the query.
 *
 * `packages/storage/src/keys.ts` keeps its own copy: a package imports nothing from the app.
 */
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
