import { createContext, useContext, useEffect } from 'react'
import type { RefObject } from 'react'

export const MotionActive = createContext(true)

/** Presentation only. No callbacks, API, progress values or completion state. */
export function useDataMotion(root: RefObject<HTMLElement | null>, trigger: unknown,
  { selector = '[data-reveal]', duration = 0.24, active = true }: { selector?: string; duration?: number; active?: boolean } = {}) {
  const tabActive = useContext(MotionActive)
  useEffect(() => {
    const element = root.current
    if (!element || !trigger || !active || !tabActive || document.hidden) return
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (media?.matches) return
    let disposed = false
    let context: { revert: () => void } | undefined
    function stop() { disposed = true; context?.revert(); context = undefined }
    const hidden = () => { if (document.hidden) stop() }
    const preference = () => { if (media?.matches) stop() }
    document.addEventListener('visibilitychange', hidden)
    media?.addEventListener('change', preference)
    // Deferred until actual state/data arrives; a failed import leaves content visible.
    void import('gsap').then(({ gsap }) => {
      if (disposed || !element.isConnected || root.current !== element || document.hidden || media?.matches) return
      const targets = Array.from(element.querySelectorAll<HTMLElement>(selector)).slice(0, 8)
        .filter(node => !node.contains(document.activeElement))
      if (!targets.length) return
      context = gsap.context(() => {
        gsap.timeline({ defaults: { ease: 'power1.out', overwrite: 'auto' } })
          .fromTo(targets, { opacity: 0.6, y: 6 }, { opacity: 1, y: 0, duration, stagger: { amount: targets.length > 1 ? 0.14 : 0 }, clearProps: 'transform,opacity' })
      }, element)
    }).catch(() => { /* motion is optional; data and controls remain visible */ })
    return () => { stop(); document.removeEventListener('visibilitychange', hidden); media?.removeEventListener('change', preference) }
  }, [root, trigger, selector, duration, active, tabActive])
}
