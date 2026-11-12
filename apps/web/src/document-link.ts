export interface DocumentLink { document: string; version: string; chunk: string; page: number }
export function parseDocumentLink(search: string): { source?: DocumentLink; error?: string } {
  const params = new URLSearchParams(search)
  const keys = ['document', 'version', 'chunk', 'page']
  if (!keys.some(key => params.has(key))) return {}
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (keys.some(key => params.getAll(key).length !== 1)
    || !['document', 'version', 'chunk'].every(key => uuid.test(params.get(key) ?? ''))
    || !/^[1-9]\d{0,2}$/.test(params.get('page') ?? '') || Number(params.get('page')) > 200) {
    return { error: 'Invalid source link. Use a complete document/version/chunk UUID and a 1-based page.' }
  }
  return { source: { document: params.get('document')!, version: params.get('version')!, chunk: params.get('chunk')!, page: Number(params.get('page')) } }
}
