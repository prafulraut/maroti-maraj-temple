import { Pipe, PipeTransform } from '@angular/core';

const LOCALES: Record<string, string> = { en: 'en-GB', hi: 'hi-IN', mr: 'mr-IN' };

/** Time-of-day words shown before the time, e.g. "संध्याकाळी ५:३०" (browsers often leave AM/PM in English). */
const DAY_PERIODS: Record<string, [number, string][]> = {
  // [starts at hour, word]
  mr: [[0, 'रात्री'], [4, 'पहाटे'], [6, 'सकाळी'], [12, 'दुपारी'], [16, 'संध्याकाळी'], [20, 'रात्री']],
  hi: [[0, 'रात'], [4, 'सुबह'], [12, 'दोपहर'], [16, 'शाम'], [20, 'रात']],
};

const FORMATS: Record<string, Intl.DateTimeFormatOptions> = {
  date: { day: '2-digit', month: 'short', year: 'numeric' },
  dateTime: { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true },
  time: { hour: 'numeric', minute: '2-digit', hour12: true },
};

/**
 * Formats a date in the current site language (Marathi/Hindi use Devanagari
 * digits and month names). Pass the language so the pipe re-runs on switch:
 *   {{ value | localDate:'date':translate.currentLang }}
 * kind 'time' also accepts a plain "5:30 PM" / "17:30" string.
 */
@Pipe({ name: 'localDate' })
export class LocalDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined, kind: 'date' | 'dateTime' | 'time' = 'date', lang?: string): string {
    if (!value) return '';
    const date = kind === 'time' && typeof value === 'string' ? parseTime(value) : new Date(value);
    if (!date || isNaN(date.getTime())) return String(value);
    try {
      const periods = DAY_PERIODS[lang || ''];
      if (periods && kind !== 'date') {
        // Format without AM/PM, then put the local time-of-day word before the time
        const opts: Intl.DateTimeFormatOptions = { ...FORMATS[kind], hour12: true };
        const parts = new Intl.DateTimeFormat(LOCALES[lang!], opts).formatToParts(date);
        const word = [...periods].reverse().find(([h]) => date.getHours() >= h)![1];
        const out: string[] = [];
        for (const p of parts) {
          if (p.type === 'dayPeriod') continue;
          if (p.type === 'hour') out.push(word + ' ');
          out.push(p.value);
        }
        return out.join('').replace(/\s+/g, ' ').trim();
      }
      return new Intl.DateTimeFormat(LOCALES[lang || 'en'] || 'en-GB', FORMATS[kind]).format(date);
    } catch {
      return String(value);
    }
  }
}

/** "5:30 PM", "5 pm", "17:30" → a Date on today with that time (null if not a time). */
function parseTime(text: string): Date | null {
  const m = /^\s*(\d{1,2})(?:[:.](\d{2}))?\s*([ap]\.?m\.?)?\s*$/i.exec(text);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3]?.toLowerCase().replace(/\./g, '');
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d;
}
