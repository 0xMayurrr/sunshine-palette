import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Mail, Menu, Plus, Search, Settings2, X, LogOut, CheckCircle2, AlertCircle, RefreshCw, Pin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { MeetingDialog } from '@/components/calendar/MeetingDialog'
import { blankMeeting, formatTime, Meeting, MeetingType, UserProfile } from '@/lib/calendar'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { createMeetingFn, deleteMeetingFn, disconnectGoogleFn, getGoogleConnectUrlFn, runReminderSchedulerFn, saveDefaultReminderEmailsFn, updateMeetingFn } from '@/lib/server-actions'

export const Route = createFileRoute('/')({
  head: () => ({ meta: [
    { title: 'Buildicy Calendar | Meetings, made clear' },
    { name: 'description', content: 'A focused calendar for Buildicy founders to organize meetings and reminders.' },
    { property: 'og:title', content: 'Buildicy Calendar | Meetings, made clear' },
    { property: 'og:description', content: 'A focused calendar for Buildicy founders to organize meetings and reminders.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: CalendarApp,
})

type View = 'Month' | 'Week' | 'Day'
type Section = 'Calendar' | 'Upcoming' | 'Settings'
const views: View[] = ['Month', 'Week', 'Day']
const eventColors: Record<MeetingType, string> = { 'Client Meeting': 'bg-client', 'Internal Meeting': 'bg-internal', 'Follow-up': 'bg-followup', Important: 'bg-important', Other: 'bg-other' }
const eventBorders: Record<MeetingType, string> = { 'Client Meeting': 'border-client', 'Internal Meeting': 'border-internal', 'Follow-up': 'border-followup', Important: 'border-important', Other: 'border-other' }
const today = new Date()

function UserProfileBlock({ user, onSignOut, expanded = true }: { user: UserProfile | null; onSignOut: () => void; expanded?: boolean }) {
  const name = user?.name || 'Founder'
  const role = user?.role || 'Buildicy'
  const initial = name[0]?.toUpperCase() || 'B'

  return (
    <div className={`flex items-center border-t border-border py-4 transition-all ${expanded ? 'px-5 gap-3' : 'justify-center px-2'}`}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-brand-soft font-display text-sm font-bold text-primary" title={name}>
        {initial}
      </div>
      {expanded && (
        <>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{name}</div>
            <div className="text-xs text-muted-foreground">{role}</div>
          </div>
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive shrink-0" title="Sign out" onClick={onSignOut}>
            <LogOut className="size-4" />
          </Button>
        </>
      )}
    </div>
  )
}

function CalendarApp() {
  const navigate = useNavigate()
  const { user, profile, loading: authLoading, signOut } = useAuth()
  const [cursor, setCursor] = useState(today)
  const [selectedDate, setSelectedDate] = useState(today)
  const [view, setView] = useState<View>('Month')
  const [section, setSection] = useState<Section>('Calendar')
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [dbLoading, setDbLoading] = useState(true)
  const [active, setActive] = useState<Meeting | null>(null)
  const [dialogMode, setDialogMode] = useState<'create' | 'view' | 'edit'>('create')
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [sidebarHovered, setSidebarHovered] = useState(false)
  const [sidebarPinned, setSidebarPinned] = useState(false)
  const isSidebarOpen = sidebarHovered || sidebarPinned
  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleEmail, setGoogleEmail] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [defaultReminderEmails, setDefaultReminderEmails] = useState<string[]>([])
  const [newDefaultEmail, setNewDefaultEmail] = useState('')
  const [savingEmails, setSavingEmails] = useState(false)
  const [runningCron, setRunningCron] = useState(false)

  // Auth Redirect Guard
  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: '/login' })
    }
  }, [user, authLoading, navigate])

  // Fetch Meetings & Google Connection status from Supabase
  const loadSupabaseData = async () => {
    if (!user) return
    setDbLoading(true)

    try {
      // Execute queries in parallel to minimize load time
      const [meetingsRes, gConnRes, profileRes, remindersRes] = await Promise.all([
        supabase
          .from('meetings')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: true }),
        supabase
          .from('google_connections')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('default_reminder_emails')
          .eq('user_id', user.id)
          .limit(1),
        supabase
          .from('reminders')
          .select('meeting_id, reminder_type')
          .eq('user_id', user.id)
          .neq('status', 'cancelled'),
      ])

      // Map reminder types by meeting ID
      const remindersByMeeting: Record<string, string[]> = {}
      for (const r of remindersRes.data || []) {
        if (!remindersByMeeting[r.meeting_id]) remindersByMeeting[r.meeting_id] = []
        remindersByMeeting[r.meeting_id].push(r.reminder_type)
      }

      // 1. Process Meetings
      if (meetingsRes.error) {
        console.error('Error fetching meetings from Supabase:', meetingsRes.error)
      } else if (meetingsRes.data && meetingsRes.data.length > 0) {
        const formatted: Meeting[] = meetingsRes.data.map((m: any) => ({
          id: m.id,
          title: m.title,
          client: m.client_name || '',
          date: m.date,
          startTime: m.start_time,
          endTime: m.end_time,
          type: m.meeting_type as MeetingType,
          color: (m.color || m.meeting_type) as MeetingType,
          description: m.description || '',
          meetingLink: m.meeting_link || '',
          google_event_id: m.google_event_id,
          google_meet_link: m.google_meet_link,
          reminders: remindersByMeeting[m.id] && remindersByMeeting[m.id].length ? remindersByMeeting[m.id] : ['1 hour before'],
          reminderEmails: m.reminder_emails || [],
          status: m.status || 'scheduled',
        }))
        setMeetings(formatted)
      } else {
        setMeetings([])
      }

      // 2. Process Google Connection
      if (gConnRes.data) {
        setGoogleConnected(true)
        setGoogleEmail(gConnRes.data.google_account_email || 'Connected')
      } else {
        setGoogleConnected(false)
        setGoogleEmail('')
      }

      // 3. Process Profile Default Reminder Emails
      const profileData = profileRes.data?.[0]
      if (profileData?.default_reminder_emails) {
        setDefaultReminderEmails(profileData.default_reminder_emails)
      }
    } catch (err: any) {
      console.error('Data load exception:', err)
    } finally {
      setDbLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      loadSupabaseData()
    }
  }, [user])

  // Automatically check and process due reminders every 30 seconds while user is active on page
  useEffect(() => {
    if (!user) return
    const runScheduler = () => {
      runReminderSchedulerFn({ data: {} }).catch((err) => console.error('Auto reminder check failed:', err))
    }
    runScheduler()
    const interval = setInterval(runScheduler, 30000)
    return () => clearInterval(interval)
  }, [user])

  const filtered = useMemo(() => meetings.filter(m => `${m.title} ${m.client} ${m.type}`.toLowerCase().includes(search.toLowerCase())).sort((a,b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)), [meetings, search])
  const upcoming = filtered.filter(m => `${m.date}T${m.endTime}` >= format(today, "yyyy-MM-dd'T'HH:mm"))
  const todaysCount = meetings.filter(m => m.date === format(today, 'yyyy-MM-dd')).length
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 })
  const weekCount = meetings.filter(m => { const d = parseISO(m.date); return d >= weekStart && d <= weekEnd }).length
  const periodLabel = view === 'Month' ? format(cursor, 'MMMM yyyy') : view === 'Week' ? `${format(startOfWeek(cursor, { weekStartsOn: 1 }), 'MMM d')} — ${format(endOfWeek(cursor, { weekStartsOn: 1 }), 'MMM d, yyyy')}` : format(cursor, 'MMMM d, yyyy')

  const move = (direction: number) => setCursor(current => view === 'Month' ? direction > 0 ? addMonths(current, 1) : subMonths(current, 1) : view === 'Week' ? direction > 0 ? addWeeks(current, 1) : subWeeks(current, 1) : addDays(current, direction))
  const create = (day = selectedDate) => { setActive({ ...blankMeeting(day), reminderEmails: [...defaultReminderEmails] }); setDialogMode('create'); setMobileMenu(false) }
  const open = (meeting: Meeting) => { setActive(meeting); setDialogMode('view') }

  const handleSave = async (meeting: Meeting) => {
    if (!user) return
    setStatusMsg(null)
    try {
      if (meeting.id && !meeting.id.startsWith('sample-')) {
        // Update existing meeting
        const res = await updateMeetingFn({
          data: {
            userId: user.id,
            meetingId: meeting.id,
            title: meeting.title,
            clientName: meeting.client,
            description: meeting.description,
            date: meeting.date,
            startTime: meeting.startTime,
            endTime: meeting.endTime,
            meetingType: meeting.type,
            color: meeting.color,
            meetingLink: meeting.meetingLink,
            googleEventId: meeting.google_event_id,
            reminders: meeting.reminders || ['1 day before', '1 hour before'],
            reminderEmails: meeting.reminderEmails || [],
          }
        })
        setMeetings(prev => prev.map(m => m.id === meeting.id ? { ...m, ...res.meeting, client: res.meeting.client_name, startTime: res.meeting.start_time, endTime: res.meeting.end_time, type: res.meeting.meeting_type } : m))
        setStatusMsg({ type: 'success', text: 'Meeting updated successfully.' })
      } else {
        // Create new meeting
        const res = await createMeetingFn({
          data: {
            userId: user.id,
            title: meeting.title,
            clientName: meeting.client,
            description: meeting.description,
            date: meeting.date,
            startTime: meeting.startTime,
            endTime: meeting.endTime,
            meetingType: meeting.type,
            color: meeting.color,
            meetingLink: meeting.meetingLink,
            googleEventId: meeting.google_event_id,
            googleMeetLink: meeting.google_meet_link,
            reminders: meeting.reminders || ['1 day before', '1 hour before'],
            reminderEmails: meeting.reminderEmails || [],
          }
        })
        const newMeetingObj: Meeting = {
          id: res.meeting.id,
          title: res.meeting.title,
          client: res.meeting.client_name || '',
          date: res.meeting.date,
          startTime: res.meeting.start_time,
          endTime: res.meeting.end_time,
          type: res.meeting.meeting_type as MeetingType,
          color: (res.meeting.color || res.meeting.meeting_type) as MeetingType,
          description: res.meeting.description || '',
          meetingLink: res.meeting.meeting_link || '',
          google_event_id: res.meeting.google_event_id,
          google_meet_link: res.meeting.google_meet_link,
          reminders: meeting.reminders || ['1 day before', '1 hour before'],
          reminderEmails: meeting.reminderEmails || [],
          status: 'scheduled',
        }
        setMeetings(prev => [...prev, newMeetingObj])
        setSelectedDate(parseISO(newMeetingObj.date))
        setCursor(parseISO(newMeetingObj.date))

        if (res.googleMeetLink) {
          setStatusMsg({ type: 'success', text: '✓ Meeting created & Google Meet link generated!' })
        } else {
          setStatusMsg({ type: 'success', text: '✓ Meeting created successfully!' })
        }
      }
      setActive(null)
    } catch (err: any) {
      console.error('Server action save meeting failed, trying direct Supabase fallback:', err)
      // Client-side fallback to save meeting directly via Supabase client if server action fetch failed
      try {
        if (meeting.id && !meeting.id.startsWith('sample-')) {
          const { data: dbUpdated, error: updateErr } = await supabase
            .from('meetings')
            .update({
              title: meeting.title,
              client_name: meeting.client || '',
              description: meeting.description || '',
              date: meeting.date,
              start_time: meeting.startTime,
              end_time: meeting.endTime,
              meeting_type: meeting.type,
              color: meeting.color || meeting.type,
              meeting_link: meeting.meetingLink || '',
              reminder_emails: meeting.reminderEmails || [],
              updated_at: new Date().toISOString(),
            })
            .eq('id', meeting.id)
            .eq('user_id', user.id)
            .select()
            .maybeSingle()

          if (!updateErr && dbUpdated) {
            setMeetings(prev => prev.map(m => m.id === meeting.id ? { ...m, ...dbUpdated, client: dbUpdated.client_name, startTime: dbUpdated.start_time, endTime: dbUpdated.end_time, type: dbUpdated.meeting_type } : m))
            setStatusMsg({ type: 'success', text: '✓ Meeting updated successfully.' })
            setActive(null)
            return
          }
        } else {
          const { data: dbInserted, error: insertErr } = await supabase
            .from('meetings')
            .insert({
              user_id: user.id,
              title: meeting.title,
              client_name: meeting.client || '',
              description: meeting.description || '',
              date: meeting.date,
              start_time: meeting.startTime,
              end_time: meeting.endTime,
              meeting_type: meeting.type,
              color: meeting.color || meeting.type,
              meeting_link: meeting.meetingLink || '',
              reminder_emails: meeting.reminderEmails || [],
              status: 'scheduled',
            })
            .select()
            .maybeSingle()

          if (!insertErr && dbInserted) {
            const newMeetingObj: Meeting = {
              id: dbInserted.id,
              title: dbInserted.title,
              client: dbInserted.client_name || '',
              date: dbInserted.date,
              startTime: dbInserted.start_time,
              endTime: dbInserted.end_time,
              type: dbInserted.meeting_type as MeetingType,
              color: (dbInserted.color || dbInserted.meeting_type) as MeetingType,
              description: dbInserted.description || '',
              meetingLink: dbInserted.meeting_link || '',
              google_event_id: dbInserted.google_event_id,
              google_meet_link: dbInserted.google_meet_link,
              reminders: meeting.reminders || ['1 day before', '1 hour before'],
              reminderEmails: dbInserted.reminder_emails || [],
              status: 'scheduled',
            }
            setMeetings(prev => [...prev, newMeetingObj])
            setSelectedDate(parseISO(newMeetingObj.date))
            setCursor(parseISO(newMeetingObj.date))
            setStatusMsg({ type: 'success', text: '✓ Meeting created successfully!' })
            setActive(null)
            return
          }
        }
      } catch (fbErr) {
        console.error('Direct fallback error:', fbErr)
      }
      setStatusMsg({ type: 'error', text: err.message || 'Failed to save meeting.' })
    }
  }

  const handleDuplicate = async (meeting: Meeting) => {
    if (!user) return
    const copyTitle = `${meeting.title} (copy)`
    await handleSave({ ...meeting, id: '', title: copyTitle })
  }

  const handleDelete = async (id: string) => {
    if (!user) return
    const target = meetings.find(m => m.id === id)
    try {
      if (id && !id.startsWith('sample-')) {
        await deleteMeetingFn({
          data: {
            userId: user.id,
            meetingId: id,
            googleEventId: target?.google_event_id,
          }
        })
      }
      setMeetings(prev => prev.filter(m => m.id !== id))
      setActive(null)
      setStatusMsg({ type: 'success', text: 'Meeting deleted.' })
    } catch (err: any) {
      console.error('Delete error:', err)
      setStatusMsg({ type: 'error', text: 'Failed to delete meeting.' })
    }
  }

  const handleAddDefaultEmail = async () => {
    const email = newDefaultEmail.trim()
    if (!email || !email.includes('@') || defaultReminderEmails.includes(email)) return
    const updated = [...defaultReminderEmails, email]
    setDefaultReminderEmails(updated)
    setNewDefaultEmail('')
    if (!user) return
    setSavingEmails(true)
    try {
      await saveDefaultReminderEmailsFn({ data: { userId: user.id, emails: updated } })
      setStatusMsg({ type: 'success', text: 'Default reminder emails saved.' })
    } catch {
      setStatusMsg({ type: 'error', text: 'Failed to save.' })
    } finally {
      setSavingEmails(false)
    }
  }

  const handleRunReminders = async () => {
    setRunningCron(true)
    try {
      const result = await runReminderSchedulerFn({ data: {} })
      setStatusMsg({ type: 'success', text: `Reminders processed: ${result.sent} sent, ${result.failed} failed.` })
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to run reminders.' })
    } finally {
      setRunningCron(false)
    }
  }

  const handleRemoveDefaultEmail = async (email: string) => {
    const updated = defaultReminderEmails.filter((e) => e !== email)
    setDefaultReminderEmails(updated)
    if (!user) return
    try {
      await saveDefaultReminderEmailsFn({ data: { userId: user.id, emails: updated } })
    } catch {
      setStatusMsg({ type: 'error', text: 'Failed to save.' })
    }
  }

  const handleConnectGoogle = async () => {
    if (!user) return
    setGoogleLoading(true)
    try {
      const res = await getGoogleConnectUrlFn({ data: { userId: user.id, origin: window.location.origin } })
      window.location.href = res.url
    } catch (err: any) {
      console.error('Connect Google Error:', err)
      alert('Failed to connect Google Calendar. Check environment configuration.')
    } finally {
      setGoogleLoading(false)
    }
  }

  const handleDisconnectGoogle = async () => {
    if (!user) return
    if (!confirm('Are you sure you want to disconnect Google Calendar?')) return
    try {
      await disconnectGoogleFn({ data: { userId: user.id } })
      setGoogleConnected(false)
      setGoogleEmail('')
      setStatusMsg({ type: 'success', text: 'Google Calendar disconnected.' })
    } catch (err: any) {
      console.error('Disconnect error:', err)
    }
  }

  const selectSection = (next: Section) => { setSection(next); setMobileMenu(false) }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">Loading Buildicy Calendar...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  return <div className="min-h-screen bg-background text-foreground lg:flex">
    {mobileMenu && <div className="fixed inset-0 z-30 bg-foreground/30 lg:hidden" onClick={() => setMobileMenu(false)} />}
    {/* Hover trigger zone for desktop edge */}
    <div
      className="fixed inset-y-0 left-0 z-30 w-4 hidden lg:block"
      onMouseEnter={() => setSidebarHovered(true)}
    />

    <aside
      onMouseEnter={() => setSidebarHovered(true)}
      onMouseLeave={() => setSidebarHovered(false)}
      className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-card transition-all duration-300 ease-in-out lg:sticky lg:top-0 lg:h-screen ${
        mobileMenu ? 'translate-x-0 w-[246px]' : '-translate-x-full lg:translate-x-0'
      } ${isSidebarOpen ? 'lg:w-[246px] shadow-2xl lg:shadow-none' : 'lg:w-[72px]'}`}
    >
      {/* Header */}
      <div className={`flex h-16 items-center border-b border-border transition-all ${isSidebarOpen ? 'justify-between px-4' : 'justify-center px-0'}`}>
        <div className="flex items-center gap-3 min-w-0">
          <img src="/favicon.png" alt="Buildicy logo" className="size-9 shrink-0 object-contain drop-shadow-sm" />
          <div className={`font-display text-[15px] font-bold leading-[1.05] whitespace-nowrap transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100' : 'lg:hidden'}`}>
            BUILDICY<span className="block font-medium text-primary">CALENDAR<span className="text-foreground">.</span></span>
          </div>
        </div>

        {/* Pin toggle for desktop */}
        <Button
          variant="ghost"
          size="icon"
          className={`hidden lg:flex size-8 shrink-0 text-muted-foreground hover:text-foreground transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          title={sidebarPinned ? "Unpin sidebar (auto-collapse on hover)" : "Pin sidebar open"}
          onClick={(e) => {
            e.stopPropagation()
            setSidebarPinned(!sidebarPinned)
          }}
        >
          <Pin className={`size-4 transition-transform ${sidebarPinned ? 'rotate-45 text-primary' : 'opacity-60'}`} />
        </Button>

        {/* Mobile close button */}
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Close menu" onClick={() => setMobileMenu(false)}>
          <X />
        </Button>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-3 pt-3 overflow-y-auto overflow-x-hidden">
        {isSidebarOpen && (
          <div className="px-2 text-[10px] font-bold uppercase text-muted-foreground whitespace-nowrap transition-opacity duration-200 mb-2">
            Workspace / 01
          </div>
        )}
        <nav className="space-y-1">
          {(['Calendar', 'Upcoming', 'Settings'] as const).map((name) => {
            const Icon = name === 'Calendar' ? CalendarDays : name === 'Upcoming' ? Clock3 : Settings2
            const isSelected = section === name
            return (
              <Button
                key={name}
                variant="ghost"
                onClick={() => selectSection(name)}
                title={name}
                className={`h-11 w-full justify-start gap-3.5 rounded-sm px-3 text-sm font-semibold transition-all ${
                  isSelected ? 'bg-brand-soft text-primary hover:bg-brand-soft' : 'text-muted-foreground'
                }`}
              >
                <Icon className="size-5 shrink-0" />
                <span className={`whitespace-nowrap transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100' : 'lg:hidden'}`}>
                  {name}
                </span>
                {isSelected && isSidebarOpen && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-primary" />}
              </Button>
            )
          })}
        </nav>

        <Button
          onClick={() => create()}
          title="New meeting"
          className="mt-4 h-11 w-full justify-center gap-2 rounded-sm font-bold shadow-none px-3"
        >
          <Plus className="size-5 shrink-0" />
          <span className={`whitespace-nowrap transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100' : 'lg:hidden'}`}>
            New meeting
          </span>
        </Button>
      </div>

      {/* Footer */}
      <div className="mt-auto">
        {isSidebarOpen && (
          <div className="mx-5 mb-3 border-l-2 border-primary pl-3 hidden lg:block">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Make space for</p>
            <p className="mt-0.5 font-display text-xs font-bold">the next big thing.</p>
          </div>
        )}
        <UserProfileBlock user={profile} onSignOut={signOut} expanded={isSidebarOpen} />
      </div>
    </aside>

    <div className="min-w-0 flex-1">
      <header className="flex h-16 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-8 lg:h-16 lg:px-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setMobileMenu(true)}>
            <Menu />
          </Button>
          <div>
            <p className="hidden text-[10px] font-bold uppercase text-muted-foreground sm:block">
              Private workspace <span className="mx-2 text-border">/</span> {section}
            </p>
            <p className="font-display text-sm font-bold sm:text-base">
              BUILDICY <span className="text-primary">CALENDAR</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {dbLoading && (
            <div className="hidden items-center gap-1.5 text-xs font-bold text-primary sm:flex animate-pulse">
              <RefreshCw className="size-3.5 animate-spin" />
              <span>Syncing...</span>
            </div>
          )}
          <div className={`flex items-center overflow-hidden border border-border bg-background transition-all ${searchOpen ? 'w-42 sm:w-64' : 'w-9 border-transparent sm:w-52 sm:border-border'}`}>
            <Button variant="ghost" size="icon" className="shrink-0" aria-label="Search meetings" onClick={() => setSearchOpen(true)}>
              <Search className="size-4" />
            </Button>
            <input
              aria-label="Search meetings"
              placeholder="Search meetings..."
              className={`min-w-0 flex-1 bg-transparent pr-2 text-xs outline-none ${searchOpen ? 'block' : 'hidden sm:block'}`}
              value={search}
              onFocus={() => setSearchOpen(true)}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Clear search" onClick={() => { setSearch(''); setSearchOpen(false) }}>
                <X className="size-3" />
              </Button>
            )}
          </div>
          <span className="hidden h-7 w-px bg-border sm:block" />
          <div className="flex size-8 items-center justify-center bg-brand-soft font-display text-xs font-bold text-primary sm:size-9" title={profile?.name}>
            {profile?.name ? profile.name[0].toUpperCase() : 'M'}
          </div>
        </div>
      </header>

      {/* Global Status Banner */}
      {statusMsg && (
        <div className={`flex items-center justify-between px-6 py-3 text-xs font-semibold ${statusMsg.type === 'success' ? 'bg-primary/10 text-primary border-b border-primary/20' : 'bg-destructive/10 text-destructive border-b border-destructive/20'}`}>
          <span>{statusMsg.text}</span>
          <Button variant="ghost" size="icon" className="size-6 text-current" onClick={() => setStatusMsg(null)}>
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {section === 'Settings' ? (
        <main className="mx-auto max-w-4xl px-5 py-10 sm:px-10">
          <p className="text-[11px] font-bold uppercase text-primary">Workspace settings / 03</p>
          <h1 className="mt-3 font-display text-4xl font-bold">Settings<span className="text-primary">.</span></h1>

          <div className="mt-10 grid gap-10 border-t border-border pt-8 sm:grid-cols-2">
            {/* User Profile Settings */}
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground">Profile</p>
              <div className="mt-5 flex items-center gap-4">
                <div className="flex size-12 items-center justify-center bg-brand-soft font-display font-bold text-primary">
                  {profile?.name ? profile.name[0].toUpperCase() : 'M'}
                </div>
                <div>
                  <p className="font-semibold">{profile?.name || 'Founder'}</p>
                  <p className="text-sm text-muted-foreground">{profile?.role || 'Founder'} &bull; Buildicy</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{profile?.email || user.email}</p>
                </div>
              </div>
              <div className="mt-6">
                <Button variant="outline" size="sm" onClick={signOut} className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
                  <LogOut className="size-3.5" /> Sign out of Buildicy
                </Button>
              </div>
            </div>

            {/* Google Calendar Connection Settings */}
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground">Google Calendar & Meet</p>
              <div className="mt-5 border border-border bg-card p-5 rounded-sm">
                {googleConnected ? (
                  <div>
                    <div className="flex items-center gap-2 text-sm font-bold text-emerald-500">
                      <CheckCircle2 className="size-4" /> Google Calendar Connected
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Connected account: <span className="font-semibold text-foreground">{googleEmail}</span>
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Google Meet links will be automatically generated whenever you create a meeting.
                    </p>
                    <Button variant="ghost" size="sm" onClick={handleDisconnectGoogle} className="mt-4 text-destructive hover:text-destructive p-0 h-auto font-semibold text-xs">
                      Disconnect Google Calendar
                    </Button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
                      <AlertCircle className="size-4 text-amber-500" /> Not Connected
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Connect your Google Calendar to enable automatic Google Meet video call creation for meetings.
                    </p>
                    <Button onClick={handleConnectGoogle} disabled={googleLoading} className="mt-4 gap-2 font-bold text-xs h-9">
                      {googleLoading ? <RefreshCw className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                      Connect Google Calendar
                    </Button>
                  </div>
                )}
              </div>

              {/* Preferences */}
              <div className="mt-8 border-t border-border pt-6">
                <p className="text-xs font-bold uppercase text-muted-foreground">System Preferences</p>
                <p className="mt-3 text-sm">Timezone: <span className="font-semibold">Asia/Kolkata (IST)</span></p>
                <p className="mt-1 text-sm">Email Reminders: <span className="font-semibold text-emerald-500">Enabled via Resend</span></p>
                <Button onClick={handleRunReminders} disabled={runningCron} variant="outline" size="sm" className="mt-4 gap-2 text-xs h-9">
                  {runningCron ? <RefreshCw className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  Run Reminders Now
                </Button>
              </div>
            </div>
          </div>

          {/* Default Reminder Emails — full width */}
          <div className="mt-10 border-t border-border pt-8">
            <p className="text-xs font-bold uppercase text-muted-foreground">Default Reminder Email Recipients</p>
            <p className="mt-2 text-sm text-muted-foreground">
              These email addresses will automatically receive reminders for every new meeting you create.
            </p>
            <div className="mt-5 flex gap-2">
              <input
                type="email"
                className="h-11 flex-1 rounded-sm border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="e.g. client@company.com"
                value={newDefaultEmail}
                onChange={(e) => setNewDefaultEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddDefaultEmail() } }}
              />
              <Button onClick={handleAddDefaultEmail} disabled={savingEmails} className="h-11 gap-2 px-4 font-bold text-xs">
                <Mail className="size-3.5" /> Add Email
              </Button>
            </div>
            {defaultReminderEmails.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {defaultReminderEmails.map((email) => (
                  <span key={email} className="flex items-center gap-2 border border-border bg-secondary px-3 py-2 text-xs font-medium">
                    <Mail className="size-3 text-primary" />
                    {email}
                    <button
                      type="button"
                      onClick={() => handleRemoveDefaultEmail(email)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${email}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">No default recipients added yet.</p>
            )}
          </div>
        </main>
      ) : (
        <main className="mx-auto max-w-[1700px]">
          <div className="border-b border-border px-5 pb-6 pt-7 sm:px-8 lg:px-10 lg:pt-10">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase text-primary">
                  {section === 'Upcoming' ? 'Your agenda / 02' : 'Your workspace / 01'}{' '}
                  <span className="ml-3 text-muted-foreground">— {format(today, 'EEEE, MMMM d')}</span>
                </p>
                <h1 className="font-display text-[34px] font-bold leading-none sm:text-[44px]">
                  {section === 'Upcoming' ? 'Upcoming' : 'Your calendar'}<span className="text-primary">.</span>
                </h1>
              </div>
              <Button onClick={() => create()} className="hidden h-10 rounded-sm px-5 font-semibold shadow-none sm:inline-flex">
                <Plus /> New meeting
              </Button>
            </div>
          </div>

          {section === 'Upcoming' ? (
            <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:px-10">
              <div className="mb-5 flex items-baseline justify-between border-b border-border pb-4">
                <h2 className="font-display text-xl font-bold">On the horizon</h2>
                <span className="text-xs font-semibold text-muted-foreground">{upcoming.length} meetings</span>
              </div>
              <UpcomingList meetings={upcoming} onOpen={open} long search={search} />
            </div>
          ) : (
            <div className="grid xl:grid-cols-[minmax(0,1fr)_270px]">
              <div className="min-w-0 px-4 pb-12 pt-6 sm:px-8 lg:px-10">
                <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
                      {view} view <span className="mx-2">/</span> {format(cursor, 'yyyy')}
                    </div>
                    <h2 className="font-display text-[28px] font-bold leading-tight capitalize sm:text-[34px]">
                      {periodLabel}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="size-9 rounded-sm shadow-none" aria-label="Previous period" onClick={() => move(-1)}>
                      <ChevronLeft />
                    </Button>
                    <Button variant="outline" className="h-9 rounded-sm px-3 text-xs font-semibold shadow-none" onClick={() => { setCursor(today); setSelectedDate(today) }}>
                      Today
                    </Button>
                    <Button variant="outline" size="icon" className="size-9 rounded-sm shadow-none" aria-label="Next period" onClick={() => move(1)}>
                      <ChevronRight />
                    </Button>
                  </div>
                </div>

                <div className="mb-5 flex w-max border border-border bg-card p-0.5">
                  {views.map((option) => (
                    <Button
                      key={option}
                      variant="ghost"
                      onClick={() => setView(option)}
                      className={`h-8 rounded-sm px-4 text-xs font-bold shadow-none ${view === option ? 'bg-foreground text-background hover:bg-foreground hover:text-background' : 'text-muted-foreground'}`}
                    >
                      {option}
                    </Button>
                  ))}
                </div>

                {view === 'Month' ? (
                  <MonthView cursor={cursor} selected={selectedDate} meetings={filtered} onSelect={(date) => setSelectedDate(date)} onCreate={(date) => { setSelectedDate(date); create(date) }} onOpen={open} />
                ) : (
                  <TimeView cursor={cursor} view={view} meetings={filtered} onSelect={(date) => { setSelectedDate(date); create(date) }} onOpen={open} />
                )}

                <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
                  {(['Client Meeting', 'Internal Meeting', 'Follow-up', 'Important', 'Other'] as MeetingType[]).map((type) => (
                    <span key={type} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className={`size-1.5 ${eventColors[type]}`} />
                      {type}
                    </span>
                  ))}
                </div>
              </div>

              <aside className="border-t border-border bg-panel px-6 py-7 xl:min-h-[calc(100vh-160px)] xl:border-l xl:border-t-0">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-lg font-bold">
                    Upcoming<span className="text-primary">.</span>
                  </h3>
                  <Button variant="link" className="h-auto p-0 text-[11px] font-bold" onClick={() => selectSection('Upcoming')}>
                    View all <ChevronRight className="size-3" />
                  </Button>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">What’s next on your schedule</div>
                <div className="mt-6">
                  <UpcomingList meetings={upcoming.slice(0, 6)} onOpen={open} search={search} />
                </div>
                <div className="mt-8 border-t border-border pt-6">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">At a glance</p>
                  <div className="mt-4 grid grid-cols-3 gap-2 xl:grid-cols-1 xl:gap-0">
                    {[
                      ['Today', todaysCount],
                      ['This week', weekCount],
                      ['Upcoming', upcoming.length],
                    ].map(([label, count]) => (
                      <div key={label as string} className="flex flex-col border-l-2 border-border pl-3 xl:flex-row xl:items-center xl:justify-between xl:border-l-0 xl:border-b xl:pl-0 xl:py-3">
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</span>
                        <span className="font-display text-xl font-bold xl:text-base">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          )}
        </main>
      )}
    </div>

    {section !== 'Settings' && (
      <Button aria-label="Create meeting" onClick={() => create()} className="fixed bottom-5 right-5 z-20 size-14 rounded-full shadow-lg sm:hidden">
        <Plus className="size-6" />
      </Button>
    )}

    <MeetingDialog
      meeting={active}
      mode={dialogMode}
      isGoogleConnected={googleConnected}
      userId={user?.id}
      onClose={() => setActive(null)}
      onSave={handleSave}
      onDelete={handleDelete}
      onDuplicate={handleDuplicate}
      onEdit={() => setDialogMode('edit')}
    />
  </div>
}

const eventCardBgStyles: Record<MeetingType, string> = {
  'Client Meeting': 'bg-purple-600 text-white hover:bg-purple-700 shadow border-l-4 border-purple-950 font-bold',
  'Internal Meeting': 'bg-emerald-600 text-white hover:bg-emerald-700 shadow border-l-4 border-emerald-950 font-bold',
  'Follow-up': 'bg-amber-500 text-slate-950 hover:bg-amber-600 shadow border-l-4 border-amber-900 font-bold',
  'Important': 'bg-rose-600 text-white hover:bg-rose-700 shadow border-l-4 border-rose-950 font-bold',
  'Other': 'bg-indigo-600 text-white hover:bg-indigo-700 shadow border-l-4 border-indigo-950 font-bold',
}

function EventCard({ meeting, onOpen, compact = false }: { meeting: Meeting; onOpen: (meeting: Meeting) => void; compact?: boolean }) {
  const bgStyle = eventCardBgStyles[meeting.color] || eventCardBgStyles[meeting.type] || 'bg-purple-600 text-white font-bold'

  return (
    <Button
      variant="ghost"
      onClick={(e) => {
        e.stopPropagation()
        onOpen(meeting)
      }}
      title={`${formatTime(meeting.startTime)} · ${meeting.title} (${meeting.type})`}
      className={`flex h-auto min-w-0 w-full items-center justify-start gap-1.5 overflow-hidden rounded-md px-2 text-left transition-all ${bgStyle} ${
        compact ? 'py-1 text-[11px]' : 'py-1.5 text-xs'
      } hover:scale-[1.01] hover:shadow-md`}
    >
      <span className="shrink-0 rounded bg-black/25 px-1 py-0.5 text-[9px] font-extrabold tracking-tight text-white">
        {meeting.startTime}
      </span>
      <span className="truncate font-bold tracking-tight">{meeting.title}</span>
    </Button>
  )
}

function MonthView({ cursor, selected, meetings, onSelect, onOpen, onCreate }: { cursor: Date; selected: Date; meetings: Meeting[]; onSelect: (date: Date) => void; onOpen: (meeting: Meeting) => void; onCreate: (date: Date) => void }) {
  const [dayModalDate, setDayModalDate] = useState<Date | null>(null)
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) })
  const grouped = useMemo(() => meetings.reduce<Record<string, Meeting[]>>((acc, meeting) => { (acc[meeting.date] ??= []).push(meeting); return acc }, {}), [meetings])

  const modalMeetings = useMemo(() => {
    if (!dayModalDate) return []
    const key = format(dayModalDate, 'yyyy-MM-dd')
    return (grouped[key] || []).sort((a, b) => a.startTime.localeCompare(b.startTime))
  }, [dayModalDate, grouped])

  return (
    <>
      <div className="overflow-hidden rounded-md border-2 border-border bg-card shadow-md">
        <div className="grid calendar-grid border-b-2 border-border bg-muted/90">
          {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day) => (
            <div key={day} className="px-1 py-2.5 text-center text-xs font-black tracking-wider text-foreground">
              {day}
            </div>
          ))}
        </div>
        <div className="grid calendar-grid">
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd')
            const items = grouped[key] || []
            const current = isSameDay(day, today)
            const selectedDay = isSameDay(day, selected)
            const isCurrentMonth = isSameMonth(day, cursor)
            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                aria-label={`View meetings on ${format(day, 'MMMM d, yyyy')}`}
                onClick={() => {
                  onSelect(day)
                  if (items.length > 3) {
                    setDayModalDate(day)
                  } else {
                    onCreate(day)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(day)
                    if (items.length > 3) {
                      setDayModalDate(day)
                    } else {
                      onCreate(day)
                    }
                  }
                }}
                className={`group relative min-h-[90px] min-w-0 cursor-pointer border-b border-r border-border p-1.5 transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary sm:min-h-[120px] sm:p-2 lg:min-h-[135px] ${
                  !isCurrentMonth ? 'bg-muted/60 text-muted-foreground/50' : 'bg-card text-foreground'
                } ${selectedDay && !current ? 'ring-2 ring-inset ring-primary bg-primary/10' : ''}`}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className={`flex size-6.5 items-center justify-center rounded-md font-display text-xs sm:size-7 sm:text-sm ${
                    current ? 'bg-primary text-primary-foreground font-black shadow-md ring-2 ring-primary/40' : 'font-extrabold text-foreground'
                  }`}>
                    {format(day, 'd')}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hidden size-6 text-primary group-hover:flex"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelect(day)
                      onCreate(day)
                    }}
                    title="Add new meeting"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
                <div className="space-y-1">
                  {items.slice(0, 3).map((m) => (
                    <EventCard key={m.id} meeting={m} onOpen={onOpen} compact />
                  ))}
                  {items.length > 3 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect(day)
                        setDayModalDate(day)
                      }}
                      className="flex w-full items-center justify-between rounded bg-primary/15 px-1.5 py-1 text-left text-[11px] font-black text-primary hover:bg-primary/25 transition-colors"
                      title="Click to view all meetings for this day"
                    >
                      <span>+{items.length - 3} more</span>
                      <ChevronRight className="size-3" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Day Overview Schedule Dialog */}
      {dayModalDate && (
        <Dialog open={!!dayModalDate} onOpenChange={(open) => { if (!open) setDayModalDate(null) }}>
          <DialogContent className="max-h-[85vh] max-w-[500px] gap-0 overflow-y-auto rounded-sm border-border bg-card p-0 sm:max-w-[500px]">
            <DialogHeader className="border-b border-border px-6 py-5 text-left">
              <div className="flex items-center justify-between pr-6">
                <div>
                  <p className="text-[10px] font-bold uppercase text-primary">Day Schedule</p>
                  <DialogTitle className="mt-0.5 font-display text-xl font-bold">
                    {format(dayModalDate, 'EEEE, MMMM d, yyyy')}
                  </DialogTitle>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    const dateToCreate = dayModalDate
                    setDayModalDate(null)
                    onCreate(dateToCreate)
                  }}
                  className="gap-1.5 font-bold text-xs"
                >
                  <Plus className="size-3.5" /> New Meeting
                </Button>
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Showing all {modalMeetings.length} meetings scheduled for this date.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2.5 p-6">
              {modalMeetings.map((m) => {
                const bgStyle = eventCardBgStyles[m.color] || eventCardBgStyles[m.type] || 'bg-purple-600 text-white font-bold'
                return (
                  <div
                    key={m.id}
                    onClick={() => {
                      setDayModalDate(null)
                      onOpen(m)
                    }}
                    className={`flex cursor-pointer items-center justify-between rounded-md p-3.5 transition-all ${bgStyle} hover:scale-[1.01] hover:shadow-md`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                          {formatTime(m.startTime)} – {formatTime(m.endTime)}
                        </span>
                        <span className="text-[10px] font-extrabold uppercase tracking-wide opacity-90">{m.type}</span>
                      </div>
                      <p className="mt-1.5 truncate text-sm font-extrabold">{m.title}</p>
                      {m.client && <p className="mt-0.5 text-xs opacity-90 font-medium">Client: {m.client}</p>}
                    </div>
                    <ChevronRight className="size-5 shrink-0 opacity-80" />
                  </div>
                )
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function TimeView({ cursor, view, meetings, onSelect, onOpen }: { cursor: Date; view: View; meetings: Meeting[]; onSelect: (date: Date) => void; onOpen: (meeting: Meeting) => void }) {
  const days = view === 'Day' ? [cursor] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor, { weekStartsOn: 1 }), i))
  return (
    <div className="overflow-hidden rounded-md border-2 border-border bg-card shadow-md">
      <div className={`grid border-b-2 border-border bg-muted/90 ${view === 'Week' ? 'calendar-grid' : ''}`}>
        {days.map((day) => (
          <div key={day.toISOString()} className="border-r border-border p-3 text-center">
            <div className="text-xs font-black tracking-wider text-foreground">{format(day, 'EEE').toUpperCase()}</div>
            <div className={`mx-auto mt-1 flex size-7 items-center justify-center rounded-md font-display text-sm ${
              isSameDay(day, today) ? 'bg-primary text-primary-foreground font-black shadow-md' : 'font-extrabold text-foreground'
            }`}>
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>
      <div className={`grid ${view === 'Week' ? 'calendar-grid' : ''}`}>
        {days.map((day) => {
          const items = meetings.filter((m) => m.date === format(day, 'yyyy-MM-dd'))
          return (
            <div key={day.toISOString()} className="min-h-[360px] min-w-0 space-y-2 border-r border-border p-2 sm:p-3">
              {items.map((m) => (
                <div key={m.id} className="min-w-0">
                  <EventCard meeting={m} onOpen={onOpen} />
                  <div className="hidden pl-2 pt-1 text-[10px] font-bold text-muted-foreground sm:block">
                    {formatTime(m.startTime)} – {formatTime(m.endTime)}
                  </div>
                </div>
              ))}
              <Button variant="ghost" onClick={() => onSelect(day)} className="h-8 w-full justify-start rounded-sm px-1 text-[10px] font-bold text-muted-foreground hover:text-primary sm:px-2">
                <Plus className="size-3" />
                <span className="hidden sm:inline">Add meeting</span>
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function UpcomingList({ meetings, onOpen, long = false, search }: { meetings: Meeting[]; onOpen: (meeting: Meeting) => void; long?: boolean; search: string }) {
  if (!meetings.length) return (
    <div className="py-10 text-center">
      <CalendarDays className="mx-auto size-7 text-primary/50" />
      <p className="mt-3 text-sm font-semibold">{search ? 'No matching meetings' : 'Nothing on the horizon'}</p>
      <p className="mt-1 text-xs text-muted-foreground">{search ? 'Try another search.' : 'Your upcoming meetings will appear here.'}</p>
    </div>
  )
  let previous = ''
  return (
    <div className="space-y-1">
      {meetings.map((m) => {
        const date = parseISO(m.date)
        const group = isSameDay(date, today) ? 'TODAY' : isSameDay(date, addDays(today, 1)) ? 'TOMORROW' : format(date, 'MMM d').toUpperCase()
        const showGroup = previous !== group
        previous = group
        return (
          <div key={m.id}>
            {showGroup && <p className={`text-[10px] font-bold text-muted-foreground ${long ? 'mt-8 mb-3' : 'mt-5 mb-3'}`}>{group}</p>}
            <Button variant="ghost" onClick={() => onOpen(m)} className={`group flex h-auto w-full items-start gap-3 rounded-sm border border-transparent bg-card p-3 text-left shadow-none hover:border-border hover:bg-card ${long ? 'sm:p-5' : ''}`}>
              <span className={`mt-1.5 size-2 shrink-0 ${eventColors[m.color]}`} />
              <span className="min-w-0 flex-1">
                <span className={`block truncate font-semibold ${long ? 'text-sm sm:text-base' : 'text-xs'}`}>{m.title}</span>
                <span className="mt-1 block truncate text-[11px] font-normal text-muted-foreground">{m.client || m.type}</span>
              </span>
              <span className="shrink-0 text-[10px] font-bold text-muted-foreground">{formatTime(m.startTime)}</span>
            </Button>
          </div>
        )
      })}
    </div>
  )
}
