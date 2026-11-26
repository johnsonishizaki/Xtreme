export interface ChartDatum {
  label: string;
  value: number;
  max: number;
  pct: number;
  color: string;
  status: 'full' | 'partial' | 'missing';
}

export interface FormattedAiOutput {
  htmlText: string;
  plainText: string;
  hasChart: boolean;
  chartData?: ChartDatum[];
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInlineMarkdown(escapedLine: string): string {
  // Inline code `code`
  let out = escapedLine.replace(
    /`([^`]+)`/g,
    '<code class="px-1.5 py-0.5 rounded bg-[var(--code-bg)] border border-[var(--card-border-subtle)] font-mono text-[11px] text-emerald-500">$1</code>'
  );
  // Bold **text**
  out = out.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong class="font-extrabold text-[var(--text-page)] tabular-nums">$1</strong>'
  );
  // Italic *text*
  out = out.replace(
    /(^|[^*])\*([^*]+)\*(?!\*)/g,
    '$1<em class="italic text-[var(--text-muted)]">$2</em>'
  );
  // Highlight standalone percentages like (73.5%) or 100% if not already wrapped
  out = out.replace(
    /(\b\d+(?:\.\d+)?%)/g,
    '<span class="font-mono font-semibold tabular-nums">$1</span>'
  );
  return out;
}

/**
 * Standardized formatter for AI responses:
 * - XSS-safe HTML escaping
 * - Headings, bold metrics, inline code, structured bullet/numbered lists
 * - Automatic extraction of house & gender attendance ratios for visual charts
 */
export function formatAiResponse(rawText: string, explicitChartData?: Array<{ label: string; value: number; max: number; color?: string }>): FormattedAiOutput {
  if (!rawText) return { htmlText: '', plainText: '', hasChart: false };

  const chartData: ChartDatum[] = [];
  const seenLabels = new Set<string>();

  if (Array.isArray(explicitChartData) && explicitChartData.length > 0) {
    for (const item of explicitChartData) {
      const max = Math.max(0, Number(item.max) || 0);
      const value = Math.max(0, Number(item.value) || 0);
      const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
      const status: ChartDatum['status'] = value === 0 ? 'missing' : value >= max && max > 0 ? 'full' : 'partial';
      const color = item.color || (status === 'full' ? '#10b981' : status === 'partial' ? '#3b82f6' : '#f59e0b');
      const key = item.label.trim().toLowerCase();
      if (!seenLabels.has(key)) {
        seenLabels.add(key);
        chartData.push({ label: item.label.trim(), value, max, pct, color, status });
      }
    }
  }

  const lines = rawText.split('\n');
  const htmlBlocks: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      htmlBlocks.push('<div class="h-1.5"></div>');
      continue;
    }

    // Strip markdown symbols temporarily to detect numeric house/group ratios like "St. Mary Boys: 89/121"
    const cleanForMetrics = trimmed
      .replace(/^[\-\*•✅⏳⚠️📊🏠📱👦👧🏫]+\s*/, '')
      .replace(/\*\*/g, '')
      .replace(/`/g, '');

    const ratioMatch = cleanForMetrics.match(/^([A-Za-z0-9\s\.\-\(\)]{2,32}?):\s*(\d+)\s*\/\s*(\d+)/);
    if (ratioMatch && chartData.length < 12) {
      const label = ratioMatch[1].trim();
      const value = parseInt(ratioMatch[2], 10);
      const max = parseInt(ratioMatch[3], 10);
      const key = label.toLowerCase();
      if (max > 0 && !seenLabels.has(key) && !key.includes('houses in')) {
        seenLabels.add(key);
        const pct = Math.min(100, Math.round((value / max) * 100));
        const status: ChartDatum['status'] = value === 0 ? 'missing' : value >= max ? 'full' : 'partial';
        const color =
          status === 'full'
            ? '#10b981'
            : key.includes('girl')
              ? '#ec4899'
              : key.includes('boy')
                ? '#3b82f6'
                : status === 'partial'
                  ? '#3b82f6'
                  : '#f59e0b';
        chartData.push({ label, value, max, pct, color, status });
      }
    }

    const escaped = escapeHtml(trimmed);

    // Headings (### / ## / #)
    const headingMatch = escaped.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      htmlBlocks.push(
        `<div class="text-xs font-extrabold text-[var(--text-page)] tracking-tight pt-1.5 pb-0.5 border-b border-[var(--card-border-subtle)]">${formatInlineMarkdown(headingMatch[1])}</div>`
      );
      continue;
    }

    // Bullet lists (- / * / •)
    if (/^[\-\*•]\s+/.test(escaped)) {
      const body = escaped.replace(/^[\-\*•]\s+/, '');
      htmlBlocks.push(
        `<div class="flex items-start gap-2 pl-1.5 py-0.5 rounded-lg bg-[var(--card-bg-elevated)]/45 border border-[var(--card-border-subtle)]/60 px-2.5"><span class="text-emerald-500 font-bold shrink-0">•</span><span class="flex-1 leading-relaxed">${formatInlineMarkdown(body)}</span></div>`
      );
      continue;
    }

    // Numbered lists (1. / 2.)
    const numMatch = escaped.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch) {
      htmlBlocks.push(
        `<div class="flex items-start gap-2 pl-1.5 py-0.5"><span class="font-mono font-bold text-[11px] text-emerald-500 shrink-0 tabular-nums">${numMatch[1]}.</span><span class="flex-1 leading-relaxed">${formatInlineMarkdown(numMatch[2])}</span></div>`
      );
      continue;
    }

    // Standalone bold title line
    if (/^\*\*[^*]+\*\*[:]*$/.test(escaped)) {
      htmlBlocks.push(
        `<div class="text-xs font-extrabold text-[var(--text-page)] pt-1">${formatInlineMarkdown(escaped)}</div>`
      );
      continue;
    }

    htmlBlocks.push(`<div class="leading-relaxed">${formatInlineMarkdown(escaped)}</div>`);
  }

  return {
    htmlText: htmlBlocks.join(''),
    plainText: rawText,
    hasChart: chartData.length > 0,
    chartData: chartData.length > 0 ? chartData : undefined
  };
}
