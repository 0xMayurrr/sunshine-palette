import { createAPIFileRoute } from '@tanstack/react-start/api'

export const APIRoute = createAPIFileRoute('/api/auth/google/callback')({
  GET: async ({ request }) => {
    const url = new URL(request.url)
    const code = url.searchParams.get('code') || ''
    const error = url.searchParams.get('error') || ''

    const targetUrl = new URL('/', request.url)
    if (code) targetUrl.searchParams.set('google_code', code)
    if (error) targetUrl.searchParams.set('google_error', error)

    return new Response(null, {
      status: 302,
      headers: { Location: targetUrl.toString() },
    })
  },
})
