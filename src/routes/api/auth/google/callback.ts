import { createAPIFileRoute } from '@tanstack/react-start/api'

export const APIRoute = createAPIFileRoute('/api/auth/google/callback')({
  GET: async ({ request }) => {
    const url = new URL(request.url)
    const code = url.searchParams.get('code') || ''
    const state = url.searchParams.get('state') || ''
    const error = url.searchParams.get('error') || ''

    const targetUrl = new URL('/google-callback', request.url)
    if (code) targetUrl.searchParams.set('code', code)
    if (state) targetUrl.searchParams.set('state', state)
    if (error) targetUrl.searchParams.set('error', error)

    return new Response(null, {
      status: 302,
      headers: {
        Location: targetUrl.toString(),
      },
    })
  },
})
