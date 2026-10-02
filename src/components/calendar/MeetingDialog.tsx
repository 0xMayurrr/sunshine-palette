import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Pencil, Plus, Trash2, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Meeting, MeetingType, Reminder, reminderOptions, types, formatTime } from '@/lib/calendar'

type Props = { meeting: Meeting | null; mode: 'create' | 'view' | 'edit'; onClose: () => void; onSave: (meeting: Meeting) => void; onDelete: (id: string) => void; onDuplicate: (meeting: Meeting) => void; onEdit: () => void }
const colors: Record<MeetingType, string> = { 'Client Meeting': 'bg-client', 'Internal Meeting': 'bg-internal', 'Follow-up': 'bg-followup', Important: 'bg-important', Other: 'bg-other' }
const fieldClass = 'mt-2 h-11 w-full rounded-sm border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary'
const labelClass = 'block text-[11px] font-bold uppercase text-muted-foreground'

export function MeetingDialog({ meeting, mode, onClose, onSave, onDelete, onDuplicate, onEdit }: Props) {
  const [draft, setDraft] = useState<Meeting | null>(meeting)
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => { setDraft(meeting); setConfirmDelete(false) }, [meeting, mode])
  if (!meeting || !draft) return null
  const update = <K extends keyof Meeting>(key: K, value: Meeting[K]) => setDraft(current => current ? { ...current, [key]: value } : current)
  const toggleReminder = (reminder: Reminder) => update('reminders', draft.reminders.includes(reminder) ? draft.reminders.filter(r => r !== reminder) : [...draft.reminders, reminder])
  return <Dialog open={!!meeting} onOpenChange={open => { if (!open) onClose() }}><DialogContent className="max-h-[90vh] max-w-[560px] gap-0 overflow-y-auto rounded-sm border-border bg-card p-0 sm:max-w-[560px]">
    <DialogHeader className="border-b border-border px-6 py-5 text-left sm:px-8">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase text-primary"><span className="size-2 bg-primary" /> {mode === 'view' ? 'Meeting details' : mode === 'edit' ? 'Edit meeting' : 'New meeting'}</div>
      <DialogTitle className="pr-8 font-display text-2xl font-bold">{mode === 'view' ? draft.title : mode === 'edit' ? 'Update meeting' : 'Make room for what matters.'}</DialogTitle>
      <DialogDescription className="text-sm">{mode === 'view' ? 'Everything you need for this meeting.' : 'Add the details, then save it to your calendar.'}</DialogDescription>
    </DialogHeader>
    {mode === 'view' ? <div className="space-y-6 px-6 py-6 sm:px-8">
      <div className="grid grid-cols-2 gap-5 border-b border-border pb-6">
        <Detail label="Date" value={format(parseISO(draft.date), 'EEEE, MMMM d, yyyy')} />
        <Detail label="Time" value={`${formatTime(draft.startTime)} – ${formatTime(draft.endTime)}`} />
        <Detail label="Client / company" value={draft.client || '—'} />
        <div><p className={labelClass}>Meeting type</p><p className="mt-2 flex items-center gap-2 text-sm font-semibold"><span className={`size-2.5 ${colors[draft.color]}`} />{draft.type}</p></div>
      </div>
      <Detail label="Description" value={draft.description || 'No description added.'} />
      <div><p className={labelClass}>Meeting link</p>{draft.meetingLink ? <a href={draft.meetingLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 text-sm text-primary underline underline-offset-4">Open meeting link <ExternalLink className="size-3.5" /></a> : <p className="mt-2 text-sm text-muted-foreground">Google Meet link will be generated automatically in a future version.</p>}</div>
      <div><p className={labelClass}>Reminders</p><div className="mt-2 flex flex-wrap gap-2">{draft.reminders.length ? draft.reminders.map(r => <span key={r} className="border border-border bg-secondary px-2.5 py-1.5 text-xs">{r}</span>) : <span className="text-sm text-muted-foreground">No reminders set</span>}</div></div>
      {confirmDelete ? <div className="border border-destructive/30 bg-destructive/5 p-4"><p className="text-sm font-semibold">Delete this meeting?</p><p className="mt-1 text-xs text-muted-foreground">This action cannot be undone.</p><div className="mt-4 flex gap-2"><Button variant="destructive" size="sm" onClick={() => onDelete(draft.id)}>Delete meeting</Button><Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button></div></div> : <div className="flex flex-wrap gap-2 border-t border-border pt-5"><Button onClick={onEdit}><Pencil /> Edit</Button><Button variant="outline" onClick={() => onDuplicate(draft)}><Copy /> Duplicate</Button><Button variant="ghost" className="ml-auto text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}><Trash2 /> Delete</Button></div>}
    </div> : <form className="space-y-6 px-6 py-6 sm:px-8" onSubmit={e => { e.preventDefault(); if (draft.endTime <= draft.startTime) return; onSave(draft) }}>
      <div className="grid gap-4 sm:grid-cols-2"><label className={`${labelClass} sm:col-span-2`}>Meeting title *<input autoFocus required maxLength={100} className={fieldClass} placeholder="e.g. Client discovery call" value={draft.title} onChange={e => update('title', e.target.value)} /></label><label className={`${labelClass} sm:col-span-2`}>Client / company<input className={fieldClass} placeholder="e.g. Acme Technologies" value={draft.client} onChange={e => update('client', e.target.value)} /></label><label className={labelClass}>Date *<input required type="date" className={fieldClass} value={draft.date} onChange={e => update('date', e.target.value)} /></label><label className={labelClass}>Meeting type<select className={fieldClass} value={draft.type} onChange={e => { const type = e.target.value as MeetingType; setDraft(current => current ? { ...current, type, color: type } : current) }}>{types.map(type => <option key={type}>{type}</option>)}</select></label><label className={labelClass}>Start time<input required type="time" className={fieldClass} value={draft.startTime} onChange={e => update('startTime', e.target.value)} /></label><label className={labelClass}>End time<input required type="time" min={draft.startTime} className={fieldClass} value={draft.endTime} onChange={e => update('endTime', e.target.value)} /></label></div>
      {draft.endTime <= draft.startTime && <p className="text-xs text-destructive">End time must be after start time.</p>}
      <div><p className={labelClass}>Color</p><div className="mt-3 flex gap-3">{types.map(type => <Button key={type} type="button" variant="ghost" size="icon" title={type} aria-label={`${type} color`} aria-pressed={draft.color === type} className={`size-8 rounded-full border-2 ${draft.color === type ? 'border-foreground' : 'border-transparent'}`} onClick={() => update('color', type)}><span className={`flex size-5 items-center justify-center rounded-full ${colors[type]}`}>{draft.color === type && <Check className="size-3 text-primary-foreground" />}</span></Button>)}</div></div>
      <label className={labelClass}>Meeting link <span className="font-normal normal-case">(optional)</span><input type="url" className={fieldClass} placeholder="https://meet.google.com/..." value={draft.meetingLink} onChange={e => update('meetingLink', e.target.value)} /></label>
      <label className={labelClass}>Description<textarea rows={3} className={`${fieldClass} h-auto resize-y py-3`} placeholder="What is this meeting about?" value={draft.description} onChange={e => update('description', e.target.value)} /></label>
      <div className="border-t border-border pt-5"><p className={labelClass}>Reminders</p><div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">{reminderOptions.map(reminder => <label key={reminder} className="flex cursor-pointer items-center gap-2 text-xs sm:text-sm"><input type="checkbox" className="size-4 accent-primary" checked={draft.reminders.includes(reminder)} onChange={() => toggleReminder(reminder)} />{reminder}</label>)}</div><p className="mt-4 text-xs text-muted-foreground">Email reminders will be sent automatically in the production version.</p></div>
      <div className="flex justify-end gap-2 border-t border-border pt-5"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit"><Plus /> {mode === 'edit' ? 'Save changes' : 'Create meeting'}</Button></div>
    </form>}
  </DialogContent></Dialog>
}
function Detail({ label, value }: { label: string; value: string }) { return <div><p className={labelClass}>{label}</p><p className="mt-2 text-sm font-medium leading-relaxed">{value}</p></div> }
