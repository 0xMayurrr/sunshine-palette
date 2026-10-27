import { useMemo, useState } from 'react'
import {
  parseISO,
  format,
  subDays,
  subMonths,
  startOfMonth,
  endOfMonth,
  isAfter,
  isBefore,
} from 'date-fns'
import {
  CalendarDays,
  Clock3,
  Plus,
  Search,
  User,
  Video,
  X,
  ChevronRight,
  Filter,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  categoryThemes,
  formatMinutes,
  formatTime,
  calculateDuration,
  getMeetingDurationMinutes,
  Meeting,
  MeetingType,
} from '@/lib/calendar'

type TimeRangeFilter = 'all' | '1m' | '3m' | 'this_month'
type GraphDimension = 'client' | 'category' | 'period'
type RankMetric = 'count' | 'hours'

interface TotalMeetingsSectionProps {
  meetings: Meeting[]
  onOpen: (meeting: Meeting) => void
  onCreate: () => void
}

interface RankedItem {
  id: string
  label: string
  sublabel?: string | undefined
  totalCount: number
  activeCount: number // scheduled + completed
  cancelledCount: number
  totalMinutes: number
  avgMinutes: number
  completionRate: number
  googleMeetCount: number
}

export function TotalMeetingsSection({
  meetings,
  onOpen,
  onCreate,
}: TotalMeetingsSectionProps) {
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>('all')
  const [dimension, setDimension] = useState<GraphDimension>('client')
  const [rankMetric, setRankMetric] = useState<RankMetric>('count')
  const [minSessions, setMinSessions] = useState<number>(1)
  const [hoveredItem, setHoveredItem] = useState<RankedItem | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<MeetingType | 'All'>('All')
  const [selectedStatus, setSelectedStatus] = useState<'All' | 'scheduled' | 'completed' | 'cancelled'>('All')

  const now = useMemo(() => new Date(), [])

  // Range definition
  const rangeInfo = useMemo(() => {
    switch (timeRange) {
      case '1m': {
        const from = subDays(now, 30)
        return {
          from,
          to: now,
          label: 'Last 1 month',
          dateText: `${format(from, 'MMM d, yyyy')} — ${format(now, 'MMM d, yyyy')}`,
        }
      }
      case '3m': {
        const from = subMonths(now, 3)
        return {
          from,
          to: now,
          label: 'Last 3 months',
          dateText: `${format(from, 'MMM d, yyyy')} — ${format(now, 'MMM d, yyyy')}`,
        }
      }
      case 'this_month': {
        const from = startOfMonth(now)
        const to = endOfMonth(now)
        return {
          from,
          to,
          label: 'This month',
          dateText: format(from, 'MMMM yyyy'),
        }
      }
      case 'all':
      default:
        return {
          from: null,
          to: null,
          label: 'All time',
          dateText: `${meetings.length} total recorded`,
        }
    }
  }, [timeRange, now, meetings.length])

  // Filter meetings by the chosen time range
  const rangeMeetings = useMemo(() => {
    return meetings.filter((m) => {
      if (!m.date) return false
      try {
        const mDate = parseISO(m.date)
        if (rangeInfo.from && isBefore(mDate, rangeInfo.from)) return false
        if (rangeInfo.to && isAfter(mDate, rangeInfo.to)) return false
        return true
      } catch {
        return false
      }
    })
  }, [meetings, rangeInfo])

  // Key stats
  const totalCount = rangeMeetings.length
  const allTimeCount = meetings.length

  const totalMinutes = useMemo(() => {
    return rangeMeetings.reduce((acc, m) => {
      return acc + getMeetingDurationMinutes(m.startTime, m.endTime)
    }, 0)
  }, [rangeMeetings])

  // Status breakdown
  const statusStats = useMemo(() => {
    let scheduled = 0
    let completed = 0
    let cancelled = 0

    rangeMeetings.forEach((m) => {
      const status = m.status || 'scheduled'
      if (status === 'completed') completed++
      else if (status === 'cancelled') cancelled++
      else scheduled++
    })

    return { scheduled, completed, cancelled }
  }, [rangeMeetings])

  const completionRate = totalCount > 0 ? Math.round(((statusStats.scheduled + statusStats.completed) / totalCount) * 100) : 100

  // TradesViz-style Ranked Items Calculation based on Dimension
  const rankedItems = useMemo<RankedItem[]>(() => {
    const map = new Map<string, { label: string; sublabel?: string; meetings: Meeting[] }>()

    if (dimension === 'client') {
      rangeMeetings.forEach((m) => {
        const key = m.client?.trim() || 'Internal / General'
        if (!map.has(key)) {
          map.set(key, { label: key, sublabel: 'Client Account', meetings: [] })
        }
        map.get(key)!.meetings.push(m)
      })
    } else if (dimension === 'category') {
      rangeMeetings.forEach((m) => {
        const key = m.type || 'Other'
        if (!map.has(key)) {
          map.set(key, { label: key, sublabel: 'Category', meetings: [] })
        }
        map.get(key)!.meetings.push(m)
      })
    } else {
      // Dimension: period (by month or week)
      rangeMeetings.forEach((m) => {
        const key = m.date.slice(0, 7) // 'YYYY-MM'
        if (!map.has(key)) {
          let label = key
          try {
            label = format(parseISO(`${key}-01`), 'MMMM yyyy')
          } catch {
            // fallback
          }
          map.set(key, { label, sublabel: 'Timeline Period', meetings: [] })
        }
        map.get(key)!.meetings.push(m)
      })
    }

    const items: RankedItem[] = []
    map.forEach((val, id) => {
      const ms = val.meetings
      const total = ms.length
      if (total < minSessions) return

      let active = 0
      let cancelled = 0
      let minutes = 0
      let googleMeet = 0
      let completed = 0

      ms.forEach((m) => {
        const dur = getMeetingDurationMinutes(m.startTime, m.endTime)
        minutes += dur
        if (m.status === 'cancelled') {
          cancelled++
        } else {
          active++
          if (m.status === 'completed') completed++
        }
        if (m.google_meet_link || m.meetingLink) googleMeet++
      })

      const avg = total > 0 ? Math.round(minutes / total) : 0
      const compRate = total > 0 ? Math.round((active / total) * 100) : 100

      items.push({
        id,
        label: val.label,
        sublabel: val.sublabel,
        totalCount: total,
        activeCount: active,
        cancelledCount: cancelled,
        totalMinutes: minutes,
        avgMinutes: avg,
        completionRate: compRate,
        googleMeetCount: googleMeet,
      })
    })

    // Sort according to rankMetric
    items.sort((a, b) => {
      if (rankMetric === 'hours') {
        return b.totalMinutes - a.totalMinutes
      }
      return b.activeCount - a.activeCount
    })

    return items
  }, [rangeMeetings, dimension, rankMetric, minSessions])

  // Max value for horizontal bar scaling
  const maxBarValue = useMemo(() => {
    if (rankedItems.length === 0) return 1
    if (rankMetric === 'hours') {
      return Math.max(...rankedItems.map((i) => i.totalMinutes), 60)
    }
    return Math.max(...rankedItems.map((i) => Math.max(i.activeCount, i.cancelledCount)), 1)
  }, [rankedItems, rankMetric])

  // Top focus client
  const topFocus = useMemo(() => {
    if (rankedItems.length === 0) return null
    return rankedItems[0]
  }, [rankedItems])

  // Worst cancelled item
  const worstCancelled = useMemo(() => {
    const sorted = [...rankedItems].sort((a, b) => b.cancelledCount - a.cancelledCount)
    if (sorted[0] && sorted[0].cancelledCount > 0) return sorted[0]
    return null
  }, [rankedItems])

  // Filtered meetings list for table
  const displayedMeetings = useMemo(() => {
    return rangeMeetings
      .filter((m) => {
        if (selectedCategory !== 'All' && m.type !== selectedCategory) return false
        if (selectedStatus !== 'All' && (m.status || 'scheduled') !== selectedStatus) return false
        if (!searchQuery.trim()) return true
        const q = searchQuery.toLowerCase()
        return (
          m.title.toLowerCase().includes(q) ||
          m.client?.toLowerCase().includes(q) ||
          m.description?.toLowerCase().includes(q) ||
          m.type.toLowerCase().includes(q) ||
          m.date.includes(q)
        )
      })
      .sort((a, b) => `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`))
  }, [rangeMeetings, selectedCategory, selectedStatus, searchQuery])

  return (
    <div className="mx-auto max-w-[1700px] px-4 pb-16 pt-6 sm:px-8 lg:px-10 lg:pt-8 font-sans">
      {/* HEADER BAR */}
      <div className="border-b border-border pb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Total Meetings
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Performance, duration, and classification breakdown across your workspace.
            </p>
          </div>

          {/* Right Top Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Timeframe pill selector */}
            <div className="inline-flex items-center rounded border border-border bg-card p-0.5 shadow-2xs">
              {(
                [
                  { id: 'all', label: 'All time' },
                  { id: '1m', label: 'Last 1 month' },
                  { id: '3m', label: 'Last 3 months' },
                  { id: 'this_month', label: 'This month' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTimeRange(item.id)}
                  className={`rounded-xs px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    timeRange === item.id
                      ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <Button
              onClick={onCreate}
              className="h-8 gap-1.5 rounded-sm px-3 text-xs font-semibold shadow-none"
            >
              <Plus className="size-3.5" />
              <span>New meeting</span>
            </Button>
          </div>
        </div>
      </div>

      {/* TRADESVIZ STYLE TOP STAT TILES (5 Tiles Row) */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Tile 1 */}
        <div className="rounded border border-border/80 bg-card p-3 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Meetings in Filter
          </p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-display text-2xl font-bold text-foreground">
              {totalCount}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {allTimeCount} all-time placed
          </p>
        </div>

        {/* Tile 2 */}
        <div className="rounded border border-border/80 bg-card p-3 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Top Focus
          </p>
          <div className="mt-1 truncate">
            <span className="font-display text-lg font-bold text-emerald-600 dark:text-emerald-400 truncate block">
              {topFocus ? topFocus.label : 'None'}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground truncate">
            {topFocus ? `${topFocus.activeCount} meetings · ${formatMinutes(topFocus.totalMinutes)}` : 'No data'}
          </p>
        </div>

        {/* Tile 3 */}
        <div className="rounded border border-border/80 bg-card p-3 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Cancelled / Dropped
          </p>
          <div className="mt-1">
            <span className="font-display text-2xl font-bold text-rose-600 dark:text-rose-400">
              {statusStats.cancelled}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground truncate">
            {worstCancelled ? `${worstCancelled.label} (${worstCancelled.cancelledCount})` : '0 cancellations'}
          </p>
        </div>

        {/* Tile 4 */}
        <div className="rounded border border-border/80 bg-card p-3 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Completion Rate
          </p>
          <div className="mt-1">
            <span className="font-display text-2xl font-bold text-foreground">
              {completionRate}%
            </span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {statusStats.scheduled + statusStats.completed} active sessions
          </p>
        </div>

        {/* Tile 5 */}
        <div className="rounded border border-border/80 bg-card p-3 shadow-2xs col-span-2 sm:col-span-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Total Time Spent
          </p>
          <div className="mt-1">
            <span className="font-display text-2xl font-bold text-foreground">
              {formatMinutes(totalMinutes)}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Avg {totalCount > 0 ? `~${Math.round(totalMinutes / totalCount)}m` : '0m'} / session
          </p>
        </div>
      </div>

      {/* TRADESVIZ STYLE RANKING GRAPH CARD */}
      <div className="mt-6 rounded-lg border border-border bg-panel/90 p-5 sm:p-6 shadow-xs relative">
        {/* Graph Header with Controls (exactly like TradesViz) */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-4">
          <div>
            <h2 className="font-display text-base font-bold text-foreground">
              {dimension === 'client' ? 'Client Ranking' : dimension === 'category' ? 'Category Ranking' : 'Timeline Volume Ranking'}
            </h2>
            <p className="text-xs text-muted-foreground">
              Sorted by {rankMetric === 'count' ? 'placed meetings' : 'total duration'}; horizontal divergence shows active vs cancelled sessions.
            </p>
          </div>

          {/* Controls: Segmented Dimension + Rank By + Min Sessions */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Dimension tabs: Symbol / Sector / Industry in TradesViz -> Client / Category / Timeline */}
            <div className="inline-flex items-center rounded border border-border bg-secondary/50 p-0.5">
              {(
                [
                  { id: 'client', label: 'Client' },
                  { id: 'category', label: 'Category' },
                  { id: 'period', label: 'Timeline' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDimension(tab.id)}
                  className={`rounded-xs px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                    dimension === tab.id
                      ? 'bg-card text-foreground font-semibold shadow-2xs border border-border/80'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Rank By Select */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Rank by:</span>
              <select
                value={rankMetric}
                onChange={(e) => setRankMetric(e.target.value as RankMetric)}
                className="h-8 rounded border border-border bg-card px-2.5 text-xs text-foreground focus:outline-hidden cursor-pointer"
              >
                <option value="count">Total Meetings</option>
                <option value="hours">Total Duration</option>
              </select>
            </div>

            {/* Min Sessions Select */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Min:</span>
              <select
                value={minSessions}
                onChange={(e) => setMinSessions(Number(e.target.value))}
                className="h-8 rounded border border-border bg-card px-2 text-xs text-foreground focus:outline-hidden cursor-pointer"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </div>
          </div>
        </div>

        {/* TRADESVIZ HORIZONTAL RANKED BAR CHART */}
        <div className="mt-6 relative">
          {rankedItems.length > 0 ? (
            <div className="space-y-2 relative">
              {rankedItems.map((item) => {
                const activeVal = rankMetric === 'hours' ? item.totalMinutes : item.activeCount
                const cancelledVal = rankMetric === 'hours' ? Math.round(item.totalMinutes * (item.cancelledCount / (item.totalCount || 1))) : item.cancelledCount

                const activeWidthPct = Math.max(Math.round((activeVal / maxBarValue) * 100), item.activeCount > 0 ? 4 : 0)
                const cancelledWidthPct = Math.max(Math.round((cancelledVal / maxBarValue) * 100), item.cancelledCount > 0 ? 4 : 0)

                return (
                  <div
                    key={item.id}
                    onMouseEnter={(e) => {
                      setHoveredItem(item)
                      const rect = e.currentTarget.getBoundingClientRect()
                      setTooltipPos({ x: rect.right - 280, y: rect.top - 10 })
                    }}
                    onMouseLeave={() => {
                      setHoveredItem(null)
                      setTooltipPos(null)
                    }}
                    className="group relative flex items-center h-8 py-1 px-2 rounded-xs hover:bg-secondary/60 transition-colors cursor-pointer"
                  >
                    {/* Left: Label (like GOOGL / BABA in TradesViz) */}
                    <div className="w-28 sm:w-36 shrink-0 text-right pr-3 truncate font-mono text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      {item.label}
                    </div>

                    {/* Middle: Bidirectional Bar Area with Vertical Baseline Divider */}
                    <div className="flex-1 flex items-center h-full relative border-l-2 border-border/80 pl-2 bg-secondary/25 rounded-r-xs">
                      {/* Active / Scheduled / Completed Bar (Green / Emerald in TradesViz) */}
                      {item.activeCount > 0 && (
                        <div className="flex items-center gap-2 max-w-[80%]">
                          <div
                            style={{ width: `${activeWidthPct}%` }}
                            className="h-5 min-w-[12px] rounded-r-xs bg-emerald-600 hover:bg-emerald-500 transition-all duration-300 shadow-2xs"
                          />
                          <span className="font-mono text-xs font-bold text-foreground shrink-0">
                            {rankMetric === 'hours'
                              ? formatMinutes(item.totalMinutes)
                              : `${item.activeCount} ${item.activeCount === 1 ? 'meeting' : 'meetings'}`}
                          </span>
                        </div>
                      )}

                      {/* Cancelled Bar (Red / Coral in TradesViz) */}
                      {item.cancelledCount > 0 && (
                        <div className="ml-auto flex items-center gap-1.5 shrink-0 pl-2">
                          <div
                            style={{ width: `${cancelledWidthPct}%` }}
                            className="h-5 min-w-[8px] max-w-[60px] rounded-l-xs bg-rose-600 hover:bg-rose-500 transition-all duration-300 shadow-2xs"
                          />
                          <span className="font-mono text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                            -{item.cancelledCount} dropped
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="py-12 text-center">
              <CalendarDays className="mx-auto size-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs font-semibold text-foreground">No meetings match this classification</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Try adjusting the minimum sessions filter or selected timeframe.
              </p>
            </div>
          )}

          {/* FLOATING HOVER TOOLTIP (Exact Replica of TradesViz screenshot card) */}
          {hoveredItem && tooltipPos && (
            <div
              style={{
                position: 'fixed',
                left: `${Math.min(tooltipPos.x, window.innerWidth - 300)}px`,
                top: `${Math.max(tooltipPos.y, 80)}px`,
                zIndex: 60,
              }}
              className="pointer-events-none w-64 rounded-md border border-border bg-card p-3.5 shadow-xl animate-in fade-in zoom-in-95 duration-100"
            >
              <div className="border-b border-border/80 pb-2 mb-2">
                <span className="font-display text-sm font-bold text-foreground block truncate">
                  {hoveredItem.label}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {hoveredItem.sublabel || 'Analytics Record'}
                </span>
              </div>

              <div className="space-y-1.5 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Meetings:</span>
                  <span className="font-bold text-foreground">{hoveredItem.totalCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Active Placed:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{hoveredItem.activeCount}</span>
                </div>
                {hoveredItem.cancelledCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cancelled:</span>
                    <span className="font-bold text-rose-600 dark:text-rose-400">-{hoveredItem.cancelledCount}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Time:</span>
                  <span className="font-bold text-foreground">{formatMinutes(hoveredItem.totalMinutes)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg / Meeting:</span>
                  <span className="font-bold text-foreground">~{hoveredItem.avgMinutes}m</span>
                </div>
                <div className="flex justify-between border-t border-border/60 pt-1.5 mt-1.5">
                  <span className="text-muted-foreground">Completion Rate:</span>
                  <span className="font-bold text-foreground">{hoveredItem.completionRate}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Google Meet:</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">{hoveredItem.googleMeetCount} sessions</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MEETINGS LOG LIST */}
      <div className="mt-8 rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-4">
          <div>
            <h3 className="text-base font-bold text-foreground">
              Meetings Log ({displayedMeetings.length})
            </h3>
            <p className="text-xs text-muted-foreground">
              Click any row to open meeting details and agenda.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] sm:min-w-[240px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search meetings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-full rounded-md border border-border bg-secondary/30 pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground focus:border-primary focus:outline-hidden cursor-pointer"
            >
              <option value="All">All statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Meetings List */}
        <div className="mt-2 divide-y divide-border/60">
          {displayedMeetings.length > 0 ? (
            displayedMeetings.map((meeting) => {
              const theme = categoryThemes[meeting.color || meeting.type] || categoryThemes['Client Meeting']
              const duration = calculateDuration(meeting.startTime, meeting.endTime)
              const isCancelled = meeting.status === 'cancelled'
              const isCompleted = meeting.status === 'completed'

              return (
                <div
                  key={meeting.id}
                  onClick={() => onOpen(meeting)}
                  className="group flex flex-col md:flex-row md:items-center justify-between gap-3 py-3 px-2 hover:bg-secondary/40 rounded-md transition-colors cursor-pointer"
                >
                  {/* Left: Date, Time & Title */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="flex flex-col items-center justify-center rounded border border-border/80 bg-secondary/60 px-2 py-1 shrink-0 text-center min-w-[50px]">
                      <span className="text-[9px] font-bold uppercase text-muted-foreground">
                        {format(parseISO(meeting.date), 'MMM')}
                      </span>
                      <span className="font-mono text-sm font-bold text-foreground leading-none">
                        {format(parseISO(meeting.date), 'd')}
                      </span>
                    </div>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4
                          className={`text-xs sm:text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate max-w-md ${
                            isCancelled ? 'line-through opacity-60' : ''
                          }`}
                        >
                          {meeting.title}
                        </h4>
                        <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.2 text-[10px] font-medium ${theme.badge}`}>
                          <span className={`size-1.5 rounded-full ${theme.dot}`} />
                          {meeting.type}
                        </span>
                        {isCompleted && (
                          <span className="rounded bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                            Completed
                          </span>
                        )}
                        {isCancelled && (
                          <span className="rounded bg-destructive/10 px-1.5 py-0.2 text-[9px] font-medium text-destructive">
                            Cancelled
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground font-mono">
                        <span>
                          {formatTime(meeting.startTime)} – {formatTime(meeting.endTime)}
                          {duration && <span className="ml-1 text-muted-foreground">({duration})</span>}
                        </span>
                        {meeting.client && (
                          <span className="flex items-center gap-1 font-sans text-foreground/90 font-medium">
                            <User className="size-3 text-muted-foreground" />
                            {meeting.client}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Meet Link & Details */}
                  <div className="flex items-center gap-2 md:self-center shrink-0 pl-12 md:pl-0">
                    {meeting.google_meet_link && (
                      <a
                        href={meeting.google_meet_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors"
                      >
                        <Video className="size-3" />
                        Meet
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs font-medium text-muted-foreground group-hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpen(meeting)
                      }}
                    >
                      <span>View</span>
                      <ChevronRight className="size-3 ml-0.5" />
                    </Button>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="py-12 text-center">
              <CalendarDays className="mx-auto size-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs font-semibold text-foreground">No meetings found</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                No meetings match the selected timeframe ({rangeInfo.label}).
              </p>
              <div className="mt-3 flex justify-center gap-2">
                {(selectedCategory !== 'All' || selectedStatus !== 'All' || searchQuery) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => {
                      setSelectedCategory('All')
                      setSelectedStatus('All')
                      setSearchQuery('')
                    }}
                  >
                    Reset filters
                  </Button>
                )}
                <Button size="sm" className="gap-1 text-xs h-8" onClick={onCreate}>
                  <Plus className="size-3" /> Schedule meeting
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
