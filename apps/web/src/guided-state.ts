import { initialSimulator, program } from './simulator'
import type { Mode, SimulatorState } from './simulator'
export const GUIDE_KEY = 'pvl-guided-v1'
export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
export interface GuideMemory { schema: 1; id: string; step: number; simulator: SimulatorState; modes: Mode[] }
export function readGuide(raw: string | null): GuideMemory | null {
  try {
    if (!raw || raw.length > 2048) return null
    const data = JSON.parse(raw)
    if (data.schema !== 1 || !uuid(data.id) || !Number.isInteger(data.step) || data.step < 0 || data.step > 7 || !Array.isArray(data.modes) || data.modes.length > 3 || new Set(data.modes).size !== data.modes.length || data.modes.some((m: string) => !['write', 'read', 'compaction'].includes(m))) return null
    const s = data.simulator
    if (!s || !Number.isInteger(s.cursor) || s.cursor < 0 || s.cursor > program(s.mode, s.seed).length || ![0.5, 1, 2].includes(s.speed) || typeof s.playing !== 'boolean') return null
    return { schema: 1, id: data.id, step: data.step, simulator: { mode: s.mode, seed: s.seed, cursor: s.cursor, playing: false, speed: s.speed }, modes: data.modes }
  } catch { return null }
}
export function newGuide(id: string): GuideMemory {
  if (!uuid(id)) throw new Error('Invalid guide session ID')
  return { schema: 1, id, step: 0, simulator: initialSimulator(), modes: [] }
}
export function demoSelection(search: string) {
  const params = new URLSearchParams(search)
  const document = params.get('demoDocument'), version = params.get('demoVersion'), chunk = params.get('demoChunk')
  const namespace = params.get('demoNamespace') ?? ''
  return { document: uuid(document) ? document : '', version: uuid(version) ? version : '', chunk: uuid(chunk) ? chunk : '', namespace: /^[a-zA-Z0-9_.-]{0,64}$/.test(namespace) ? namespace : '' }
}
