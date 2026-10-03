import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Mail, Menu, Plus, Search, Settings2, X, LogOut, CheckCircle2, AlertCircle, RefreshCw, Pin, Bell, Video, User, ArrowRight, Sparkles, Fingerprint } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { MeetingDialog } from '@/components/calendar/MeetingDialog'
import { blankMeeting, calculateReminderDisplay, formatTime, Meeting, MeetingType, UserProfile } from '@/lib/calendar'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { createMeetingFn, deleteMeetingFn, disconnectGoogleFn, getGoogleConnectUrlFn, runReminderSchedulerFn, saveDefaultReminderEmailsFn, updateMeetingFn } from '@/lib/server-actions'
import { isWebAuthnSupported, registerPasskey } from '@/lib/webauthn'

export function BuildicyLogoLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          <img src="/favicon.png" alt="Buildicy Logo" className="size-20 sm:size-24 object-contain animate-logo-spin drop-shadow-md" />
        </div>
        <div className="text-center">
          <p className="font-display text-xs font-extrabold uppercase tracking-widest text-primary">BUILDICY<span className="text-foreground">CALENDAR</span></p>
          <p className="mt-1 text-[11px] font-medium text-muted-foreground animate-pulse">Loading workspace...</p>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  head: () => ({ meta: [
    { title: 'Buildicy Calendar | Meetings, made clear' },
    { name: 'description', content: 'A focused calendar for Buildicy founders to organize meetings and reminders.' },
    { property: 'og:title', content: 'Buildicy Calendar | Meetings, made clear' },
    { property: 'og:description', content: 'A focused calendar for Buildicy founders to organize meetings and reminders.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  pendingComponent: BuildicyLogoLoading,
  component: CalendarApp,
})

type View = 'Month' | 'Week' | 'Day'
type Section = 'Calendar' | 'Upcoming' | 'Settings'
const views: View[] = ['Month', 'Week', 'Day']
const eventColors: Record<MeetingType, string> = { 'Client Meeting': 'bg-client', 'Internal Meeting': 'bg-internal', 'Follow-up': 'bg-followup', Important: 'bg-important', Other: 'bg-other' }
const eventBorders: Record<MeetingType, string> = { 'Client Meeting': 'border-client', 'Internal Meeting': 'border-internal', 'Follow-up': 'border-followup', Important: 'border-important', Other: 'border-other' }
const today = new Date()

function UserProfileBlock({ user, onSignOut, onOpenSettings, expanded = true }: { user: UserProfile | null; onSignOut: () => void; onOpenSettings?: () => void; expanded?: boolean }) {
  const name = user?.name || 'Founder'
  const role = user?.role || 'Buildicy'
  const initial = name[0]?.toUpperCase() || 'B'

  return (
    <div className={`flex items-center border-t border-border py-4 transition-all ${expanded ? 'px-5 gap-3' : 'justify-center px-2'}`}>
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 font-display text-sm font-bold text-primary hover:bg-primary/25 hover:scale-105 transition-all cursor-pointer shadow-xs"
        title="Open Settings"
      >
        {initial}
      </button>
      {expanded && (
        <>
          <div className="min-w-0 flex-1 cursor-pointer group" onClick={onOpenSettings} title="Open Settings">
            <div className="truncate text-sm font-bold group-hover:text-primary transition-colors">{name}</div>
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
  const [biometricEnabled, setBiometricEnabled] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('buildicy_passkey_credential_id')
    if (stored) setBiometricEnabled(true)
  }, [])

  const handleEnableBiometric = async () => {
    if (!user) return
    setBiometricLoading(true)
    try {
      const result = await registerPasskey(user.id, user.email || '')
      if (!result) { setStatusMsg({ type: 'error', text: 'Biometric setup failed. Try again.' }); return }
      localStorage.setItem('buildicy_passkey_credential_id', result.credentialId)
      localStorage.setItem('buildicy_passkey_email', user.email || '')
      setBiometricEnabled(true)
      setStatusMsg({ type: 'success', text: 'Fingerprint / Face ID enabled successfully!' })
    } catch {
      setStatusMsg({ type: 'error', text: 'Biometric setup failed.' })
    } finally {
      setBiometricLoading(false)
    }
  }

  const handleDisableBiometric = () => {
    localStorage.removeItem('buildicy_passkey_credential_id')
    localStorage.removeItem('buildicy_passkey_email')
    localStorage.removeItem('buildicy_passkey_pwd')
    setBiometricEnabled(false)
    setStatusMsg({ type: 'success', text: 'Biometric login disabled.' })
  }

  // Auth Redirect Guard
  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: '/login' })
    }
  }, [user, authLoading, navigate])

  // Fetch Meetings & Google Connection status from Supabase
  const SHARED_OWNER_ID = '85f65368-252f-41c3-8831-be3b2c970ec2'

  const loadSupabaseData = async () => {
    if (!user) return
    setDbLoading(true)

    try {
      // Execute queries in parallel to minimize load time
      const [meetingsRes, gConnRes, profileRes, remindersRes] = await Promise.all([
        supabase
          .from('meetings')
          .select('*')
          .eq('user_id', SHARED_OWNER_ID)
          .order('date', { ascending: true }),
        supabase
          .from('google_connections')
          .select('*')
          .eq('user_id', SHARED_OWNER_ID)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('default_reminder_emails')
          .eq('user_id', SHARED_OWNER_ID)
          .limit(1),
        supabase
          .from('reminders')
          .select('meeting_id, reminder_type')
          .eq('user_id', SHARED_OWNER_ID)
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
    const SHARED_OWNER_ID = '85f65368-252f-41c3-8831-be3b2c970ec2'
    setStatusMsg(null)
    try {
      if (meeting.id && !meeting.id.startsWith('sample-')) {
        // Update existing meeting
        const res = await updateMeetingFn({
          data: {
            userId: SHARED_OWNER_ID,
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
            userId: SHARED_OWNER_ID,
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
            .eq('user_id', SHARED_OWNER_ID)
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
              user_id: SHARED_OWNER_ID,
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
    const SHARED_OWNER_ID = '85f65368-252f-41c3-8831-be3b2c970ec2'
    const target = meetings.find(m => m.id === id)
    try {
      if (id && !id.startsWith('sample-')) {
        await deleteMeetingFn({
          data: {
            userId: SHARED_OWNER_ID,
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
      await saveDefaultReminderEmailsFn({ data: { userId: '85f65368-252f-41c3-8831-be3b2c970ec2', emails: updated } })
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
    return <BuildicyLogoLoading />
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
        <UserProfileBlock user={profile} onSignOut={signOut} onOpenSettings={() => selectSection('Settings')} expanded={isSidebarOpen} />
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
          <button
            type="button"
            onClick={() => selectSection('Settings')}
            className="flex size-8 items-center justify-center rounded-lg bg-primary/15 font-display text-xs font-bold text-primary hover:bg-primary/25 hover:scale-105 transition-all cursor-pointer sm:size-9 shadow-xs"
            title="Open Settings"
          >
            {profile?.name ? profile.name[0].toUpperCase() : 'M'}
          </button>
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
        <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:px-10">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-primary">Workspace settings / 03</p>
            <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Settings<span className="text-primary">.</span></h1>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">Manage your founder profile, Google Calendar sync, and automated email reminders.</p>
          </div>

          <div className="mt-8 space-y-6">
            {/* 1. Account & Founder Profile Card */}
            <div className="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 font-display text-xl font-black text-primary shadow-xs">
                    {profile?.name ? profile.name[0].toUpperCase() : 'M'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-foreground">{profile?.name || 'Founder'}</h3>
                      <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-bold text-primary uppercase">
                        {profile?.role || 'Founder'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{profile?.email || user?.email}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={signOut} className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 font-bold text-xs">
                  <LogOut className="size-3.5" /> Sign out
                </Button>
              </div>
            </div>

            {/* 2. Biometric Login Card — mobile only */}
            {isWebAuthnSupported() && (
              <div className="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <Fingerprint className="size-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold">Fingerprint / Face ID</h3>
                      <p className="text-xs text-muted-foreground">Skip password on this device using biometrics.</p>
                    </div>
                  </div>
                  {biometricEnabled ? (
                    <Button variant="outline" size="sm" onClick={handleDisableBiometric} className="text-destructive border-destructive/30 hover:bg-destructive/10 font-bold text-xs">
                      Disable
                    </Button>
                  ) : (
                    <Button size="sm" onClick={handleEnableBiometric} disabled={biometricLoading} className="font-bold text-xs gap-2">
                      <Fingerprint className="size-3.5" />
                      {biometricLoading ? 'Setting up...' : 'Enable'}
                    </Button>
                  )}
                </div>
                {biometricEnabled && (
                  <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5" /> Active on this device
                  </p>
                )}
              </div>
            )}

            {/* 4. Google Calendar & Video Call Integration Card */}
            <div className="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    <Video className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground">Google Calendar & Meet Integration</h3>
                    <p className="text-xs text-muted-foreground">Sync meetings and automatically generate Google Meet video call links.</p>
                  </div>
                </div>
                <div>
                  {googleConnected ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                      Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                      <AlertCircle className="size-3.5 text-amber-500" />
                      Not Connected
                    </span>
                  )}
                </div>
              </div>

              {googleConnected ? (
                <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Connected Google Account: <strong className="text-foreground font-semibold">{googleEmail || user?.email}</strong>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ⚡ Automatic Google Meet video links are generated whenever you create a meeting.
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleDisconnectGoogle} className="text-destructive hover:bg-destructive/10 font-bold text-xs h-9">
                    Disconnect Google Account
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                  <p className="text-xs text-muted-foreground max-w-lg">
                    Connect your Google account to automatically sync your meetings and create Google Meet video room URLs seamlessly.
                  </p>
                  <Button onClick={handleConnectGoogle} disabled={googleLoading} className="gap-2 font-bold text-xs h-9 px-4">
                    {googleLoading ? <RefreshCw className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                    Connect Google Calendar
                  </Button>
                </div>
              )}
            </div>

            {/* 5. Automated Email Reminders & Recipient Manager Card */}
            <div className="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-xs space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                    <Bell className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground">Automated Email Reminders</h3>
                    <p className="text-xs text-muted-foreground">Configure default recipient email addresses for automatic meeting reminders.</p>
                  </div>
                </div>
                <Button onClick={handleRunReminders} disabled={runningCron} variant="outline" size="sm" className="gap-2 font-bold text-xs h-9">
                  <RefreshCw className={`size-3.5 ${runningCron ? 'animate-spin' : ''}`} />
                  Run Reminders Now
                </Button>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Default Email Recipients
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="e.g. founder@company.com or client@buildicy.com"
                    value={newDefaultEmail}
                    onChange={(e) => setNewDefaultEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddDefaultEmail() } }}
                  />
                  <Button onClick={handleAddDefaultEmail} disabled={savingEmails} className="h-10 gap-2 px-4 font-bold text-xs rounded-lg">
                    <Mail className="size-3.5" /> Add Email
                  </Button>
                </div>

                {defaultReminderEmails.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {defaultReminderEmails.map((email) => (
                      <span key={email} className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/80 px-3 py-1.5 text-xs font-semibold text-foreground shadow-xs">
                        <Mail className="size-3.5 text-primary" />
                        {email}
                        <button
                          type="button"
                          onClick={() => handleRemoveDefaultEmail(email)}
                          className="text-muted-foreground hover:text-destructive transition-colors ml-1"
                          aria-label={`Remove ${email}`}
                        >
                          <X className="size-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">No default recipient emails added yet. Reminders will automatically target your primary account email.</p>
                )}
              </div>
            </div>

            {/* 6. System Preferences Card */}
            <div className="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-xs">
              <div className="flex items-center gap-2.5 border-b border-border/60 pb-3 mb-4">
                <Settings2 className="size-4 text-primary" />
                <h3 className="text-base font-bold text-foreground">System & Regional Preferences</h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-4 text-xs">
                <div className="rounded-lg border border-border/60 bg-secondary/40 p-3">
                  <span className="text-muted-foreground">Default Timezone:</span>
                  <p className="font-bold text-foreground text-sm mt-0.5">Asia/Kolkata (IST)</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-secondary/40 p-3">
                  <span className="text-muted-foreground">Email Delivery Engine:</span>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400 text-sm mt-0.5">Gmail SMTP & Resend Active</p>
                </div>
              </div>
            </div>
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

function UpcomingList({ meetings, onOpen, search }: { meetings: Meeting[]; onOpen: (meeting: Meeting) => void; long?: boolean; search: string }) {
  if (!meetings.length) return (
    <div className="py-16 text-center border border-dashed border-border/70 rounded-2xl bg-card/40 px-4">
      <CalendarDays className="mx-auto size-10 text-primary/40" />
      <p className="mt-4 text-base font-bold">{search ? 'No matching meetings found' : 'Nothing on the horizon'}</p>
      <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">{search ? 'Try adjusting your search query.' : 'Your upcoming agenda and scheduled reminder notifications will appear here.'}</p>
    </div>
  )

  let previousGroup = ''

  return (
    <div className="space-y-4">
      {meetings.map((m) => {
        const date = parseISO(m.date)
        const group = isSameDay(date, today) ? 'TODAY' : isSameDay(date, addDays(today, 1)) ? 'TOMORROW' : format(date, 'EEEE, MMMM d').toUpperCase()
        const showGroup = previousGroup !== group
        previousGroup = group

        const categoryTheme: Record<MeetingType, { badge: string; border: string; dot: string }> = {
          'Client Meeting': { badge: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20', border: 'border-l-purple-600', dot: 'bg-purple-600' },
          'Internal Meeting': { badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', border: 'border-l-emerald-600', dot: 'bg-emerald-600' },
          'Follow-up': { badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', border: 'border-l-amber-600', dot: 'bg-amber-600' },
          'Important': { badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20', border: 'border-l-rose-600', dot: 'bg-rose-600' },
          'Other': { badge: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20', border: 'border-l-indigo-600', dot: 'bg-indigo-600' },
        }

        const theme = categoryTheme[m.color || m.type] || categoryTheme['Client Meeting']

        return (
          <div key={m.id} className="space-y-2">
            {showGroup && (
              <div className="flex items-center gap-3 pt-5 pb-1">
                <span className="flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-[11px] font-black tracking-wider text-primary uppercase">
                  <CalendarDays className="size-3.5" />
                  {group}
                </span>
                <div className="h-px flex-1 bg-border/60" />
              </div>
            )}

            <div
              onClick={() => onOpen(m)}
              className={`group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm hover:shadow-lg hover:border-primary/40 transition-all duration-200 cursor-pointer overflow-hidden border-l-4 ${theme.border}`}
            >
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-[11px] font-bold ${theme.badge}`}>
                    <span className={`size-1.5 rounded-full ${theme.dot} animate-pulse`} />
                    {m.type}
                  </span>

                  <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-foreground">
                    <Clock3 className="size-3 text-muted-foreground" />
                    {formatTime(m.startTime)} – {formatTime(m.endTime)}
                  </span>

                  {m.google_meet_link && (
                    <a
                      href={m.google_meet_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors"
                    >
                      <Video className="size-3 text-blue-500" />
                      Google Meet
                    </a>
                  )}
                </div>

                <div>
                  <h3 className="text-base sm:text-lg font-bold text-foreground group-hover:text-primary transition-colors truncate">
                    {m.title}
                  </h3>
                  {m.client && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                      <User className="size-3.5 text-primary/80" />
                      <span>Client: <strong className="text-foreground">{m.client}</strong></span>
                    </p>
                  )}
                </div>

                {m.reminders && m.reminders.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pt-2.5 border-t border-border/50">
                    <span className="flex items-center gap-1 text-[11px] font-bold text-primary">
                      <Bell className="size-3 text-amber-500 animate-pulse" />
                      Notifications:
                    </span>
                    {m.reminders.map((r, idx) => {
                      const triggerDisplay = calculateReminderDisplay(m.date, m.startTime, r)
                      return (
                        <span key={idx} className="inline-flex items-center gap-1.5 rounded-md bg-secondary/80 border border-border/80 px-2.5 py-1 text-[11px] font-medium text-foreground">
                          <span>{r}</span>
                          {triggerDisplay && (
                            <span className="font-bold text-primary bg-primary/10 px-1.5 py-0.2 rounded text-[10px]">
                              📩 {triggerDisplay}
                            </span>
                          )}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center sm:self-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-lg text-xs font-bold border-border group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all shadow-none"
                >
                  <span>Agenda</span>
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                </Button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

