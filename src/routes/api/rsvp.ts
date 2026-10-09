import { createAPIFileRoute } from '@tanstack/react-start/api'

export const APIRoute = createAPIFileRoute('/api/rsvp')({
  GET: async ({ request }) => {
    const url = new URL(request.url)
    const meetingId = url.searchParams.get('meetingId') || ''
    const attendance = url.searchParams.get('attendance') as 'attending' | 'not_attending' | null

    if (!meetingId || !attendance || !['attending', 'not_attending'].includes(attendance)) {
      return new Response('Invalid RSVP link.', { status: 400 })
    }

    try {
      const { getSupabaseAdmin } = await import('../../lib/supabase-server')
      const supabase = getSupabaseAdmin()
      await supabase.from('meetings').update({ attendance }).eq('id', meetingId)

      const label = attendance === 'attending' ? 'Attending' : 'Not Attending'
      const color = attendance === 'attending' ? '#16a34a' : '#dc2626'
      const icon = attendance === 'attending' ? '✅' : '❌'

      return new Response(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>RSVP Confirmed</title></head>
        <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f4f4f5;">
          <div style="text-align:center;background:#fff;padding:48px 40px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:400px;">
            <div style="font-size:48px;margin-bottom:16px;">${icon}</div>
            <h2 style="margin:0 0 8px;color:#09090b;font-size:22px;">Response Recorded</h2>
            <p style="color:#71717a;margin:0 0 24px;font-size:14px;">You marked yourself as <strong style="color:${color};">${label}</strong> for this meeting.</p>
            <a href="https://calendar.buildicy.com" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Open Calendar</a>
          </div>
        </body></html>`,
        { status: 200, headers: { 'content-type': 'text/html' } }
      )
    } catch {
      return new Response('Failed to record RSVP.', { status: 500 })
    }
  },
})
