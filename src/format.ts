const numberFormatter = new Intl.NumberFormat('en-US')
const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
})
const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

export function formatCompact(value: number): string {
  return compactFormatter.format(value)
}

export function formatDate(value: string): string {
  return dateFormatter.format(toDate(value))
}

export function formatShortDate(value: string): string {
  return shortDateFormatter.format(toDate(value))
}

export function formatPercent(value: number, total: number): string {
  return `${(total === 0 ? 0 : (value / total) * 100).toFixed(1)}%`
}

export function formatDelta(value: number): string {
  if (value === 0) return '±0'
  // U+2212 so negative deltas line up with "+" in tabular figures.
  return `${value > 0 ? '+' : '−'}${formatNumber(Math.abs(value))}`
}
