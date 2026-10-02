import { createFileRoute, useNavigate } from '@tanstack/react-router'
import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const { user, signInWithGoogle } = useAuth()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [infoMsg, setInfoMsg] = useState('')
  const [loading, setLoading] = useState(false)

  // Redirect if already logged in
  React.useEffect(() => {
    if (user) {
      navigate({ to: '/' })
    }
  }, [user, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setInfoMsg('')
    setLoading(true)

    const cleanEmail = email.trim().toLowerCase()

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
        })
        if (error) throw error

        if (data?.session) {
          navigate({ to: '/' })
          return
        }

        // Try direct sign in immediately after signup
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        })

        if (!signInErr && signInData?.session) {
          navigate({ to: '/' })
          return
        }

        setInfoMsg('Account created successfully! You can now sign in with your password.')
        setIsSignUp(false)
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        })
        if (error) throw error

        if (data?.session) {
          navigate({ to: '/' })
          return
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
      {/* Brand Badge */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 p-2 shadow-lg">
          <img src="/favicon.png" alt="Buildicy Logo" className="size-10 object-contain" />
        </div>
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            BUILDICY<span className="text-primary">CALENDAR</span>
          </h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-0.5">
            Sign In to your workspace
          </p>
        </div>
      </div>

      {/* Auth Box */}
      <div className="w-full max-w-md border border-border bg-card p-6 shadow-xl sm:p-8 rounded-lg">
        <div className="mb-6 text-center">
          <h2 className="font-display text-xl font-bold">
            {isSignUp ? 'Create Account' : 'Welcome back'}<span className="text-primary">.</span>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {isSignUp
              ? 'Enter an email & password to create a new Buildicy account'
              : 'Enter your credentials to access your Buildicy calendar'}
          </p>
        </div>

        {infoMsg && (
          <div className="mb-4 border-l-2 border-primary bg-primary/10 p-3 text-xs text-primary font-medium">
            {infoMsg}
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 border-l-2 border-destructive bg-destructive/10 p-3 text-xs text-destructive font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              placeholder="founder@buildicy.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary rounded-sm"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
              Password
            </label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary rounded-sm"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-sm font-bold uppercase text-xs tracking-wider shadow-none"
          >
            {loading ? 'Authenticating...' : isSignUp ? 'Create Account' : 'Sign In'}
          </Button>
        </form>

        <div className="relative my-5 text-center">
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
          <span className="relative bg-card px-3 text-[10px] font-bold uppercase text-muted-foreground">
            OR
          </span>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={signInWithGoogle}
          className="w-full h-11 rounded-sm font-semibold text-xs justify-center gap-2 border-border shadow-none"
        >
          <svg className="size-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          Continue with Google
        </Button>

        <div className="mt-5 text-center text-xs">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp)
              setErrorMsg('')
              setInfoMsg('')
            }}
            className="text-muted-foreground hover:text-primary font-medium transition-colors"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
          </button>
        </div>
      </div>
    </div>
  )
}




