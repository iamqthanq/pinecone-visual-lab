import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import LabBoundary from './LabBoundary'

afterEach(() => vi.restoreAllMocks())
function Broken(): never { throw new Error('Simulated missing route asset') }
it('keeps recovery navigation and guide cancellation available after a route import error', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const cancel = vi.fn()
  render(<MemoryRouter><LabBoundary label="Guided Demo" onCancel={cancel}><Broken /></LabBoundary></MemoryRouter>)
  expect(screen.getByRole('alert')).toHaveTextContent('Guided Demo could not open')
  expect(screen.getByRole('link', { name: 'Return to Overview' })).toHaveAttribute('href', '/')
  expect(screen.getByRole('button', { name: 'Reload current lab' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel Guided Demo' }))
  expect(cancel).toHaveBeenCalledOnce()
})
it('a new route boundary can recover without carrying the failed route state', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const { rerender } = render(<MemoryRouter><LabBoundary key="documents" label="Documents"><Broken /></LabBoundary></MemoryRouter>)
  rerender(<MemoryRouter><LabBoundary key="search" label="Search"><p>Search retained</p></LabBoundary></MemoryRouter>)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByText('Search retained')).toBeVisible()
})
