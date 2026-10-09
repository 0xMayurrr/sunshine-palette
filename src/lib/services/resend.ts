import nodemailer from 'nodemailer'

export interface ReminderEmailPayload {
  toEmail: string
  userName: string
  meetingTitle: string
  clientName: string
  meetingDate: string
  startTime: string
  endTime: string
  meetingType: string
  description?: string
  googleMeetLink?: string
  meetingLink?: string
  minutesBefore: number
  meetingId?: string
}

export function formatMinutesLabel(minutes: number): string {
  if (minutes >= 10080) return '1 week'
  if (minutes >= 1440) return `${Math.round(minutes / 1440)} day(s)`
  if (minutes >= 60) return `${Math.round(minutes / 60)} hour(s)`
  return `${minutes} minutes`
}

function getTransporter() {
  const user = process.env['GMAIL_USER'] || ''
  const pass = process.env['GMAIL_APP_PASSWORD'] || ''

  if (!user || !pass) {
    return null
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // SSL/TLS
    auth: { user, pass },
  })
}

export async function sendMeetingReminderEmail(payload: ReminderEmailPayload): Promise<{ success: boolean; id?: string; error?: string }> {
  const transporter = getTransporter()
  const fromEmail = process.env['GMAIL_USER'] || 'mayurbuildicy@gmail.com'

  if (!transporter) {
    console.warn('[Gmail] GMAIL_USER or GMAIL_APP_PASSWORD not configured. Skipping email.', payload)
    return { success: true, id: 'mock-email-id' }
  }

  const joinLink = payload.googleMeetLink || payload.meetingLink || ''
  const timeWindow = `${payload.startTime} – ${payload.endTime}`
  const timingNotice = formatMinutesLabel(payload.minutesBefore)

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Meeting Reminder</title></head>
<body style="margin:0;padding:0;background-color:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#F4F4F5;padding:40px 16px;">
<tr><td align="center">
<table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:560px;">

  <!-- Brand bar -->
  <tr>
    <td style="padding-bottom:20px;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td><span style="font-size:15px;font-weight:800;letter-spacing:1px;color:#18181B;">BUILDICY<span style="color:#7C3AED;">CALENDAR</span></span></td>
          <td align="right"><span style="font-size:10px;font-weight:700;color:#7C3AED;background-color:#EDE9FE;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">Meeting Reminder</span></td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Main card -->
  <tr>
    <td style="background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

      <!-- Purple top accent -->
      <tr><td style="background-color:#7C3AED;padding:4px 0;"></td></tr>

      <!-- Content -->
      <tr>
        <td style="padding:36px 36px 28px;">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:1px;">Starting in ${timingNotice}</p>
          <h1 style="margin:0 0 24px;font-size:24px;font-weight:800;color:#09090B;line-height:1.3;">${escapeHtml(payload.meetingTitle)}</h1>

          <!-- Details -->
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

          ${payload.description ? `
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#71717A;text-transform:uppercase;letter-spacing:0.5px;">Agenda</p>
          <p style="margin:0 0 24px;font-size:14px;color:#3F3F46;line-height:1.6;background:#FAFAFA;border-left:3px solid #7C3AED;padding:12px 16px;border-radius:0 6px 6px 0;">${escapeHtml(payload.description)}</p>
          ` : ''}

          ${joinLink ? `
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr><td align="center" style="padding-top:8px;">
              <a href="${escapeHtml(joinLink)}" target="_blank" style="display:inline-block;background-color:#7C3AED;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:0.3px;">Join Google Meet →</a>
            </td></tr>
          </table>
          ` : ''}

          ${payload.meetingId ? `
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top:20px;">
            <tr><td style="padding-bottom:10px;text-align:center;font-size:12px;font-weight:700;color:#71717A;text-transform:uppercase;letter-spacing:0.5px;">Will you attend?</td></tr>
            <tr>
              <td align="center">
                <table border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding-right:12px;">
                      <a href="https://calendar.buildicy.com/api/rsvp?meetingId=${escapeHtml(payload.meetingId)}&attendance=attending" target="_blank" style="display:inline-block;background-color:#16A34A;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;">✅ Yes, Attending</a>
                    </td>
                    <td>
                      <a href="https://calendar.buildicy.com/api/rsvp?meetingId=${escapeHtml(payload.meetingId)}&attendance=not_attending" target="_blank" style="display:inline-block;background-color:#DC2626;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;">❌ No, Can't Make It</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          ` : ''}
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding:16px 36px;border-top:1px solid #F4F4F5;text-align:center;">
          <p style="margin:0;font-size:11px;color:#A1A1AA;">Buildicy Founder Workspace &bull; Asia/Kolkata (IST) &bull; This is an automated reminder</p>
        </td>
      </tr>
    </td>
  </tr>

</table>
</td></tr></table>
</body></html>`

  try {
    const info = await transporter.sendMail({
      from: `"Buildicy Calendar" <${fromEmail}>`,
      to: payload.toEmail,
      subject: `⏰ Reminder: ${payload.meetingTitle} starts in ${timingNotice}`,
      html,
    })
    return { success: true, id: info.messageId }
  } catch (err: any) {
    console.error('[Gmail SMTP Error]', err)
    return { success: false, error: err.message || 'Failed to send email' }
  }
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
