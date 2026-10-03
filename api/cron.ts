import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

const supabase = createClient(
  process.env['VITE_SUPABASE_URL'] || '',
  process.env['SUPABASE_SERVICE_ROLE_KEY'] || ''
)

function getTransporter() {
  const user = process.env['GMAIL_USER'] || ''
  const pass = process.env['GMAIL_APP_PASSWORD'] || ''
  if (!user || !pass) return null
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // SSL/TLS
    auth: { user, pass },
  })
}

function formatMinutesLabel(minutes: number): string {
  if (minutes >= 10080) return '1 week'
  if (minutes >= 1440) return `${Math.round(minutes / 1440)} day(s)`
  if (minutes >= 60) return `${Math.round(minutes / 60)} hour(s)`
  return `${minutes} minutes`
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (m) => {
    switch (m) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      case "'": return '&#039;'
      default: return m
    }
  })
}

async function sendEmail(toEmail: string, payload: any) {
  const transporter = getTransporter()
  const fromEmail = process.env['GMAIL_USER'] || ''
  if (!transporter) return { success: false, error: 'Gmail not configured' }

  const joinLink = payload.googleMeetLink || payload.meetingLink || ''
  const timingNotice = formatMinutesLabel(payload.minutesBefore)
  const timeWindow = `${payload.startTime} - ${payload.endTime}`

  const html = `
<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Meeting Reminder</title></head>
<body style="margin:0;padding:0;background-color:#09090B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#FFFFFF;">
<table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#09090B;padding:40px 20px;">
<tr><td align="center">
<table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:580px;background-color:#121215;border:1px solid #27272A;border-radius:4px;overflow:hidden;">
<tr><td style="padding:28px 32px;border-bottom:1px solid #27272A;background-color:#18181B;">
<table width="100%" border="0" cellspacing="0" cellpadding="0"><tr>
<td><span style="font-size:18px;font-weight:800;color:#FFFFFF;text-transform:uppercase;">BUILDICY<span style="color:#7C3AED;">CALENDAR</span></span></td>
<td align="right"><span style="font-size:10px;font-weight:700;color:#7C3AED;background-color:#2E1065;padding:4px 10px;border-radius:2px;text-transform:uppercase;border:1px solid #5B21B6;">REMINDER</span></td>
</tr></table></td></tr>
<tr><td style="padding:36px 32px;">
<p style="margin:0 0 8px 0;font-size:11px;font-weight:700;color:#A1A1AA;text-transform:uppercase;letter-spacing:1px;">Starting in ${timingNotice}</p>
<h1 style="margin:0 0 16px 0;font-size:26px;font-weight:800;color:#FFFFFF;">${escapeHtml(payload.meetingTitle)}</h1>
<table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#18181B;border-left:3px solid #7C3AED;margin-bottom:28px;padding:20px;">
<tr><td>
<table width="100%" border="0" cellspacing="0" cellpadding="0">
<tr><td style="padding-bottom:10px;font-size:13px;color:#A1A1AA;font-weight:600;">Date & Time:</td><td style="padding-bottom:10px;font-size:13px;color:#FFFFFF;font-weight:700;" align="right">${escapeHtml(payload.meetingDate)} (${escapeHtml(timeWindow)})</td></tr>
${payload.clientName ? `<tr><td style="padding-bottom:10px;font-size:13px;color:#A1A1AA;font-weight:600;">Client:</td><td style="padding-bottom:10px;font-size:13px;color:#FFFFFF;font-weight:700;" align="right">${escapeHtml(payload.clientName)}</td></tr>` : ''}
<tr><td style="font-size:13px;color:#A1A1AA;font-weight:600;">Category:</td><td style="font-size:13px;color:#7C3AED;font-weight:700;" align="right">${escapeHtml(payload.meetingType)}</td></tr>
</table></td></tr></table>
${joinLink ? `<table width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td align="center"><a href="${escapeHtml(joinLink)}" target="_blank" style="display:inline-block;background-color:#7C3AED;color:#FFFFFF;font-size:14px;font-weight:800;text-decoration:none;padding:14px 28px;border-radius:2px;text-transform:uppercase;">JOIN GOOGLE MEET</a></td></tr></table>` : ''}
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #27272A;background-color:#18181B;text-align:center;"><p style="margin:0;font-size:11px;color:#71717A;">Buildicy Founder Workspace &bull; Asia/Kolkata Timezone</p></td></tr>
</table></td></tr></table></body></html>`

  try {
    const info = await transporter.sendMail({
      from: `"Buildicy Calendar" <${fromEmail}>`,
      to: toEmail,
      subject: `[Reminder] ${payload.meetingTitle} (${payload.startTime})`,
      html,
    })
    return { success: true, id: info.messageId }
  } catch (err: any) {
    console.error('[Gmail SMTP Error]', err.message)
    return { success: false, error: err.message }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env['CRON_SECRET']
  const secret = (req.query['secret'] as string) || req.headers['x-cron-secret'] as string || ''

  if (cronSecret && secret !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const nowIso = new Date().toISOString()

    const { data: dueReminders, error } = await supabase
      .from('reminders')
      .select('*, meetings(*)')
      .eq('status', 'pending')
      .lte('scheduled_for', nowIso)

    if (error || !dueReminders || !dueReminders.length) {
      return res.status(200).json({ success: true, processed: 0, sent: 0, failed: 0 })
    }

    const userIds = [...new Set(dueReminders.map((r: any) => r.user_id))]
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('user_id, email, name')
      .in('user_id', userIds)
    const profileMap: Record<string, { email: string; name: string }> = {}
    for (const p of profileRows || []) profileMap[p.user_id] = p

    let sentCount = 0
    let failedCount = 0

    for (const reminder of dueReminders) {
      const { data: claimed } = await supabase
        .from('reminders')
        .update({ status: 'processing' })
        .eq('id', reminder.id)
        .eq('status', 'pending')
        .select()

      if (!claimed || claimed.length === 0) continue

      const meeting = reminder.meetings
      if (!meeting || meeting.status === 'cancelled') {
        await supabase.from('reminders').update({ status: 'cancelled' }).eq('id', reminder.id)
        continue
      }

      const profile = profileMap[reminder.user_id]
      let primaryEmail = profile?.email || ''
      const recipientName = profile?.name || 'Founder'

      if (!primaryEmail) {
        const { data: authUser } = await supabase.auth.admin.getUserById(reminder.user_id)
        primaryEmail = authUser?.user?.email || ''
      }

      if (!primaryEmail) {
        await supabase.from('reminders').update({ status: 'failed' }).eq('id', reminder.id)
        failedCount++
        continue
      }

      const emailPayload = {
        userName: recipientName,
        meetingTitle: meeting.title,
        clientName: meeting.client_name || '',
        meetingDate: meeting.date,
        startTime: meeting.start_time,
        endTime: meeting.end_time,
        meetingType: meeting.meeting_type,
        description: meeting.description,
        googleMeetLink: meeting.google_meet_link,
        meetingLink: meeting.meeting_link,
        minutesBefore: reminder.minutes_before,
      }

      const result = await sendEmail(primaryEmail, emailPayload)

      const extraEmails: string[] = reminder.reminder_emails || []
      for (const extraEmail of extraEmails) {
        if (extraEmail && extraEmail !== primaryEmail) {
          await sendEmail(extraEmail, emailPayload)
        }
      }

      if (result.success) {
        await supabase.from('reminders').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', reminder.id)
        sentCount++
      } else {
        await supabase.from('reminders').update({ status: 'failed' }).eq('id', reminder.id)
        failedCount++
      }
    }

    return res.status(200).json({ success: true, processed: dueReminders.length, sent: sentCount, failed: failedCount })
  } catch (err: any) {
    console.error('[Cron Error]', err)
    return res.status(500).json({ error: err.message })
  }
}
