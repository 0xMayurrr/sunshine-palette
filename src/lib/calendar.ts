import { format } from 'date-fns'

export type MeetingType = 'Client Meeting' | 'Internal Meeting' | 'Follow-up' | 'Important' | 'Other'
export type Reminder = '1 week before' | '1 day before' | '1 hour before' | '30 minutes before' | '5 minutes before' | '15 minutes before' | '2 hours before' | '1 month before'
export interface UserProfile { name: string; role: string }
export interface Meeting {
  id: string; title: string; client: string; date: string; startTime: string; endTime: string;
  type: MeetingType; color: MeetingType; description: string; meetingLink: string;
  reminders: Reminder[]; reminderEmails: string[]; status: 'scheduled' | 'completed' | 'cancelled';
  google_event_id?: string; google_meet_link?: string;
}
export const types: MeetingType[] = ['Client Meeting', 'Internal Meeting', 'Follow-up', 'Important', 'Other']
export const reminderOptions: Reminder[] = ['1 week before', '1 day before', '1 hour before', '30 minutes before', '5 minutes before', '15 minutes before', '2 hours before', '1 month before']
export const defaultReminders: Reminder[] = ['1 day before', '1 hour before']
const date = (day: Date) => format(day, 'yyyy-MM-dd')
export function blankMeeting(day: Date): Meeting {
  return { id: '', title: '', client: '', date: date(day), startTime: '10:00', endTime: '11:00', type: 'Client Meeting', color: 'Client Meeting', description: '', meetingLink: '', reminders: defaultReminders, reminderEmails: [], status: 'scheduled' }
}
export function formatTime(time: string) {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return `${(hours % 12) || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`
}

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
  return 60
}

export function calculateReminderDisplay(dateStr: string, startTimeStr: string, reminderType: string): string {
  if (!dateStr || !startTimeStr) return ''
  try {
    const meetingTimeMs = new Date(`${dateStr}T${startTimeStr}:00`).getTime()
    if (isNaN(meetingTimeMs)) return ''
    const minutes = parseReminderMinutes(reminderType)
    const reminderTime = new Date(meetingTimeMs - minutes * 60 * 1000)
    const isSameDate = reminderTime.toISOString().split('T')[0] === dateStr
    if (isSameDate) {
      return format(reminderTime, 'h:mm a')
    } else {
      return format(reminderTime, 'MMM d, h:mm a')
    }
  } catch {
    return ''
  }
}

