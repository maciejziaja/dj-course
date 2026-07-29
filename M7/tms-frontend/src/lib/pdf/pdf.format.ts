export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function formatCurrency(
  amount: number | string,
  currency = 'USD',
  options: { maximumFractionDigits?: number } = {}
): string {
  const numeric = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, ...options }).format(numeric)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

export function humanize(value: string): string {
  return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

export function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '_')
}
