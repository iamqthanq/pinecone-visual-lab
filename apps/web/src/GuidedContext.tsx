import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { guidedAPI } from './guided-api'
import type { GuidedAction, GuidedOptions, GuidedSession } from './guided-api'
import { GUIDE_KEY, newGuide, readGuide } from './guided-state'
import type { GuideMemory } from './guided-state'
import { program } from './simulator'
import type { SimulatorState } from './simulator'
import { Context, guidePath } from './guided-context'

export function GuidedProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [memory, setMemory] = useState<GuideMemory | null>(() => { try { return readGuide(sessionStorage.getItem(GUIDE_KEY)) } catch { return null } })
  const [session, setSession] = useState<GuidedSession | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [controller, setController] = useState<AbortController | null>(null)
  const generation = useRef(0)
  const id = memory?.id
  useEffect(() => {
    try { if (memory) sessionStorage.setItem(GUIDE_KEY, JSON.stringify(memory)); else sessionStorage.removeItem(GUIDE_KEY) } catch { /* storage unavailable: in-memory guide still works */ }
  }, [memory])
  useEffect(() => {
    if (!id) return
    const request = new AbortController()
    const token = generation.current
    guidedAPI.get(id, request.signal).then(value => { if (!request.signal.aborted && generation.current === token) setSession(value) }).catch(failure => { if (!request.signal.aborted) setError((failure as Error).message) })
    return () => request.abort()
  }, [id])
  useEffect(() => () => controller?.abort(), [controller])
  async function refresh() {
    if (!memory) return
    const token = ++generation.current
    setBusy('Rechecking backend evidence…'); setError('')
    try { const value = await guidedAPI.get(memory.id); if (generation.current === token) setSession(value) } catch (failure) { if (generation.current === token) setError((failure as Error).message) } finally { if (generation.current === token) setBusy('') }
  }
  async function start() {
    if (memory && session) { navigate(guidePath(memory.step, session)); return }
    const token = ++generation.current
    setBusy('Creating local guide session…'); setError('')
    try { const state = await guidedAPI.create(); if (generation.current === token) { setSession(state); setMemory(newGuide(state.id)); navigate(guidePath(0, state)) } }
    catch (failure) { if (generation.current === token) setError((failure as Error).message) } finally { if (generation.current === token) setBusy('') }
  }
  function go(step: number) {
    if (!session || !memory || busy || step < 0 || step > 7) return
    setMemory(old => old ? { ...old, step } : old); navigate(guidePath(step, session))
  }
  function cancel() { generation.current++; controller?.abort(); setController(null); setMemory(null); setSession(null); setError(''); setBusy('') }
  async function act(action: GuidedAction, options: GuidedOptions = {}) {
    if (!memory || busy) return null
    const token = ++generation.current
    const request = new AbortController(); setController(request); setBusy(`Guided ${action.replace(/_/g, ' ')}…`); setError('')
    const timer = window.setTimeout(() => request.abort(), 220000)
    try {
      const output = await guidedAPI.action(memory.id, action, options, request.signal)
      if (request.signal.aborted || generation.current !== token) return null
      setSession(output.session)
      if (action === 'reset') { setMemory(newGuide(output.session.id)); navigate(guidePath(0, output.session)) }
      return output.result
    } catch (failure) { if (generation.current === token) setError(request.signal.aborted ? 'Guided action cancelled. Refresh evidence; no automatic data cleanup.' : (failure as Error).message); return null }
    finally { window.clearTimeout(timer); if (generation.current === token) { setBusy(''); setController(null) } }
  }
  const simulator = useCallback((value: SimulatorState) => {
    setMemory(old => {
      if (!old) return old
      const modes = value.cursor === program(value.mode, value.seed).length ? [...new Set([...old.modes, value.mode])] : old.modes
      if (JSON.stringify(old.simulator) === JSON.stringify(value) && modes.length === old.modes.length) return old
      return { ...old, simulator: value, modes }
    })
  }, [])
  return <Context.Provider value={{ memory, session, busy, error, start, go, cancel, abort: () => controller?.abort(), refresh, act, simulator }}>{children}</Context.Provider>
}
