import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())

// React Flow uses native ResizeObserver; jsdom has no layout observer. Browser tests use the real API.
if (!globalThis.ResizeObserver) globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
