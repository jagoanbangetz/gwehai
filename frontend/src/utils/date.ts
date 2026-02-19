/**
 * Default app timezone: GMT+8 (Asia/Singapore).
 * Use these helpers so all displayed dates are consistent.
 */
export const DEFAULT_TIMEZONE = 'Asia/Singapore';

const dateTimeOptions: Intl.DateTimeFormatOptions = {
  timeZone: DEFAULT_TIMEZONE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

const dateOnlyOptions: Intl.DateTimeFormatOptions = {
  timeZone: DEFAULT_TIMEZONE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

const timeOnlyOptions: Intl.DateTimeFormatOptions = {
  timeZone: DEFAULT_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

/**
 * Format an ISO date string or Date for display in GMT+8 (date + time).
 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (value == null) return '—';
  try {
    const d = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-SG', dateTimeOptions);
  } catch {
    return '—';
  }
}

/**
 * Format an ISO date string or Date for display in GMT+8 (date only).
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (value == null) return '—';
  try {
    const d = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-SG', dateOnlyOptions);
  } catch {
    return '—';
  }
}

/**
 * Format an ISO date string or Date for display in GMT+8 (time only).
 */
export function formatTime(value: string | Date | null | undefined): string {
  if (value == null) return '—';
  try {
    const d = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-SG', timeOnlyOptions);
  } catch {
    return '—';
  }
}
