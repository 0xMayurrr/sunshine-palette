import { getSupabaseAdmin } from '../supabase-server'
import { sendMeetingReminderEmail } from './resend'

export const REMINDER_MINUTES_MAP: Record<string, number> = {
  '1 week before': 10080,
  '1 day before': 1440,
  '2 hours before': 120,
  '1 hour before': 60,
  '30 minutes before': 30,
  '15 minutes before': 15,
  '5 minutes before': 5,
  '1 month before': 43200,
}

export function parseReminderMinutes(reminderType: string): number {
  if (REMINDER_MINUTES_MAP[reminderType]) {
    return REMINDER_MINUTES_MAP[reminderType]
  }
  const match = reminderType.match(/(\d+)\s*(minute|hour|day|week)/i)
  if (match && match[1] && match[2]) {
    const val = parseInt(match[1], 10)
    const unit = match[2].toLowerCase()
    if (unit.startsWith('week')) return val * 10080
    if (unit.startsWith('day')) return val * 1440
    if (unit.startsWith('hour')) return val * 60
    if (unit.startsWith('minute')) return val
  }
  return 60 // Default fallback: 1 hour
}

export async function scheduleRemindersForMeeting(
  userId: string,
  meetingId: string,
  date: string,
  startTime: string,
  remindersList: string[],
  reminderEmails: string[] = []
) {
  if (!remindersList || !remindersList.length) return

  // Treat date/time as IST (UTC+5:30) — append offset so Node.js doesn't interpret as UTC
  const meetingDateTimeStr = `${date}T${startTime}:00+05:30`
  const meetingTimeMs = new Date(meetingDateTimeStr).getTime()

  if (isNaN(meetingTimeMs)) {
    console.error('Invalid meeting date/time string for reminder calculation:', meetingDateTimeStr)
    return
  }

  const supabase = getSupabaseAdmin()
  const records = []

  for (const reminderType of remindersList) {
    const minutes = parseReminderMinutes(reminderType)
    const scheduledForMs = meetingTimeMs - minutes * 60 * 1000
    const scheduledForIso = new Date(scheduledForMs).toISOString()

    records.push({
      meeting_id: meetingId,
      user_id: userId,
      reminder_type: reminderType,
      minutes_before: minutes,
      scheduled_for: scheduledForIso,
      status: 'pending',
      reminder_emails: reminderEmails,
    })
  }

  const { error } = await supabase.from('reminders').insert(records)
  if (error) {
    console.error('Error inserting scheduled reminders:', error)
  }
}

export async function updateRemindersForMeeting(
  userId: string,
  meetingId: string,
  date: string,
  startTime: string,
  remindersList: string[],
  reminderEmails: string[] = []
) {
  const supabase = getSupabaseAdmin()
  // Cancel old pending reminders for this meeting
  await supabase
    .from('reminders')
    .update({ status: 'cancelled' })
    .eq('meeting_id', meetingId)
    .eq('status', 'pending')

  // Create new reminders
  await scheduleRemindersForMeeting(userId, meetingId, date, startTime, remindersList, reminderEmails)
}

export async function cancelRemindersForMeeting(meetingId: string) {
  const supabase = getSupabaseAdmin()
  await supabase
    .from('reminders')
    .update({ status: 'cancelled' })
    .eq('meeting_id', meetingId)
    .eq('status', 'pending')
}

export async function processDueReminders(): Promise<{ processed: number; sent: number; failed: number }> {
  const supabase = getSupabaseAdmin()
  const nowIso = new Date().toISOString()

  // 1. Fetch pending reminders that are due
  const { data: dueReminders, error } = await supabase
    .from('reminders')
    .select('*, meetings(*)')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso)

  if (error || !dueReminders || !dueReminders.length) {
    return { processed: 0, sent: 0, failed: 0 }
  }

  // Fetch profiles for all unique user_ids in one query
  const userIds = [...new Set(dueReminders.map((r: any) => r.user_id))]
  const { data: profileRows } = await supabase
    .from('profiles')
    .select('user_id, email, name')
    .in('user_id', userIds)
  const profileMap: Record<string, { email: string; name: string }> = {}
  for (const p of profileRows || []) {
    profileMap[p.user_id] = p
  }

  let sentCount = 0
  let failedCount = 0

  for (const reminder of dueReminders) {
    // 2. Atomic lock / claim reminder to prevent duplicate processing
    const { data: claimed, error: claimError } = await supabase
      .from('reminders')
      .update({ status: 'processing' })
      .eq('id', reminder.id)
      .eq('status', 'pending')
      .select()

    if (claimError || !claimed || claimed.length === 0) {
      continue // Already claimed by another worker
    }

    const meeting = reminder.meetings
    const profile = profileMap[reminder.user_id]

    // Verify meeting exists and is active
    if (!meeting || meeting.status === 'cancelled') {
      await supabase.from('reminders').update({ status: 'cancelled' }).eq('id', reminder.id)
      continue
    }

    const recipientEmail = profile?.email || ''
    const recipientName = profile?.name || 'Founder'

    // Build email payload once
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
      meetingId: meeting.id,
    }

    // Resolve primary email — fallback to auth.users if profile.email is empty
    let primaryEmail = recipientEmail
    if (!primaryEmail) {
      const { data: authUser } = await supabase.auth.admin.getUserById(reminder.user_id)
      primaryEmail = authUser?.user?.email || ''
    }

    if (!primaryEmail) {
      console.warn(`[Reminder Scheduler] Missing recipient email for reminder ${reminder.id}`)
      await supabase.from('reminders').update({ status: 'failed' }).eq('id', reminder.id)
      failedCount++
      continue
    }

    // Send to primary email
    const result = await sendMeetingReminderEmail({ toEmail: primaryEmail, ...emailPayload })

    // Send to all extra reminder_emails
    const extraEmails: string[] = reminder.reminder_emails || []
    for (const extraEmail of extraEmails) {
      if (extraEmail && extraEmail !== primaryEmail) {
        const extraResult = await sendMeetingReminderEmail({ toEmail: extraEmail, ...emailPayload })
        if (!extraResult.success) {
          console.warn(`[Reminder] Failed to send to extra email ${extraEmail}:`, extraResult.error)
        }
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

  return { processed: dueReminders.length, sent: sentCount, failed: failedCount }
}
