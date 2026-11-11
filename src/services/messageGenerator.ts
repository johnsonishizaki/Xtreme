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
/**
 * Generates WhatsApp launch URL
 * Supports optional phone number for direct messaging to houseparents or groups
 * On mobile/iPhone: whatsapp:// protocol triggers native WhatsApp app directly
 * Web fallback: https://api.whatsapp.com/send?text=
 */
export function openWhatsApp(
  message: string,
  behavior: 'app' | 'web' | 'prompt' = 'app',
  phoneNumber?: string
): void {
  const encoded = encodeURIComponent(message);
  const cleanPhone = phoneNumber ? phoneNumber.replace(/[^0-9]/g, '') : '';
  const phoneParam = cleanPhone ? `phone=${cleanPhone}&` : '';

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(navigator.userAgent);

  if (behavior === 'web') {
    window.location.href = `https://api.whatsapp.com/send?${phoneParam}text=${encoded}`;
    return;
  }

  if (isIOS || isAndroid || behavior === 'app') {
    // Attempt deep link scheme
    const deepLink = cleanPhone
      ? `whatsapp://send?phone=${cleanPhone}&text=${encoded}`
      : `whatsapp://send?text=${encoded}`;
    window.location.href = deepLink;

    // Timeout fallback if app isn't installed or doesn't respond
    setTimeout(() => {
      console.log('WhatsApp deep link invoked');
    }, 1500);
  } else {
    // Desktop browser default
    window.location.href = `https://api.whatsapp.com/send?${phoneParam}text=${encoded}`;
  }
}

/**
 * Generates WhatsApp message requesting a houseparent to submit their student count
 */
export function generateHouseRequestWhatsAppMessage(
  house: { id: string; name: string; category: string; expectedStudentCount: number; assignedHouseparent: string },
  dateStr: string,
  formUrl: string
): string {
  const formattedDate = formatDutyDate(dateStr) || dateStr;
  return `📋 *HOUSEPARENT DAILY REPORT REQUEST*
🏫 *House:* ${house.name} (${house.category})
👤 *Houseparent:* ${house.assignedHouseparent}
📅 *Reporting Date:* ${formattedDate}
🎯 *Expected Students:* ${house.expectedStudentCount}

Dear Houseparent, please submit your *Number of Students Reporting* for today using this direct form:
👉 ${formUrl}

*(Only number of students reporting is required. Missing count is calculated automatically).*

Thank you,
*Senior Houseparent (Xtreme)*`;
}

/**
 * Generates WhatsApp message summarizing a single house's report status
 */
export function generateHouseStatusWhatsAppMessage(
  house: { id: string; name: string; category: string; expectedStudentCount: number; assignedHouseparent: string },
  report: { reportedCount: number; expectedCount?: number; notReportedCount: number; notReportedDetails?: string; updatedAt?: string } | undefined,
  dateStr: string
): string {
  const formattedDate = formatDutyDate(dateStr) || dateStr;
  const expected = report?.expectedCount ?? house.expectedStudentCount;
  
  if (!report) {
    return `⚠️ *HOUSE REPORT PENDING*
🏫 *House:* ${house.name} (${house.category})
👤 *Houseparent:* ${house.assignedHouseparent}
📅 *Date:* ${formattedDate}
🎯 *Expected Quota:* ${expected} students

Status: *No report submitted yet for this date.*
Please submit your student reporting number.

*Senior Houseparent (Xtreme)*`;
  }

  const reported = report.reportedCount;
  const notReported = Math.max(0, expected - reported);
  const percentage = expected > 0 ? ((reported / expected) * 100).toFixed(1) : '0';

  let msg = `📊 *HOUSE REPORT UPDATE*
🏫 *House:* ${house.name} (${house.category})
📅 *Date:* ${formattedDate}
👤 *Houseparent:* ${house.assignedHouseparent}

✅ *Students Reported:* ${reported} / ${expected} (${percentage}%)
⏳ *Not Yet Reported:* ${notReported}`;

  if (report.notReportedDetails && report.notReportedDetails.trim()) {
    msg += `\n📝 *Details / Reasons:* ${report.notReportedDetails.trim()}`;
  }

  msg += `\n\n_Confirmed by Senior Houseparent (Xtreme)_`;
  return msg;
}

/**
 * Generates WhatsApp message for the complete 8-houses collation
 */
export function generateFullCollationWhatsAppMessage(
  collation: {
    totalExpected: number;
    totalReported: number;
    totalNotReported: number;
    reportingPercentage: number;
    reportsReceivedCount: number;
    totalHousesCount: number;
    boysExpected: number;
    boysReported: number;
    boysNotReported: number;
    boysPercentage: number;
    girlsExpected: number;
    girlsReported: number;
    girlsNotReported: number;
    girlsPercentage: number;
    missingHouseIds: string[];
  },
  houses: Array<{ id: string; name: string; category: string }>,
  dateReportsMap: Map<string, { reportedCount: number; notReportedCount: number; expectedCount: number; notReportedDetails?: string }>,
  dateStr: string
): string {
  const formattedDate = formatDutyDate(dateStr) || dateStr;

  let text = `📢 *TERM OPENING SCHOOL REPORT*\n`;
  text += `📅 *Date:* ${formattedDate}\n\n`;

  text += `📊 *OVERALL TOTALS*\n`;
  text += `• Total Expected: *${collation.totalExpected}*\n`;
  text += `• Total Reported: *${collation.totalReported}* (${collation.reportingPercentage}%)\n`;
  text += `• Not Yet Reported: *${collation.totalNotReported}*\n`;
  text += `• Reports Received: *${collation.reportsReceivedCount} of ${collation.totalHousesCount} Houses*\n\n`;

  text += `👦 *BOYS HOUSES (4)*: ${collation.boysReported}/${collation.boysExpected} (${collation.boysPercentage}%)\n`;
  text += `👧 *GIRLS HOUSES (4)*: ${collation.girlsReported}/${collation.girlsExpected} (${collation.girlsPercentage}%)\n\n`;

  text += `🏫 *8 HOUSES BREAKDOWN*\n`;
  for (const h of houses) {
    const rep = dateReportsMap.get(h.id);
    if (rep) {
      const pct = rep.expectedCount > 0 ? ((rep.reportedCount / rep.expectedCount) * 100).toFixed(0) : 0;
      text += `✅ *${h.name}*: ${rep.reportedCount}/${rep.expectedCount} (${pct}%)`;
      if (rep.notReportedCount > 0) {
        text += ` — ${rep.notReportedCount} absent/pending`;
      }
      text += `\n`;
    } else {
      text += `⏳ *${h.name}*: Report pending\n`;
    }
  }

  if (collation.missingHouseIds.length > 0) {
    const missingNames = collation.missingHouseIds
      .map(id => houses.find(h => h.id === id)?.name || id)
      .join(', ');
    text += `\n⚠️ *Missing Reports:* ${missingNames}\n`;
  }

  // Follow-up details
  const followUps: string[] = [];
  houses.forEach(h => {
    const rep = dateReportsMap.get(h.id);
    if (rep && rep.notReportedDetails && rep.notReportedDetails.trim()) {
      followUps.push(`• *${h.name}:* ${rep.notReportedDetails.trim()}`);
    }
  });

  if (followUps.length > 0) {
    text += `\n📝 *Follow-up Notes:*\n${followUps.join('\n')}\n`;
  }

  text += `\n_Generated via Xtreme Senior Houseparent Suite_`;
  return text;
}

