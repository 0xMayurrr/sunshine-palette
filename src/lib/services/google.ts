import { google } from 'googleapis'
import { getSupabaseAdmin } from '../supabase-server'

export function getClientCredentials() {
  const clientId = process.env['GOOGLE_CLIENT_ID'] || (typeof process !== 'undefined' ? process.env['GOOGLE_CLIENT_ID'] : '') || ''
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'] || (typeof process !== 'undefined' ? process.env['GOOGLE_CLIENT_SECRET'] : '') || ''
  return { clientId, clientSecret }
}


const GOOGLE_REDIRECT_URI = 'https://calendar.buildicy.com/api/auth/google/callback'

export function getOAuth2Client(customRedirectUri?: string) {
  const { clientId, clientSecret } = getClientCredentials()
  const redirectUri = customRedirectUri || GOOGLE_REDIRECT_URI
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export function getGoogleAuthUrl(userId: string, _currentOrigin?: string): string {
  const { clientId, clientSecret } = getClientCredentials()
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth Client ID and Secret are not configured in environment variables.')
  }

  const oauth2Client = getOAuth2Client(GOOGLE_REDIRECT_URI)

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state: userId,
  })
}

export async function handleGoogleCallback(code: string, userId: string, _currentOrigin?: string) {
  const oauth2Client = getOAuth2Client(GOOGLE_REDIRECT_URI)

  const { tokens } = await oauth2Client.getToken(code)
  oauth2Client.setCredentials(tokens)

  // Fetch email address of connected Google Account
  let googleEmail = ''
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const userinfo = await oauth2.userinfo.get()
    googleEmail = userinfo.data.email || ''
  } catch (e) {
    console.error('Failed to fetch Google userinfo:', e)
  }

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('google_connections')
    .upsert({
      user_id: userId,
      google_account_email: googleEmail,
      access_token: tokens.access_token || '',
      refresh_token: tokens.refresh_token || null,
      token_expiry: tokens.expiry_date || Date.now() + 3600 * 1000,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) {
    throw new Error(`Failed to save Google connection: ${error.message}`)
  }

  return { email: googleEmail }
}

export async function getAuthenticatedGoogleClient(userId: string) {
  const supabase = getSupabaseAdmin()
  const { data: connection, error } = await supabase
    .from('google_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !connection) {
    return null
  }

  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials({
    access_token: connection.access_token,
    refresh_token: connection.refresh_token,
    expiry_date: connection.token_expiry,
  })

  // Check if token expired and refresh if necessary
  if (connection.token_expiry && Date.now() >= connection.token_expiry - 60000 && connection.refresh_token) {
    try {
      const refreshed = await oauth2Client.refreshAccessToken()
      const newTokens = refreshed.credentials
      await supabase
        .from('google_connections')
        .update({
          access_token: newTokens.access_token || connection.access_token,
          token_expiry: newTokens.expiry_date || Date.now() + 3600 * 1000,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
    } catch (refreshErr) {
      console.error('Error refreshing Google token:', refreshErr)
    }
  }

  return oauth2Client
}

export interface GoogleEventPayload {
  title: string
  description?: string | undefined
  date: string // YYYY-MM-DD
  startTime: string // HH:mm
  endTime: string // HH:mm
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function createGoogleCalendarEvent(userId: string, payload: GoogleEventPayload): Promise<{ googleEventId?: string | undefined; googleMeetLink?: string | undefined; error?: string | undefined }> {
  const auth = await getAuthenticatedGoogleClient(userId)
  if (!auth) {
    return { error: 'Google Calendar is not connected for this user.' }
  }

  const calendar = google.calendar({ version: 'v3', auth })

  const startIso = `${payload.date}T${payload.startTime}:00`
  const endIso = `${payload.date}T${payload.endTime}:00`

  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const event = await calendar.events.insert({
        calendarId: 'primary',
        conferenceDataVersion: 1,
        requestBody: {
          summary: payload.title,
          description: payload.description || 'Buildicy Calendar Meeting',
          start: {
            dateTime: new Date(startIso).toISOString(),
            timeZone: 'Asia/Kolkata',
          },
          end: {
            dateTime: new Date(endIso).toISOString(),
            timeZone: 'Asia/Kolkata',
          },
          conferenceData: {
            createRequest: {
              requestId: `buildicy-${Date.now()}-${Math.random().toString(36).substring(7)}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        },
      })

      const googleEventId = event.data.id || undefined
      const googleMeetLink = event.data.hangoutLink || event.data.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || undefined
      return { googleEventId, googleMeetLink }
    } catch (err: any) {
      const isNetworkError = err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.message?.includes('ECONNRESET')
      console.error(`[Google Calendar API Error] Attempt ${attempt}/${maxAttempts}:`, err.message)
      if (attempt < maxAttempts && isNetworkError) {
        await sleep(1000 * attempt) // 1s, then 2s
        continue
      }
      // After all retries or non-network error — return gracefully, meeting still saves without Meet link
      return { error: err.message || 'Failed to create Google Calendar event' }
    }
  }

  return { error: 'Failed to create Google Calendar event after retries' }
}

export async function updateGoogleCalendarEvent(userId: string, googleEventId: string, payload: GoogleEventPayload): Promise<{ success: boolean; error?: string }> {
  const auth = await getAuthenticatedGoogleClient(userId)
  if (!auth) return { success: false, error: 'Google Calendar not connected' }

  const calendar = google.calendar({ version: 'v3', auth })
  const startIso = `${payload.date}T${payload.startTime}:00`
  const endIso = `${payload.date}T${payload.endTime}:00`

  try {
    await calendar.events.patch({
      calendarId: 'primary',
      eventId: googleEventId,
      requestBody: {
        summary: payload.title,
        description: payload.description || 'Buildicy Calendar Meeting',
        start: {
          dateTime: new Date(startIso).toISOString(),
          timeZone: 'Asia/Kolkata',
        },
        end: {
          dateTime: new Date(endIso).toISOString(),
          timeZone: 'Asia/Kolkata',
        },
      },
    })
    return { success: true }
  } catch (err: any) {
    console.error('[Google Calendar Update Error]', err)
    return { success: false, error: err.message }
  }
}

export async function deleteGoogleCalendarEvent(userId: string, googleEventId: string): Promise<{ success: boolean; error?: string }> {
  const auth = await getAuthenticatedGoogleClient(userId)
  if (!auth) return { success: false, error: 'Google Calendar not connected' }

  const calendar = google.calendar({ version: 'v3', auth })

  try {
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: googleEventId,
    })
    return { success: true }
  } catch (err: any) {
    console.error('[Google Calendar Delete Error]', err)
    return { success: false, error: err.message }
  }
}
