import { addDays, addHours, format, startOfWeek, subDays } from 'date-fns'

export type MeetingType = 'Client Meeting' | 'Internal Meeting' | 'Follow-up' | 'Important' | 'Other'
export type Reminder = '1 week before' | '1 day before' | '1 hour before' | '30 minutes before' | '5 minutes before' | '15 minutes before' | '2 hours before' | '1 month before'
export interface UserProfile { name: string; role: string }
export interface Meeting {
  id: string; title: string; client: string; date: string; startTime: string; endTime: string;
  type: MeetingType; color: MeetingType; description: string; meetingLink: string;
  reminders: Reminder[]; status: 'scheduled'
}
export const types: MeetingType[] = ['Client Meeting', 'Internal Meeting', 'Follow-up', 'Important', 'Other']
export const reminderOptions: Reminder[] = ['1 week before', '1 day before', '1 hour before', '30 minutes before', '5 minutes before', '15 minutes before', '2 hours before', '1 month before']
export const defaultReminders: Reminder[] = ['1 day before', '1 hour before']
export const profile: UserProfile = { name: 'Mayur', role: 'Founder' }
const date = (day: Date) => format(day, 'yyyy-MM-dd')
export function sampleMeetings(now: Date): Meeting[] {
  const monday = startOfWeek(now, { weekStartsOn: 1 })
  const samples: [Date, string, string, string, string, MeetingType, string][] = [
    [now, 'Client Discovery Call', 'Northstar Studio', '10:00', '11:00', 'Client Meeting', 'Discuss the new product roadmap and scope.'],
    [now, 'Founder Sync', 'Buildicy', '14:30', '15:15', 'Internal Meeting', 'Weekly priorities and decisions.'],
    [addDays(now, 1), 'Product Demo', 'Acme Technologies', '11:00', '12:00', 'Client Meeting', 'Walk through the latest product experience.'],
    [addDays(now, 2), 'Website Review', 'Buildicy', '09:30', '10:15', 'Internal Meeting', 'Review the latest website direction.'],
    [addDays(now, 3), 'Investor Discussion', 'Meridian Ventures', '15:00', '16:00', 'Important', 'Quarterly update and next steps.'],
    [addDays(now, 5), 'Client Follow-up', 'Northstar Studio', '12:00', '12:30', 'Follow-up', 'Confirm feedback and delivery timeline.'],
    [addDays(monday, 8), 'Marketing Strategy', 'Buildicy', '13:00', '14:00', 'Internal Meeting', 'Campaign planning and priorities.'],
    [addDays(monday, 10), 'Partnership Discussion', 'Atlas Partners', '16:00', '17:00', 'Client Meeting', 'Explore opportunities for collaboration.'],
    [subDays(now, 3), 'Design Check-in', 'Buildicy', '11:30', '12:00', 'Other', 'Review design progress.'],
    [addHours(addDays(now, 7), 1), 'Roadmap Review', 'Buildicy', '10:00', '11:00', 'Important', 'Agree on next quarter priorities.'],
  ]
  return samples.map(([day, title, client, startTime, endTime, type, description], index) => ({
    id: `sample-${index}`, title, client, date: date(day), startTime, endTime, type, color: type,
    description, meetingLink: '', reminders: defaultReminders, status: 'scheduled',
  }))
}
export function blankMeeting(day: Date): Meeting {
  return { id: '', title: '', client: '', date: date(day), startTime: '10:00', endTime: '11:00', type: 'Client Meeting', color: 'Client Meeting', description: '', meetingLink: '', reminders: defaultReminders, status: 'scheduled' }
}
export function formatTime(time: string) {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return `${(hours % 12) || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`
}
