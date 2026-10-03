import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { handleGoogleCallbackFn } from '@/lib/google-server-actions'
import { useAuth } from '@/lib/auth-context'

export const Route = createFileRoute('/google-callback')({
  component: GoogleCallbackPage,
})

function GoogleCallbackPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [status, setStatus] = useState('Connecting Google Calendar...')
  const [error, setError] = useState('')

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const code = searchParams.get('code')
    const errorParam = searchParams.get('error')
    const stateUserId = searchParams.get('state')

    if (errorParam) {
      setError(`Google OAuth error: ${errorParam}`)
      return
    }

    if (!code) {
      setError('No authorization code returned from Google.')
      return
    }

    if (!stateUserId) {
      setError('Session expired. Please try connecting Google Calendar again.')
      return
    }

    handleGoogleCallbackFn({ data: { code, userId: stateUserId, origin: 'https://calendar.buildicy.com' } })
      .then(() => {
        setStatus('Google Calendar connected successfully! Redirecting...')
        setTimeout(() => {
          navigate({ to: '/' })
        }, 1500)
      })
      .catch((err) => {
        console.error('Google Callback Error:', err)
        setError(err.message || 'Failed to complete Google Calendar authorization.')
      })
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-md border border-border bg-card p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-sm bg-primary/10 text-primary">
          <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
          </svg>
        </div>

        {error ? (
          <div>
            <h2 className="font-display text-lg font-bold text-destructive">Connection Failed</h2>
            <p className="mt-2 text-xs text-muted-foreground">{error}</p>
            <button
              onClick={() => navigate({ to: '/' })}
              className="mt-6 inline-flex h-9 items-center justify-center rounded-sm bg-primary px-4 text-xs font-bold text-primary-foreground"
            >
              Return to Calendar
            </button>
          </div>
        ) : (
          <div>
            <h2 className="font-display text-lg font-bold">{status}</h2>
            <div className="mt-4 flex justify-center">
              <img src="/favicon.png" alt="Buildicy Logo" className="size-10 object-contain animate-logo-spin" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
