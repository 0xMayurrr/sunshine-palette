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
    service: 'gmail',
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
  const timeWindow = `${payload.startTime} - ${payload.endTime}`
  const timingNotice = formatMinutesLabel(payload.minutesBefore)

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meeting Reminder - Buildicy Calendar</title>
</head>
<body style="margin:0; padding:0; background-color:#09090B; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#FFFFFF;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#09090B; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="580" border="0" cellspacing="0" cellpadding="0" style="max-width:580px; background-color:#121215; border:1px solid #27272A; border-radius:4px; overflow:hidden;">
          
          <!-- Header -->
          <tr>
            <td style="padding:28px 32px; border-bottom:1px solid #27272A; background-color:#18181B;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size:18px; font-weight:800; letter-spacing:0.5px; color:#FFFFFF; text-transform:uppercase;">
                      BUILDICY<span style="color:#7C3AED;">CALENDAR</span>
                    </span>
                  </td>
                  <td align="right">
                    <span style="font-size:10px; font-weight:700; color:#7C3AED; background-color:#2E1065; padding:4px 10px; border-radius:2px; text-transform:uppercase; border:1px solid #5B21B6;">
                      REMINDER
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding:36px 32px;">
              <p style="margin:0 0 8px 0; font-size:11px; font-weight:700; color:#A1A1AA; text-transform:uppercase; letter-spacing:1px;">
                Starting in ${timingNotice}
              </p>
              <h1 style="margin:0 0 16px 0; font-size:26px; font-weight:800; color:#FFFFFF; line-height:1.2;">
                ${escapeHtml(payload.meetingTitle)}
              </h1>

              <!-- Details Box -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#18181B; border-left:3px solid #7C3AED; margin-bottom:28px; padding:20px;">
                <tr>
                  <td>
                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding-bottom:10px; font-size:13px; color:#A1A1AA; font-weight:600;">Date & Time:</td>
                        <td style="padding-bottom:10px; font-size:13px; color:#FFFFFF; font-weight:700;" align="right">
                          ${escapeHtml(payload.meetingDate)} (${escapeHtml(timeWindow)})
                        </td>
                      </tr>
                      ${payload.clientName ? `
                      <tr>
                        <td style="padding-bottom:10px; font-size:13px; color:#A1A1AA; font-weight:600;">Client / Company:</td>
                        <td style="padding-bottom:10px; font-size:13px; color:#FFFFFF; font-weight:700;" align="right">
                          ${escapeHtml(payload.clientName)}
                        </td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="font-size:13px; color:#A1A1AA; font-weight:600;">Category:</td>
                        <td style="font-size:13px; color:#7C3AED; font-weight:700;" align="right">
                          ${escapeHtml(payload.meetingType)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${payload.description ? `
              <p style="margin:0 0 8px 0; font-size:11px; font-weight:700; color:#A1A1AA; text-transform:uppercase; letter-spacing:0.5px;">Agenda / Description</p>
              <p style="margin:0 0 28px 0; font-size:14px; color:#D4D4D8; line-height:1.5;">
                ${escapeHtml(payload.description)}
              </p>
              ` : ''}

              ${joinLink ? `
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(joinLink)}" target="_blank" style="display:inline-block; background-color:#7C3AED; color:#FFFFFF; font-size:14px; font-weight:800; text-decoration:none; padding:14px 28px; border-radius:2px; text-transform:uppercase; letter-spacing:0.5px;">
                      JOIN GOOGLE MEET
                    </a>
                  </td>
                </tr>
              </table>
              ` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px; border-top:1px solid #27272A; background-color:#18181B; text-align:center;">
              <p style="margin:0; font-size:11px; color:#71717A;">
                Buildicy Founder Workspace &bull; Asia/Kolkata Timezone
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `

  try {
    const info = await transporter.sendMail({
      from: `"Buildicy Calendar" <${fromEmail}>`,
      to: payload.toEmail,
      subject: `[Reminder] ${payload.meetingTitle} (${payload.startTime})`,
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
