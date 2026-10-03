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
  const timeWindow = `${payload.startTime} – ${payload.endTime}`

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Meeting Reminder</title></head>
<body style="margin:0;padding:0;background-color:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#F4F4F5;padding:40px 16px;">
<tr><td align="center">
<table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:560px;">
  <tr><td style="padding-bottom:20px;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0"><tr>
      <td><span style="font-size:15px;font-weight:800;letter-spacing:1px;color:#18181B;">BUILDICY<span style="color:#7C3AED;">CALENDAR</span></span></td>
      <td align="right"><span style="font-size:10px;font-weight:700;color:#7C3AED;background-color:#EDE9FE;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">Meeting Reminder</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <table width="100%" border="0" cellspacing="0" cellpadding="0">
      <tr><td style="background-color:#7C3AED;padding:4px 0;"></td></tr>
      <tr><td style="padding:36px 36px 28px;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:1px;">Starting in ${timingNotice}</p>
        <h1 style="margin:0 0 24px;font-size:24px;font-weight:800;color:#09090B;line-height:1.3;">${escapeHtml(payload.meetingTitle)}</h1>
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#FAFAFA;border:1px solid #E4E4E7;border-radius:8px;margin-bottom:24px;">
          <tr><td style="padding:20px 24px;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td style="padding-bottom:12px;font-size:12px;color:#71717A;font-weight:600;">📅 &nbsp;Date</td>
                <td style="padding-bottom:12px;font-size:13px;color:#18181B;font-weight:700;" align="right">${escapeHtml(payload.meetingDate)}</td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;font-size:12px;color:#71717A;font-weight:600;">🕐 &nbsp;Time</td>
                <td style="padding-bottom:12px;font-size:13px;color:#18181B;font-weight:700;" align="right">${escapeHtml(timeWindow)} IST</td>
              </tr>
              ${payload.clientName ? `<tr>
                <td style="padding-bottom:12px;font-size:12px;color:#71717A;font-weight:600;">👤 &nbsp;Client</td>
                <td style="padding-bottom:12px;font-size:13px;color:#18181B;font-weight:700;" align="right">${escapeHtml(payload.clientName)}</td>
              </tr>` : ''}
              <tr>
                <td style="font-size:12px;color:#71717A;font-weight:600;">🏷️ &nbsp;Type</td>
                <td style="font-size:13px;color:#7C3AED;font-weight:700;" align="right">${escapeHtml(payload.meetingType)}</td>
              </tr>
            </table>
          </td></tr>
        </table>
        ${payload.description ? `<p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#71717A;text-transform:uppercase;letter-spacing:0.5px;">Agenda</p><p style="margin:0 0 24px;font-size:14px;color:#3F3F46;line-height:1.6;background:#FAFAFA;border-left:3px solid #7C3AED;padding:12px 16px;border-radius:0 6px 6px 0;">${escapeHtml(payload.description)}</p>` : ''}
        ${joinLink ? `<table width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding-top:8px;"><a href="${escapeHtml(joinLink)}" target="_blank" style="display:inline-block;background-color:#7C3AED;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:0.3px;">Join Google Meet →</a></td></tr></table>` : ''}
      </td></tr>
      <tr><td style="padding:16px 36px;border-top:1px solid #F4F4F5;text-align:center;">
        <p style="margin:0;font-size:11px;color:#A1A1AA;">Buildicy Founder Workspace &bull; Asia/Kolkata (IST) &bull; This is an automated reminder</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</td></tr></table>
</body></html>`

  try {
    const info = await transporter.sendMail({
      from: `"Buildicy Calendar" <${fromEmail}>`,
      to: toEmail,
      subject: `⏰ Reminder: ${payload.meetingTitle} starts in ${timingNotice}`,
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
  const secret = (req.query['secret'] as string) || (req.headers['x-cron-secret'] as string) || ''
  const authHeader = (req.headers['authorization'] as string) || ''
  const isVercelCron = req.headers['x-vercel-cron'] === '1'

  const isAuthorized =
    !cronSecret ||
    isVercelCron ||
    secret === cronSecret ||
    authHeader === `Bearer ${cronSecret}`

  if (!isAuthorized) {
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
