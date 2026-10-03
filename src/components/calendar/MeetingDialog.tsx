import { useEffect, useState } from 'react'
import { Check, Copy, Loader2, Mail, Pencil, Plus, Trash2, X, Video } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Meeting, MeetingType, Reminder, reminderOptions, types, formatTime, calculateReminderDisplay } from '@/lib/calendar'
import { createGoogleMeetLinkFn } from '@/lib/google-server-actions'

type Props = {
  meeting: Meeting | null
  mode: 'create' | 'view' | 'edit'
  isGoogleConnected?: boolean
  userId?: string
  onClose: () => void
  onSave: (meeting: Meeting) => void
  onDelete: (id: string) => void
  onDuplicate: (meeting: Meeting) => void
  onEdit: () => void
}

const colors: Record<MeetingType, string> = {
  'Client Meeting': 'bg-client',
  'Internal Meeting': 'bg-internal',
  'Follow-up': 'bg-followup',
  Important: 'bg-important',
  Other: 'bg-other',
}
const fieldClass = 'mt-2 h-11 w-full rounded-sm border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary'
const labelClass = 'block text-[11px] font-bold uppercase text-muted-foreground'

export function MeetingDialog({ meeting, mode, isGoogleConnected, userId, onClose, onSave, onDelete, onDuplicate, onEdit }: Props) {
  const [draft, setDraft] = useState<Meeting | null>(meeting)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [meetLinkLoading, setMeetLinkLoading] = useState(false)
  const [meetLinkError, setMeetLinkError] = useState('')
  const [newReminderEmail, setNewReminderEmail] = useState('')

  useEffect(() => {
    setDraft(meeting)
    setConfirmDelete(false)
    setIsSubmitting(false)
    setMeetLinkError('')
  }, [meeting, mode])

  if (!meeting || !draft) return null

  const update = <K extends keyof Meeting>(key: K, value: Meeting[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current))

  const toggleReminder = (reminder: Reminder) =>
    update('reminders', draft.reminders.includes(reminder) ? draft.reminders.filter((r) => r !== reminder) : [...draft.reminders, reminder])

  const addReminderEmail = () => {
    const email = newReminderEmail.trim()
    if (!email || !email.includes('@')) return
    const current = draft.reminderEmails || []
    if (!current.includes(email)) update('reminderEmails', [...current, email])
    setNewReminderEmail('')
  }

  const removeReminderEmail = (email: string) =>
    update('reminderEmails', (draft.reminderEmails || []).filter((e) => e !== email))

  const handleGenerateMeetLink = async () => {
    if (!userId || !draft) return
    setMeetLinkLoading(true)
    setMeetLinkError('')
    try {
      const res = await createGoogleMeetLinkFn({
        data: {
          userId,
          title: draft.title || 'Buildicy Meeting',
          date: draft.date,
          startTime: draft.startTime,
          endTime: draft.endTime,
        }
      })
      if (res.error) {
        setMeetLinkError('Could not reach Google. Check your internet connection and try again.')
        return
      }
      setDraft((current) => current ? {
        ...current,
        meetingLink: res.googleMeetLink,
        google_meet_link: res.googleMeetLink,
        google_event_id: res.googleEventId,
      } : current)
    } catch {
      setMeetLinkError('Could not reach Google. Check your internet connection and try again.')
    } finally {
      setMeetLinkLoading(false)
    }
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (draft.endTime <= draft.startTime) return
    setIsSubmitting(true)
    try {
      await onSave(draft)
    } finally {
      setIsSubmitting(false)
    }
  }

  const meetUrl = draft.google_meet_link || draft.meetingLink

  return (
    <Dialog open={!!meeting} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] max-w-[560px] gap-0 overflow-y-auto rounded-sm border-border bg-card p-0 sm:max-w-[560px]">
        <DialogHeader className="border-b border-border px-6 py-5 text-left sm:px-8">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase text-primary">
            <span className="size-2 bg-primary" /> {mode === 'view' ? 'Meeting details' : mode === 'edit' ? 'Edit meeting' : 'New meeting'}
          </div>
          <DialogTitle className="pr-8 font-display text-2xl font-bold">
            {mode === 'view' ? draft.title : mode === 'edit' ? 'Update meeting' : 'Make room for what matters.'}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {mode === 'view' ? 'Everything you need for this meeting.' : 'Add the details, then save it to your calendar.'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'view' ? (
          <div className="space-y-6 px-6 py-6 sm:px-8">
            <div className="grid grid-cols-2 gap-5 border-b border-border pb-6">
              <Detail label="Date" value={draft.date ? format(parseISO(draft.date), 'EEEE, MMMM d, yyyy') : '—'} />
              <Detail label="Time" value={`${formatTime(draft.startTime)} – ${formatTime(draft.endTime)}`} />
              <Detail label="Client / company" value={draft.client || '—'} />
              <div>
                <p className={labelClass}>Meeting type</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
                  <span className={`size-2.5 ${colors[draft.color]}`} />
                  {draft.type}
                </p>
              </div>
            </div>

            <Detail label="Description" value={draft.description || 'No description added.'} />

            {/* Meeting Link & Google Meet Section */}
            <div>
              <p className={labelClass}>Video Conferencing</p>
              {meetUrl ? (
                <div className="mt-2 space-y-2">
                  {draft.google_meet_link && (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-500">
                      <Check className="size-4" /> Google Meet created automatically
                    </div>
                  )}
                  <a
                    href={meetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-sm bg-primary px-5 font-display text-xs font-bold uppercase tracking-wide text-primary-foreground shadow-sm hover:bg-primary/90"
                  >
                    <Video className="size-4" /> Join Google Meet
                  </a>
                  <p className="text-[11px] text-muted-foreground truncate">{meetUrl}</p>
                </div>
              ) : (
                <div className="mt-2 text-sm text-muted-foreground">
                  {!isGoogleConnected ? (
                    <div className="border border-border bg-secondary/50 p-3 text-xs">
                      <p className="font-semibold text-foreground">Google Calendar not connected.</p>
                      <p className="mt-1 text-muted-foreground">Connect Google Calendar in Settings to automatically generate Google Meet links.</p>
                    </div>
                  ) : (
                    'No video call link attached.'
                  )}
                </div>
              )}
            </div>

            <div>
              <p className={labelClass}>Reminders</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {draft.reminders.length ? (
                  draft.reminders.map((r) => {
                    const timeStr = calculateReminderDisplay(draft.date, draft.startTime, r)
                    return (
                      <span key={r} className="border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium">
                        {r} {timeStr ? <span className="text-[11px] font-bold text-primary ml-1">(📩 Sent at {timeStr})</span> : null}
                      </span>
                    )
                  })
                ) : (
                  <span className="text-sm text-muted-foreground">No reminders set</span>
                )}
              </div>
            </div>

            {confirmDelete ? (
              <div className="border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm font-semibold">Delete this meeting?</p>
                <p className="mt-1 text-xs text-muted-foreground">This will remove the meeting, cancel Google Calendar events, and clear pending reminders.</p>
                <div className="mt-4 flex gap-2">
                  <Button variant="destructive" size="sm" onClick={() => onDelete(draft.id)}>
                    Confirm Delete
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 border-t border-border pt-5">
                <Button onClick={onEdit}>
                  <Pencil className="size-3.5" /> Edit
                </Button>
                <Button variant="outline" onClick={() => onDuplicate(draft)}>
                  <Copy className="size-3.5" /> Duplicate
                </Button>
                <Button variant="ghost" className="ml-auto text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-3.5" /> Delete
                </Button>
              </div>
            )}
          </div>
        ) : (
          <form className="space-y-6 px-6 py-6 sm:px-8" onSubmit={handleFormSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={`${labelClass} sm:col-span-2`}>
                Meeting title *
                <input
                  autoFocus
                  required
                  maxLength={100}
                  className={fieldClass}
                  placeholder="e.g. Client discovery call"
                  value={draft.title}
                  onChange={(e) => update('title', e.target.value)}
                />
              </label>

              <label className={`${labelClass} sm:col-span-2`}>
                Client / company
                <input
                  className={fieldClass}
                  placeholder="e.g. Acme Technologies"
                  value={draft.client}
                  onChange={(e) => update('client', e.target.value)}
                />
              </label>

              <label className={labelClass}>
                Date *
                <input required type="date" className={fieldClass} value={draft.date} onChange={(e) => update('date', e.target.value)} />
              </label>

              <label className={labelClass}>
                Meeting type
                <select
                  className={fieldClass}
                  value={draft.type}
                  onChange={(e) => {
                    const type = e.target.value as MeetingType
                    setDraft((current) => (current ? { ...current, type, color: type } : current))
                  }}
                >
                  {types.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>

              <label className={labelClass}>
                Start time
                <input required type="time" className={fieldClass} value={draft.startTime} onChange={(e) => update('startTime', e.target.value)} />
              </label>

              <label className={labelClass}>
                End time
                <input required type="time" min={draft.startTime} className={fieldClass} value={draft.endTime} onChange={(e) => update('endTime', e.target.value)} />
              </label>
            </div>

            {draft.endTime <= draft.startTime && <p className="text-xs text-destructive">End time must be after start time.</p>}

            <div>
              <p className={labelClass}>Color</p>
              <div className="mt-3 flex gap-3">
                {types.map((type) => (
                  <Button
                    key={type}
                    type="button"
                    variant="ghost"
                    size="icon"
                    title={type}
                    aria-label={`${type} color`}
                    aria-pressed={draft.color === type}
                    className={`size-8 rounded-full border-2 ${draft.color === type ? 'border-foreground' : 'border-transparent'}`}
                    onClick={() => update('color', type)}
                  >
                    <span className={`flex size-5 items-center justify-center rounded-full ${colors[type]}`}>
                      {draft.color === type && <Check className="size-3 text-primary-foreground" />}
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            <label className={labelClass}>
              Custom Meeting Link <span className="font-normal normal-case">(optional)</span>
              <div className="mt-2 flex gap-2">
                <input
                  type="url"
                  className={`${fieldClass} mt-0 flex-1`}
                  placeholder="https://meet.google.com/..."
                  value={draft.meetingLink}
                  onChange={(e) => update('meetingLink', e.target.value)}
                />
                {isGoogleConnected && !draft.google_meet_link && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-0 h-11 shrink-0 gap-1.5 px-3 text-xs font-bold"
                    onClick={handleGenerateMeetLink}
                    disabled={meetLinkLoading}
                    title="Generate Google Meet link"
                  >
                    {meetLinkLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Video className="size-3.5" />}
                    {meetLinkLoading ? 'Creating...' : 'Create Meet'}
                  </Button>
                )}
              </div>
              {draft.google_meet_link && (
                <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-500">
                  <Check className="size-3.5" /> Google Meet link generated
                </div>
              )}
              {meetLinkError && (
                <p className="mt-2 text-xs text-destructive">{meetLinkError}</p>
              )}
            </label>

            <label className={labelClass}>
              Description
              <textarea
                rows={3}
                className={`${fieldClass} h-auto resize-y py-3`}
                placeholder="What is this meeting about?"
                value={draft.description}
                onChange={(e) => update('description', e.target.value)}
              />
            </label>

            <div className="border-t border-border pt-5">
              <p className={labelClass}>Reminders</p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                {reminderOptions.slice(0, 4).map((reminder) => {
                  const timeStr = calculateReminderDisplay(draft.date, draft.startTime, reminder)
                  const isChecked = draft.reminders.includes(reminder)
                  return (
                    <label key={reminder} className={`flex cursor-pointer items-center justify-between rounded-sm border p-2.5 text-xs transition-colors ${isChecked ? 'border-primary bg-primary/10 font-bold' : 'border-border hover:bg-secondary/50'}`}>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" className="size-4 accent-primary" checked={isChecked} onChange={() => toggleReminder(reminder)} />
                        <span>{reminder}</span>
                      </div>
                      {timeStr && <span className="text-[11px] font-extrabold text-primary shrink-0 ml-1">📩 {timeStr}</span>}
                    </label>
                  )
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {draft.reminders
                  .filter((reminder) => !reminderOptions.slice(0, 4).includes(reminder))
                  .map((reminder) => {
                    const timeStr = calculateReminderDisplay(draft.date, draft.startTime, reminder)
                    return (
                      <Button type="button" key={reminder} variant="secondary" size="sm" onClick={() => toggleReminder(reminder)} title={`Remove ${reminder}`}>
                        <X className="size-3" />
                        {reminder} {timeStr ? <span className="text-[10px] font-bold text-primary ml-1">(📩 {timeStr})</span> : null}
                      </Button>
                    )
                  })}
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-primary">
                <Plus className="size-3.5" />
                <span className="sr-only">Add reminder</span>
                <select aria-label="Add reminder" className="cursor-pointer bg-transparent outline-none" value="" onChange={(e) => { if (e.target.value) toggleReminder(e.target.value as Reminder) }}>
                  <option value="">Add custom reminder</option>
                  {reminderOptions.slice(4).filter((reminder) => !draft.reminders.includes(reminder)).map((reminder) => {
                    const timeStr = calculateReminderDisplay(draft.date, draft.startTime, reminder)
                    return (
                      <option key={reminder} value={reminder}>
                        {reminder} {timeStr ? `— (Sends at ${timeStr})` : ''}
                      </option>
                    )
                  })}
                </select>
              </label>
              <p className="mt-3 text-xs text-muted-foreground">Branded email reminders will be sent automatically at the exact calculated timestamps shown above.</p>
            </div>

            <div className="border-t border-border pt-5">
              <p className={labelClass}>Reminder Email Recipients</p>
              <p className="mt-1 text-xs text-muted-foreground">Add extra email addresses to receive reminders for this meeting.</p>
              <div className="mt-3 flex gap-2">
                <input
                  type="email"
                  className={`${fieldClass} mt-0 flex-1`}
                  placeholder="client@example.com"
                  value={newReminderEmail}
                  onChange={(e) => setNewReminderEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addReminderEmail() } }}
                />
                <Button type="button" variant="outline" className="mt-0 h-11 shrink-0 gap-1.5 px-3 text-xs font-bold" onClick={addReminderEmail}>
                  <Mail className="size-3.5" /> Add
                </Button>
              </div>
              {(draft.reminderEmails || []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(draft.reminderEmails || []).map((email) => (
                    <span key={email} className="flex items-center gap-1.5 border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium">
                      {email}
                      <button type="button" onClick={() => removeReminderEmail(email)} className="text-muted-foreground hover:text-destructive">
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-5">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                <Plus className="size-4" /> {isSubmitting ? 'Saving...' : mode === 'edit' ? 'Save changes' : 'Create meeting'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className={labelClass}>{label}</p>
      <p className="mt-2 text-sm font-medium leading-relaxed">{value}</p>
    </div>
  )
}
