import { createServerFn } from '@tanstack/react-start'

export const getGoogleConnectUrlFn = createServerFn({ method: 'POST' })
  .validator((data: { userId: string; origin?: string }) => data)
  .handler(async ({ data }) => {
    const { getGoogleAuthUrl } = await import('./services/google')
    const url = getGoogleAuthUrl(data.userId, data.origin)
    return { url }
  })

export const handleGoogleCallbackFn = createServerFn({ method: 'POST' })
  .validator((data: { code: string; userId: string; origin?: string }) => data)
  .handler(async ({ data }) => {
    const { handleGoogleCallback } = await import('./services/google')
    return handleGoogleCallback(data.code, data.userId, data.origin)
  })

export const createGoogleMeetLinkFn = createServerFn({ method: 'POST' })
  .validator((data: { userId: string; title: string; date: string; startTime: string; endTime: string }) => data)
  .handler(async ({ data }) => {
    const { createGoogleCalendarEvent } = await import('./services/google')
    const result = await createGoogleCalendarEvent(data.userId, {
      title: data.title || 'Buildicy Meeting',
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
    })
    // Return error as data instead of throwing — lets the UI show a proper message
    if (result.error) return { googleMeetLink: '', googleEventId: '', error: result.error }
    return { googleMeetLink: result.googleMeetLink || '', googleEventId: result.googleEventId || '', error: '' }
  })

export const disconnectGoogleFn = createServerFn({ method: 'POST' })
  .validator((data: { userId: string }) => data)
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import('./supabase-server')
    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('google_connections')
      .delete()
      .eq('user_id', data.userId)

    if (error) {
      throw new Error(`Failed to disconnect Google Calendar: ${error.message}`)
    }

    return { success: true }
  })
