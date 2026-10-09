import { createAPIFileRoute } from '@tanstack/react-start/api'

const SHARED_OWNER_ID = 'a30a0728-cebc-443e-918a-d2454b5a6333'

export const APIRoute = createAPIFileRoute('/api/auth/google/callback')({
  GET: async ({ request }) => {
    const url = new URL(request.url)
    const code = url.searchParams.get('code') || ''
    const error = url.searchParams.get('error') || ''

    if (error || !code) {
      return new Response(null, {
        status: 302,
        headers: { Location: `/?google_error=${encodeURIComponent(error || 'no_code')}` },
      })
    }

    try {
      const { handleGoogleCallback } = await import('@/lib/services/google')
      await handleGoogleCallback(code, SHARED_OWNER_ID)
      return new Response(null, {
        status: 302,
        headers: { Location: '/?google_connected=1' },
      })
    } catch (err: any) {
      console.error('Google OAuth callback error:', err)
      return new Response(null, {
        status: 302,
        headers: { Location: `/?google_error=${encodeURIComponent(err.message || 'unknown')}` },
      })
    }
  },
})
