/**
 * Host half of the dsh-prompt-dock bundle.
 *
 * Owns one schema-validated storage domain (`prompt_library`, table
 * `prompts`) and one exact Fetch route at `/api/prompt-dock/prompts` that the browser half
 * calls. Reads are synchronous from the domain's authoritative in-memory
 * state; every write is durable before it resolves, so the preset prompts
 * survive restarts and are shared by every client of this Host (desktop
 * browser and phone alike).
 *
 * The domain spec is a plain object: the storage-domain runtime only calls
 * `valueSchema.parse()` on stored records, so a hand-written parse function
 * satisfies the boundary without importing zod.
 */

export const inject = ['storageDomain', 'connection']

const DOMAIN_NAME = 'prompt_library'
const ROUTE_PATH = '/api/prompt-dock/prompts'
const MAX_PROMPTS = 200
const MAX_TITLE_LENGTH = 100
const MAX_TEXT_LENGTH = 20000

/**
 * Boundary validation for one stored prompt record; doubles as the table's
 * `valueSchema.parse`. Records are plain JSON objects: { title, text, order,
 * updatedAt }. Throws on any deviation so a damaged medium fails loud at
 * open (`invalid-record`) instead of serving silently wrong data.
 */
function parsePromptRecord(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('prompt record must be an object')
  }
  const { title, text, order, updatedAt } = raw
  if (typeof title !== 'string' || title.length < 1 || title.length > MAX_TITLE_LENGTH) {
    throw new Error(`prompt record title must be a string of 1..${MAX_TITLE_LENGTH} characters`)
  }
  if (typeof text !== 'string' || text.length < 1 || text.length > MAX_TEXT_LENGTH) {
    throw new Error(`prompt record text must be a string of 1..${MAX_TEXT_LENGTH} characters`)
  }
  if (typeof order !== 'number' || !Number.isFinite(order)) {
    throw new Error('prompt record order must be a finite number')
  }
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) {
    throw new Error('prompt record updatedAt must be a finite number')
  }
  return raw
}

const domainSpec = {
  name: DOMAIN_NAME,
  version: 1,
  tables: { prompts: { valueSchema: { parse: parsePromptRecord } } },
}

function jsonResponse(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

/** Ordered public view of the table: newest arrangement by `order`, then title. */
function listPrompts(table) {
  const rows = []
  for (const [id, record] of table.entries()) {
    rows.push({ id, title: record.title, text: record.text, order: record.order, updatedAt: record.updatedAt })
  }
  rows.sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title))
  return rows
}

/** Read one trimmed, non-empty, length-capped string field from a request. */
function readString(value, max, label) {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  const trimmed = value.trim()
  if (trimmed.length < 1) throw new Error(`${label} must not be empty`)
  if (trimmed.length > max) throw new Error(`${label} must be at most ${max} characters`)
  return trimmed
}

function requireId(value) {
  if (typeof value !== 'string' || value.length < 1) throw new Error('id must be a non-empty string')
  return value
}

/** Dispatch one request on the exact route. Body errors are 400s; the outer wrapper turns bugs into 500s. */
async function handleRequest(request, domain) {
  const table = domain.table('prompts')

  if (request.method === 'GET') {
    return jsonResponse(200, { prompts: listPrompts(table) })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return jsonResponse(400, { ok: false, error: 'request body must be JSON' })
  }
  if (typeof body !== 'object' || body === null) {
    return jsonResponse(400, { ok: false, error: 'request body must be a JSON object' })
  }

  try {
    if (body.action === 'create') {
      if (table.size >= MAX_PROMPTS) throw new Error(`at most ${MAX_PROMPTS} prompts are supported`)
      const title = readString(body.title, MAX_TITLE_LENGTH, 'title')
      const text = readString(body.text, MAX_TEXT_LENGTH, 'text')
      let maxOrder = 0
      for (const [, record] of table.entries()) maxOrder = Math.max(maxOrder, record.order)
      const id = crypto.randomUUID()
      await table.put(id, { title, text, order: maxOrder + 10, updatedAt: Date.now() })
      return jsonResponse(200, { ok: true, prompts: listPrompts(table) })
    }
    if (body.action === 'update') {
      const id = requireId(body.id)
      if (table.get(id) === undefined) throw new Error('unknown prompt id')
      const title = readString(body.title, MAX_TITLE_LENGTH, 'title')
      const text = readString(body.text, MAX_TEXT_LENGTH, 'text')
      await table.update(id, current => ({ ...current, title, text, updatedAt: Date.now() }))
      return jsonResponse(200, { ok: true, prompts: listPrompts(table) })
    }
    if (body.action === 'delete') {
      const id = requireId(body.id)
      const existed = await table.delete(id)
      if (!existed) throw new Error('unknown prompt id')
      return jsonResponse(200, { ok: true, prompts: listPrompts(table) })
    }
    if (body.action === 'reorder') {
      // The client sends the complete intended sequence, so one contract
      // covers every gesture (to top, up, down, to bottom, later drag). It
      // must be an exact permutation of the table; re-spaced `order` values
      // keep a stable gap for future inserts. Only `order` changes — content
      // fields and `updatedAt` belong to edit, not arrangement.
      if (!Array.isArray(body.ids)) throw new Error('ids must be an array of prompt ids')
      if (body.ids.length !== table.size) throw new Error('ids must list every prompt exactly once')
      const seen = new Set()
      for (const id of body.ids) {
        requireId(id)
        if (seen.has(id)) throw new Error('ids must not repeat a prompt id')
        seen.add(id)
        if (table.get(id) === undefined) throw new Error('unknown prompt id')
      }
      for (const [index, id] of body.ids.entries()) {
        const order = (index + 1) * 10
        if (table.get(id).order !== order) {
          await table.update(id, current => ({ ...current, order }))
        }
      }
      return jsonResponse(200, { ok: true, prompts: listPrompts(table) })
    }
    throw new Error('action must be one of create, update, delete, reorder')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'request failed'
    return jsonResponse(400, { ok: false, error: message })
  }
}

/**
 * Open the prompt domain, recovering the one poisoned state this bundle can
 * itself create: an activation that failed between `open()` and its cleanup
 * effect leaves the domain open with no owner, because the facility does not
 * tie domains to caller fibers. Adopting the orphaned runtime through the
 * facility's lookup repairs that leak — the close effect apply registers
 * right after this call owns it again. In every other state this simply
 * opens a fresh domain.
 */
async function openDomain(storageDomain) {
  try {
    return await storageDomain.open(domainSpec)
  } catch (error) {
    if (error instanceof Error && error.code === 'already-open') {
      const existing = storageDomain.get(DOMAIN_NAME)
      if (existing !== undefined) return existing
    }
    throw error
  }
}

export async function apply(ctx) {
  const storageDomain = ctx.get('storageDomain')
  const connection = ctx.get('connection')
  if (storageDomain === undefined || connection === undefined) {
    throw new Error('prompt-library requires the storageDomain and connection services')
  }

  const domain = await openDomain(storageDomain)
  // Own each resource from the moment it is acquired, so a later failure in
  // this apply can never leak it.
  ctx.effect(() => async () => { await domain.close() }, 'prompt-dock: storage domain')

  const disposeRoute = await connection.fetch.register({
    path: ROUTE_PATH,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: async request => {
      try {
        return await handleRequest(request, domain)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'internal error'
        return jsonResponse(500, { ok: false, error: message })
      }
    },
  })
  ctx.effect(() => async () => { await disposeRoute() }, 'prompt-dock: fetch route')
}
