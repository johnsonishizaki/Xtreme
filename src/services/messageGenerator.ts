import { DutyAssignment } from '../types';

/**
 * Formats date into a clean human readable format, e.g. "21 September 2026"
 */
export function formatDutyDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
  } catch {}
  return dateStr;
}

/**
 * Builds the prepared announcement text from template and assignment data
 */
export function generateAnnouncementMessage(
  template: string,
  assignment: DutyAssignment
): string {
  const teachers = assignment.teachers || [];
  let teachersText = '';

  if (teachers.length === 0) {
    teachersText = 'Pending teacher assignment';
  } else if (teachers.length === 1) {
    const t = teachers[0];
    teachersText = t.name;
  } else {
    teachersText = teachers
      .map((t, idx) => {
        return `${idx + 1}. ${t.name}`;
      })
      .join('\n');
  }

  const startDateFormatted = formatDutyDate(assignment.startDate);
  const endDateFormatted = formatDutyDate(assignment.endDate);
  const weekText = assignment.weekLabel || `${startDateFormatted} - ${endDateFormatted}`;
  const dutyText = assignment.dutyTitle || 'Weekly Duty';

  return template
    .replace(/{TEACHERS}/g, teachersText)
    .replace(/{START_DATE}/g, startDateFormatted)
    .replace(/{END_DATE}/g, endDateFormatted)
    .replace(/{WEEK}/g, weekText)
    .replace(/{DUTY}/g, dutyText);
}

/**
 * Robust clipboard copy optimized for iPhone iOS Safari and all modern browsers
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // Try modern navigator.clipboard
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard failed, attempting fallback', err);
    }
  }

  // Fallback using textarea execCommand (essential for iOS Safari in specific iframe or gesture cases)
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    // iOS specific selection range
    textArea.setSelectionRange(0, 99999);

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback clipboard copy failed', err);
    return false;
  }
}

/**
 * Generates WhatsApp launch URL
 * On mobile/iPhone: whatsapp:// protocol triggers native WhatsApp app directly
 * Web fallback: https://api.whatsapp.com/send?text=
 */
export function openWhatsApp(message: string, behavior: 'app' | 'web' | 'prompt' = 'app'): void {
  const encoded = encodeURIComponent(message);
  
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(navigator.userAgent);

  if (behavior === 'web') {
    window.location.href = `https://api.whatsapp.com/send?text=${encoded}`;
    return;
  }

  if (isIOS || isAndroid || behavior === 'app') {
    // Attempt deep link scheme
    const deepLink = `whatsapp://send?text=${encoded}`;
    window.location.href = deepLink;

    // Timeout fallback if app isn't installed or doesn't respond
    setTimeout(() => {
      // If user is still on this screen after 1.5s, offer web link
      console.log('WhatsApp deep link invoked');
    }, 1500);
  } else {
    // Desktop browser default
    window.location.href = `https://api.whatsapp.com/send?text=${encoded}`;
  }
}
