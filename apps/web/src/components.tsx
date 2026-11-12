import { useId } from 'react'
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, Ref } from 'react'
import { ArrowUpRight, LoaderCircle } from 'lucide-react'

export function Badge({ children, tone = 'muted' }: {
  children: ReactNode; tone?: 'muted' | 'green' | 'amber'
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Button({ children, className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`button ${className}`} {...props}>{children}</button>
}

export function Panel({ children, className = '', label, ref, ...props }: HTMLAttributes<HTMLElement> & {
  children: ReactNode; label?: string; ref?: Ref<HTMLElement>
}) {
  return <section {...props} ref={ref} className={`panel ${className}`} aria-label={label ?? props['aria-label']}>{children}</section>
}

export function LoadingState() {
  return <div className="loading-state" role="status"><LoaderCircle size={18} className="spin" />
    Checking backend<span className="skeleton" aria-hidden="true" /></div>
}

export function ArrowLinkIcon() {
  return <ArrowUpRight size={17} aria-hidden="true" />
}

export function TextField({ label, hint, error, ...props }: InputHTMLAttributes<HTMLInputElement> & {
  label: string; hint?: string; error?: string
}) {
  const generatedId = useId()
  const id = props.id ?? generatedId
  const description = `${id}-description`
  return <div className="text-field"><label htmlFor={id}>{label}</label>
    <input {...props} id={id} aria-invalid={error ? true : undefined}
      aria-describedby={error || hint ? description : undefined} />
    {(error || hint) && <span id={description} className={error ? 'field-error' : 'field-hint'}>{error || hint}</span>}
  </div>
}
