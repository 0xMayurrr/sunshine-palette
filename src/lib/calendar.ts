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
