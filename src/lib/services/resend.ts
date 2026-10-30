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
    console.warn('[Gmail] GMAIL_USER or GMAIL_APP_PASSWORD not configured. Cannot send email.', payload)
    return { success: false, error: 'Gmail SMTP credentials (GMAIL_USER or GMAIL_APP_PASSWORD) not configured.' }
  }

  const joinLink = payload.googleMeetLink || payload.meetingLink || ''
  const timeWindow = `${payload.startTime} – ${payload.endTime}`
  const timingNotice = formatMinutesLabel(payload.minutesBefore)

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Meeting Reminder</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulseGlow {
    0%, 100% { box-shadow: 0 0 0 0 rgba(124,58,237,0.18); }
    50%       { box-shadow: 0 0 0 8px rgba(124,58,237,0); }
  }
  @keyframes shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position: 400px 0; }
  }
  @keyframes badgePop {
    0%   { transform: scale(0.7); opacity: 0; }
    70%  { transform: scale(1.08); }
    100% { transform: scale(1); opacity: 1; }
  }
  .card        { animation: fadeSlideIn 0.55s cubic-bezier(.22,.68,0,1.2) both; }
  .cta-btn     { animation: pulseGlow 2.4s ease-in-out infinite; }
  .badge-pill  { animation: badgePop 0.5s cubic-bezier(.22,.68,0,1.2) 0.3s both; }
  .shimmer-bar {
    background: linear-gradient(90deg,#7C3AED 0%,#A855F7 40%,#6D28D9 60%,#7C3AED 100%);
    background-size: 800px 4px;
    animation: shimmer 2.2s linear infinite;
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#F0EDFB;font-family:'DM Sans',system-ui,sans-serif;">

<table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#F0EDFB;padding:48px 16px 40px;">
<tr><td align="center">
<table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:580px;">

  <!-- Logo row -->
  <tr><td style="padding-bottom:24px;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0"><tr>
      <td>
        <span style="font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:800;letter-spacing:2px;color:#18181B;">BUILDICY</span><span style="font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:800;letter-spacing:2px;color:#7C3AED;">CALENDAR</span>
      </td>
      <td align="right">
        <span class="badge-pill" style="display:inline-block;font-family:'DM Sans',sans-serif;font-size:10px;font-weight:700;color:#7C3AED;background:linear-gradient(135deg,#EDE9FE,#DDD6FE);padding:5px 14px;border-radius:20px;text-transform:uppercase;letter-spacing:1.2px;border:1px solid #C4B5FD;">Meeting Reminder</span>
      </td>
    </tr></table>
  </td></tr>

  <!-- Main card -->
  <tr><td class="card" style="background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(124,58,237,0.10),0 1px 4px rgba(0,0,0,0.06);">
    <table width="100%" border="0" cellspacing="0" cellpadding="0">

      <!-- Animated shimmer top bar -->
      <tr><td class="shimmer-bar" style="height:4px;"></td></tr>

      <!-- Hero section -->
      <tr><td style="background:linear-gradient(135deg,#1E1B4B 0%,#312E81 50%,#4C1D95 100%);padding:36px 40px 32px;">
        <p style="margin:0 0 10px;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:700;color:#A78BFA;text-transform:uppercase;letter-spacing:2px;">Starting in</p>
        <p style="margin:0 0 16px;font-family:'Space Grotesk',sans-serif;font-size:38px;font-weight:800;color:#FFFFFF;line-height:1;letter-spacing:-1px;">${timingNotice}</p>
        <div style="width:40px;height:3px;background:linear-gradient(90deg,#A78BFA,#7C3AED);border-radius:2px;margin-bottom:20px;"></div>
        <h1 style="margin:0;font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;color:#EDE9FE;line-height:1.35;">${escapeHtml(payload.meetingTitle)}</h1>
      </td></tr>

      <!-- Details grid -->
      <tr><td style="padding:32px 40px 24px;">

        <!-- Highlighted time block -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,#F5F3FF,#EDE9FE);border:1.5px solid #C4B5FD;border-radius:12px;margin-bottom:20px;">
          <tr><td style="padding:20px 24px;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td style="width:50%;padding-right:12px;">
                  <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:1.2px;">Date</p>
                  <p style="margin:0;font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:700;color:#1E1B4B;">${escapeHtml(payload.meetingDate)}</p>
                </td>
                <td style="width:50%;padding-left:12px;border-left:1.5px solid #C4B5FD;">
                  <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:1.2px;">Time (IST)</p>
                  <p style="margin:0;font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:700;color:#1E1B4B;">${escapeHtml(timeWindow)}</p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>

        <!-- Other details -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background:#FAFAFA;border:1px solid #E4E4E7;border-radius:10px;margin-bottom:20px;">
          <tr><td style="padding:20px 24px;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
              ${payload.clientName ? `
              <tr>
                <td style="padding-bottom:14px;font-size:11px;font-weight:600;color:#71717A;text-transform:uppercase;letter-spacing:0.8px;">Client</td>
                <td style="padding-bottom:14px;" align="right"><span style="font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:700;color:#09090B;background:#F4F4F5;padding:3px 10px;border-radius:6px;">${escapeHtml(payload.clientName)}</span></td>
              </tr>` : ''}
              <tr>
                <td style="font-size:11px;font-weight:600;color:#71717A;text-transform:uppercase;letter-spacing:0.8px;">Meeting Type</td>
                <td align="right"><span style="font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:700;color:#7C3AED;background:#EDE9FE;padding:3px 12px;border-radius:20px;border:1px solid #C4B5FD;">${escapeHtml(payload.meetingType)}</span></td>
              </tr>
            </table>
          </td></tr>
        </table>

        ${payload.description ? `
        <!-- Agenda -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom:20px;">
          <tr><td>
            <p style="margin:0 0 8px;font-size:10px;font-weight:700;color:#71717A;text-transform:uppercase;letter-spacing:1.2px;">Agenda</p>
            <div style="font-size:14px;color:#3F3F46;line-height:1.7;background:#FAFAFA;border-left:3px solid #7C3AED;padding:14px 18px;border-radius:0 8px 8px 0;font-family:'DM Sans',sans-serif;">${escapeHtml(payload.description)}</div>
          </td></tr>
        </table>` : ''}

        ${joinLink ? `
        <!-- Join CTA -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom:20px;">
          <tr><td align="center">
            <a href="${escapeHtml(joinLink)}" target="_blank" class="cta-btn" style="display:inline-block;background:linear-gradient(135deg,#7C3AED,#6D28D9);color:#FFFFFF;font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:700;text-decoration:none;padding:15px 40px;border-radius:10px;letter-spacing:0.5px;">Join Google Meet &rarr;</a>
          </td></tr>
        </table>` : ''}

        ${payload.meetingId ? `
        <!-- RSVP -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background:#F9FAFB;border:1px solid #E4E4E7;border-radius:10px;padding:0;">
          <tr><td style="padding:20px 24px;">
            <p style="margin:0 0 14px;font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:700;color:#3F3F46;text-transform:uppercase;letter-spacing:1px;text-align:center;">Will you attend this meeting?</p>
            <table width="100%" border="0" cellspacing="0" cellpadding="0"><tr>
              <td style="padding-right:8px;" align="right" width="50%">
                <a href="https://calendar.buildicy.com/api/rsvp?meetingId=${escapeHtml(payload.meetingId)}&attendance=attending" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#16A34A,#15803D);color:#FFFFFF;font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:8px;letter-spacing:0.3px;">Yes, Attending</a>
              </td>
              <td style="padding-left:8px;" align="left" width="50%">
                <a href="https://calendar.buildicy.com/api/rsvp?meetingId=${escapeHtml(payload.meetingId)}&attendance=not_attending" target="_blank" style="display:inline-block;background:#FFFFFF;color:#DC2626;font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:8px;letter-spacing:0.3px;border:1.5px solid #FCA5A5;">Can't Make It</a>
              </td>
            </tr></table>
          </td></tr>
        </table>` : ''}

      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:20px 40px;background:#FAFAFA;border-top:1px solid #F0EDFB;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0"><tr>
          <td>
            <p style="margin:0;font-size:11px;color:#A1A1AA;font-family:'DM Sans',sans-serif;">Buildicy Founder Workspace &bull; Asia/Kolkata (IST)</p>
            <p style="margin:4px 0 0;font-size:10px;color:#C4C4C4;font-family:'DM Sans',sans-serif;">This is an automated reminder. Do not reply to this email.</p>
          </td>
          <td align="right">
            <span style="font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:800;letter-spacing:1.5px;color:#D4D4D8;">BUILDICY</span>
          </td>
        </tr></table>
      </td></tr>

    </table>
  </td></tr>

</table>
</td></tr></table>
</body></html>`

  try {
    const info = await transporter.sendMail({
      from: `"Buildicy Calendar" <${fromEmail}>`,
      to: payload.toEmail,
      subject: `Reminder: ${payload.meetingTitle} starts in ${timingNotice}`,
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
