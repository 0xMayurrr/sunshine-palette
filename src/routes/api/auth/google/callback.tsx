import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { handleGoogleCallbackFn } from '@/lib/google-server-actions'

export const Route = createFileRoute('/api/auth/google/callback')({
  component: GoogleApiCallbackPage,
})

function GoogleApiCallbackPage() {
  const [status, setStatus] = useState('Connecting Google Calendar...')
  const [error, setError] = useState('')

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const errorParam = searchParams.get('error')

    if (errorParam) {
      setError(`Google OAuth error: ${errorParam}`)
      return
    }

    if (!code) {
      setError('No authorization code returned from Google.')
      return
    }

    const userId = state || 'a30a0728-cebc-443e-918a-d2454b5a6333'
    handleGoogleCallbackFn({ data: { code, userId, origin: window.location.origin } })
      .then((result) => {
        console.log('Google callback result:', result)
        setStatus(`Google Calendar connected successfully! (${result.email || 'success'}) Redirecting...`)
        setTimeout(() => {
          window.location.href = '/?google_connected=true'
        }, 1200)
      })
      .catch((err) => {
        console.error('Google Callback Error:', err)
        setError(err.message || 'Failed to complete Google Calendar authorization.')
      })
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl space-y-5">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
          <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
          </svg>
        </div>

        {error ? (
          <div className="space-y-3">
            <h2 className="font-display text-xl font-bold text-destructive">Connection Failed</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">{error}</p>
            <div className="pt-3">
              <button
                onClick={() => { window.location.href = '/' }}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-5 text-xs font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition-all cursor-pointer"
              >
                Return to Calendar
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="font-display text-lg font-bold text-foreground">{status}</h2>
            <div className="flex justify-center pt-2">
              <img src="/favicon.png" alt="Buildicy Logo" className="size-10 object-contain animate-logo-spin drop-shadow-md" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
