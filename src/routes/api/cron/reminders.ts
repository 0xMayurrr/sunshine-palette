import { createAPIFileRoute } from '@tanstack/react-start/api'
import { processDueReminders } from '@/lib/services/reminders'

export const APIRoute = createAPIFileRoute('/api/cron/reminders')({
  GET: async ({ request }) => {
    const cronSecret = process.env['CRON_SECRET']
    const url = new URL(request.url)
    const secret = url.searchParams.get('secret') || request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace('Bearer ', '')

    if (cronSecret && secret !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized cron trigger' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    }

    try {
      const result = await processDueReminders()
      return new Response(JSON.stringify({ success: true, ...result }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    } catch (err: any) {
      console.error('[Cron API Error]', err)
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    }
  },
  POST: async ({ request }) => {
    const cronSecret = process.env['CRON_SECRET']
    const url = new URL(request.url)
    const secret = url.searchParams.get('secret') || request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace('Bearer ', '')

    if (cronSecret && secret !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized cron trigger' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    }

    try {
      const result = await processDueReminders()
      return new Response(JSON.stringify({ success: true, ...result }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    } catch (err: any) {
      console.error('[Cron API Error]', err)
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    }
  },
})
