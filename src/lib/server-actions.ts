import { createServerFn } from '@tanstack/react-start'

export { getGoogleConnectUrlFn, handleGoogleCallbackFn, disconnectGoogleFn } from './google-server-actions'

export interface CreateMeetingInput {
  userId: string
  title: string
  clientName?: string | undefined
  description?: string | undefined
  date: string
  startTime: string
  endTime: string
  meetingType: string
  color: string
  meetingLink?: string | undefined
  googleEventId?: string | undefined
  googleMeetLink?: string | undefined
  reminders: string[]
  reminderEmails?: string[] | undefined
}

export const createMeetingFn = createServerFn({ method: 'POST' })
  .validator((data: CreateMeetingInput) => data)
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import('./supabase-server')
    const { scheduleRemindersForMeeting } = await import('./services/reminders')
    const supabase = getSupabaseAdmin()

    let googleEventId: string | undefined = data.googleEventId
    let googleMeetLink: string | undefined = data.googleMeetLink

    const { data: inserted, error } = await supabase
      .from('meetings')
      .insert({
        user_id: data.userId,
        title: data.title,
        client_name: data.clientName || '',
        description: data.description || '',
        date: data.date,
        start_time: data.startTime,
        end_time: data.endTime,
        meeting_type: data.meetingType,
        color: data.color || data.meetingType,
        meeting_link: data.meetingLink || '',
        google_event_id: googleEventId || null,
        google_meet_link: googleMeetLink || null,
        reminder_emails: data.reminderEmails || [],
        status: 'scheduled',
      })
      .select()
      .maybeSingle()

    if (error || !inserted) {
      throw new Error(`Failed to save meeting in database: ${error?.message || 'Database insert failed'}`)
    }

    if (data.reminders && data.reminders.length) {
      try {
        await scheduleRemindersForMeeting(data.userId, inserted.id, data.date, data.startTime, data.reminders, data.reminderEmails || [])
      } catch (rErr) {
        console.error('Reminder scheduling warning:', rErr)
      }
    }

    return {
      meeting: inserted,
      googleCreated: Boolean(googleEventId),
      googleMeetLink,
    }
  })

export interface UpdateMeetingInput {
  userId: string
  meetingId: string
  title: string
  clientName?: string | undefined
  description?: string | undefined
  date: string
  startTime: string
  endTime: string
  meetingType: string
  color: string
  meetingLink?: string | undefined
  googleEventId?: string | undefined
  reminders: string[]
  reminderEmails?: string[] | undefined
}

export const updateMeetingFn = createServerFn({ method: 'POST' })
  .validator((data: UpdateMeetingInput) => data)
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import('./supabase-server')
    const { updateRemindersForMeeting } = await import('./services/reminders')
    const supabase = getSupabaseAdmin()

    if (data.googleEventId) {
      try {
        const { updateGoogleCalendarEvent } = await import('./services/google')
        await updateGoogleCalendarEvent(data.userId, data.googleEventId, {
          title: data.title,
          description: data.description,
          date: data.date,
          startTime: data.startTime,
          endTime: data.endTime,
        })
      } catch (gErr) {
        console.error('Google calendar update warning:', gErr)
      }
    }

    const { data: updated, error } = await supabase
      .from('meetings')
      .update({
        title: data.title,
        client_name: data.clientName || '',
        description: data.description || '',
        date: data.date,
        start_time: data.startTime,
        end_time: data.endTime,
        meeting_type: data.meetingType,
        color: data.color || data.meetingType,
        meeting_link: data.meetingLink || '',
        updated_at: new Date().toISOString(),
        reminder_emails: data.reminderEmails || [],
      })
      .eq('id', data.meetingId)
      .eq('user_id', data.userId)
      .select()
      .maybeSingle()

    if (error || !updated) {
      throw new Error(`Failed to update meeting: ${error?.message || 'Database update failed'}`)
    }

    try {
      await updateRemindersForMeeting(data.userId, data.meetingId, data.date, data.startTime, data.reminders, data.reminderEmails || [])
    } catch (rErr) {
      console.error('Reminder update warning:', rErr)
    }

    return { meeting: updated }
  })

export const deleteMeetingFn = createServerFn({ method: 'POST' })
  .validator((data: { userId: string; meetingId: string; googleEventId?: string }) => data)
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import('./supabase-server')
    const { cancelRemindersForMeeting } = await import('./services/reminders')
    const supabase = getSupabaseAdmin()

    if (data.googleEventId) {
      const { deleteGoogleCalendarEvent } = await import('./services/google')
      await deleteGoogleCalendarEvent(data.userId, data.googleEventId)
    }

    await cancelRemindersForMeeting(data.meetingId)

    const { error } = await supabase
      .from('meetings')
      .delete()
      .eq('id', data.meetingId)
      .eq('user_id', data.userId)

    if (error) {
      throw new Error(`Failed to delete meeting: ${error.message}`)
    }

    return { success: true }
  })

export const runReminderSchedulerFn = createServerFn({ method: 'POST' })
  .validator((data: { secret?: string }) => data)
  .handler(async ({ data: _data }) => {
    const { processDueReminders } = await import('./services/reminders')
    return processDueReminders()
  })

export const saveDefaultReminderEmailsFn = createServerFn({ method: 'POST' })
  .validator((data: { userId: string; emails: string[] }) => data)
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import('./supabase-server')
    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('profiles')
      .update({ default_reminder_emails: data.emails })
      .eq('user_id', data.userId)
    if (error) throw new Error(`Failed to save default reminder emails: ${error.message}`)
    return { success: true }
  })

export const rsvpMeetingFn = createServerFn({ method: 'POST' })
  .validator((data: { meetingId: string; attendance: 'attending' | 'not_attending' }) => data)
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import('./supabase-server')
    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('meetings')
      .update({ attendance: data.attendance })
      .eq('id', data.meetingId)
    if (error) throw new Error(`Failed to update attendance: ${error.message}`)
    return { success: true, attendance: data.attendance }
  })
