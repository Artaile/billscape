import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DateRangeFilterProps {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  className?: string
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function toISODate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseISODate(s: string): Date | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function formatDisplay(s: string) {
  const d = parseISODate(s)
  if (!d) return null
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function isSameDate(a: Date | null, b: Date | null) {
  if (!a || !b) return false
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function isInRange(d: Date, from: Date | null, to: Date | null) {
  if (!from || !to) return false
  const t = d.getTime()
  return t > from.getTime() && t < to.getTime()
}

function CalendarGrid({
  viewDate,
  onPrevMonth,
  onNextMonth,
  from,
  to,
  selecting,
  onPick,
}: {
  viewDate: Date
  onPrevMonth: () => void
  onNextMonth: () => void
  from: Date | null
  to: Date | null
  selecting: 'from' | 'to'
  onPick: (d: Date) => void
}) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstWeekday = startOfMonth(viewDate).getDay()
  const totalDays = daysInMonth(year, month)
  const today = new Date()

  const cells: (Date | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, month, d))

  return (
    <div className="w-64">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={onPrevMonth}
          className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-xs font-semibold text-zinc-200">
          {new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(viewDate)}
        </span>
        <button
          type="button"
          onClick={onNextMonth}
          className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {DAY_LABELS.map((l, i) => (
          <div key={i} className="flex items-center justify-center text-[10px] text-zinc-500 h-6">
            {l}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const isFrom = isSameDate(d, from)
          const isTo = isSameDate(d, to)
          const isToday = isSameDate(d, today)
          const inRange = isInRange(d, from, to)
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(d)}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors mx-auto',
                isFrom || isTo
                  ? 'bg-indigo-600 text-white font-semibold'
                  : inRange
                    ? 'bg-indigo-600/15 text-indigo-200'
                    : 'text-zinc-300 hover:bg-zinc-800',
                isToday && !isFrom && !isTo && 'ring-1 ring-indigo-500/60',
              )}
              title={selecting === 'from' ? 'Set from date' : 'Set to date'}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function DateRangeFilter({ from, to, onChange, className }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false)
  const [selecting, setSelecting] = useState<'from' | 'to'>('from')
  const [viewDate, setViewDate] = useState(() => parseISODate(from) ?? new Date())
  const containerRef = useRef<HTMLDivElement>(null)

  const fromDate = useMemo(() => parseISODate(from), [from])
  const toDate = useMemo(() => parseISODate(to), [to])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Reset the "from"/"to" selection step only when the panel is freshly opened —
  // must NOT depend on fromDate/toDate, since picking a date updates those and would
  // otherwise stomp the setSelecting('to') call that just happened in handlePick.
  useEffect(() => {
    if (open) {
      setViewDate(parseISODate(from) ?? new Date())
      setSelecting('from')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handlePick = (d: Date) => {
    const iso = toISODate(d)
    if (selecting === 'from') {
      // If picking a "from" date after the current "to", reset "to" as well
      if (toDate && d.getTime() > toDate.getTime()) {
        onChange(iso, iso)
      } else {
        onChange(iso, to)
      }
      setSelecting('to')
    } else {
      if (fromDate && d.getTime() < fromDate.getTime()) {
        onChange(iso, iso)
        setSelecting('to')
      } else {
        onChange(from, iso)
        setOpen(false)
      }
    }
  }

  const applyPreset = (days: number) => {
    const toD = new Date()
    const fromD = new Date()
    fromD.setDate(fromD.getDate() - days)
    onChange(toISODate(fromD), toISODate(toD))
    setOpen(false)
  }

  const clear = () => {
    onChange('', '')
    setOpen(false)
  }

  const label = from || to
    ? `${formatDisplay(from) ?? 'Any'} → ${formatDisplay(to) ?? 'Any'}`
    : 'All dates'

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm transition-colors hover:border-zinc-600',
          from || to ? 'text-zinc-100' : 'text-zinc-500',
        )}
      >
        <Calendar className="h-4 w-4 shrink-0 text-zinc-500" />
        <span className="whitespace-nowrap">{label}</span>
        {(from || to) && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              clear()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                clear()
              }
            }}
            className="ml-1 rounded p-0.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            aria-label="Clear date range"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 z-50 mt-1.5 rounded-lg border border-zinc-700 bg-popover p-3 shadow-xl">
          <div className="flex gap-1.5 mb-3">
            {[
              { label: 'Today', days: 0 },
              { label: '7D', days: 7 },
              { label: '30D', days: 30 },
              { label: '90D', days: 90 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.days)}
                className="rounded-md border border-zinc-700 bg-zinc-800/60 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={clear}
              className="ml-auto rounded-md px-2.5 py-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              Clear
            </button>
          </div>

          <div className="flex items-center justify-center gap-1 mb-2 text-[11px]">
            <button
              type="button"
              onClick={() => setSelecting('from')}
              className={cn(
                'rounded px-2 py-1 transition-colors',
                selecting === 'from' ? 'bg-indigo-600/20 text-indigo-300 font-medium' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              From: {formatDisplay(from) ?? 'Select'}
            </button>
            <span className="text-zinc-600">—</span>
            <button
              type="button"
              onClick={() => setSelecting('to')}
              className={cn(
                'rounded px-2 py-1 transition-colors',
                selecting === 'to' ? 'bg-indigo-600/20 text-indigo-300 font-medium' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              To: {formatDisplay(to) ?? 'Select'}
            </button>
          </div>

          <CalendarGrid
            viewDate={viewDate}
            onPrevMonth={() => setViewDate((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
            onNextMonth={() => setViewDate((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
            from={fromDate}
            to={toDate}
            selecting={selecting}
            onPick={handlePick}
          />
        </div>
      )}
    </div>
  )
}
