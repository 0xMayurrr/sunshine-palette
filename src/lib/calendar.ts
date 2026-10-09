import { format } from 'date-fns'

export type MeetingType = 'Client Meeting' | 'Internal Meeting' | 'Follow-up' | 'Important' | 'Other'
export type Reminder = '1 week before' | '1 day before' | '1 hour before' | '30 minutes before' | '5 minutes before' | '15 minutes before' | '2 hours before' | '1 month before'
export interface UserProfile { name: string; role: string }
export interface Meeting {
  id: string; title: string; client: string; date: string; startTime: string; endTime: string;
  type: MeetingType; color: MeetingType; description: string; meetingLink: string;
  reminders: Reminder[]; reminderEmails: string[]; status: 'scheduled' | 'completed' | 'cancelled';
  google_event_id?: string; google_meet_link?: string;
  attendance?: 'attending' | 'not_attending' | null;
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

export function calculateDuration(startTime: string, endTime: string): string {
  if (!startTime || !endTime) return ''
  const [startH = 0, startM = 0] = startTime.split(':').map(Number)
  const [endH = 0, endM = 0] = endTime.split(':').map(Number)
  const totalMinutes = (endH * 60 + endM) - (startH * 60 + startM)
  if (totalMinutes <= 0) return ''
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`
  if (hours > 0) return `${hours}h`
  return `${mins}m`
}
export interface CategoryTheme {
  badge: string;
  accentBar: string;
  dot: string;
  text: string;
  bgHover: string;
}

export const categoryThemes: Record<MeetingType, CategoryTheme> = {
  'Client Meeting': {
    badge: 'bg-primary/10 text-primary border-primary/25 dark:bg-primary/20 dark:text-purple-300 font-bold',
    accentBar: 'bg-primary',
    dot: 'bg-primary',
    text: 'text-primary',
    bgHover: 'group-hover:border-primary/40',
  },
  'Internal Meeting': {
    badge: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/25 dark:bg-emerald-500/20 dark:text-emerald-300 font-bold',
    accentBar: 'bg-emerald-500',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-400',
    bgHover: 'group-hover:border-emerald-500/40',
  },
  'Follow-up': {
    badge: 'bg-amber-500/15 text-amber-900 border-amber-500/30 dark:bg-amber-500/25 dark:text-amber-200 font-bold',
    accentBar: 'bg-amber-500',
    dot: 'bg-amber-500',
    text: 'text-amber-800 dark:text-amber-300',
    bgHover: 'group-hover:border-amber-500/40',
  },
  'Important': {
    badge: 'bg-rose-500/10 text-rose-800 border-rose-500/25 dark:bg-rose-500/20 dark:text-rose-300 font-bold',
    accentBar: 'bg-rose-500',
    dot: 'bg-rose-500',
    text: 'text-rose-700 dark:text-rose-400',
    bgHover: 'group-hover:border-rose-500/40',
  },
  'Other': {
    badge: 'bg-slate-500/10 text-slate-800 border-slate-500/25 dark:bg-slate-500/20 dark:text-slate-300 font-bold',
    accentBar: 'bg-slate-500',
    dot: 'bg-slate-500',
    text: 'text-slate-700 dark:text-slate-400',
    bgHover: 'group-hover:border-slate-500/40',
  },
}
