import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { TextField } from './components'

it('associates visible labels and accessible validation feedback with reusable inputs', () => {
  render(<TextField label="Document name" error="Enter a document name." />)
  const input = screen.getByRole('textbox', { name: 'Document name' })
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(input).toHaveAccessibleDescription('Enter a document name.')
})
