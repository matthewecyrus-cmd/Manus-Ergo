/**
 * pdf-export.ts — ErgoKit
 * =======================
 * Generates a professional multi-page PDF report from a SessionRecord.
 * Uses jsPDF for PDF generation (pure programmatic PDF, no html2canvas).
 *
 * Layout:
 *   Page 1: Cover / summary — session metadata, risk badge, tracking quality,
 *            sustained-peak evidence, score cards (peak + sustained)
 *   Page 2: Body Region Risk Map, Peak-Frame Joint Angles
 *   Page 3: Recommendations + Corrective Actions
 *   Page N: Thumbnail (if available)
 */
import type { SessionRecord, BodyAngles, RiskLevel } from './ergo-engine';
import { jsPDF } from 'jspdf';

// ─── Color helpers ─────────────────────────────────────────────────────────────
function riskRgb(level: RiskLevel): [number, number, number] {
  switch (level) {
    case 'very-high': return [239, 68, 68];   // red-500
    case 'high':      return [249, 115, 22];  // orange-500
    case 'medium':    return [234, 179, 8];   // yellow-500
    case 'low':       return [34, 197, 94];   // green-500
    default:          return [100, 116, 139]; // slate-500
  }
}

function riskLabel(level: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    negligible: 'Negligible', low: 'Low', medium: 'Medium', high: 'High', 'very-high': 'Very High',
  };
  return map[level] ?? level;
}

function scoreRulaRisk(s: number): RiskLevel {
  return s >= 7 ? 'very-high' : s >= 5 ? 'high' : s >= 3 ? 'medium' : 'low';
}
function scoreRebaRisk(s: number): RiskLevel {
  return s >= 11 ? 'very-high' : s >= 8 ? 'high' : s >= 4 ? 'medium' : 'low';
}
function scoreNioshRisk(s: number): RiskLevel {
  return s >= 2 ? 'high' : s >= 1 ? 'medium' : 'low';
}
function scoreRsiRisk(s: number): RiskLevel {
  return s >= 40 ? 'high' : s >= 20 ? 'medium' : 'low';
}
function normalizeRisk(level: string): RiskLevel {
  if (level === 'negligible') return 'negligible';
  if (level === 'very-high') return 'very-high';
  if (level === 'high') return 'high';
  if (level === 'medium') return 'medium';
  return 'low';
}

// ─── PDF text sanitizer ─────────────────────────────────────────────────────
/**
 * jsPDF's built-in Helvetica/Courier/Times fonts only cover the Latin-1 (ISO 8859-1)
 * code page. Any character outside that range (e.g. U+00B0 DEGREE SIGN, U+2265 GREATER
 * THAN OR EQUAL TO, U+2019 RIGHT SINGLE QUOTATION MARK) is silently dropped, producing
 * invisible gaps or corrupt text in the PDF.
 *
 * This function replaces the most common offenders with safe ASCII equivalents so the
 * rendered text is always readable without requiring a custom font embed.
 */
export function sanitizePdfText(text: string): string {
  return text
    // Degree sign (U+00B0) — present in all recommendation strings
    .replace(/\u00b0/g, ' deg')
    // Greater-than-or-equal (U+2265) — used in sustained-peak disclaimer
    .replace(/\u2265/g, '>=')
    // Less-than-or-equal (U+2264)
    .replace(/\u2264/g, '<=')
    // En dash (U+2013) and em dash (U+2014)
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '--')
    // Curly quotes (U+2018, U+2019, U+201C, U+201D)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    // Bullet (U+2022) — sometimes used in description text
    .replace(/\u2022/g, '-')
    // Multiplication sign (U+00D7)
    .replace(/\u00d7/g, 'x')
    // Plus-minus (U+00B1)
    .replace(/\u00b1/g, '+/-')
    // HTML entity fallback (in case any raw entities leaked through)
    .replace(/&deg;/g, ' deg')
    .replace(/&ge;/g, '>=')
    .replace(/&le;/g, '<=')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Strip any remaining non-Latin-1 characters (U+0100 and above) to prevent
    // silent drops; replace with '?' so the gap is visible during QA.
    .replace(/[\u0100-\uFFFF]/g, '?');
}

// ─── PDF builder ─────────────────────────────────────────────────────
export async function exportSessionPdf(session: SessionRecord): Promise<void> {
  // Dynamic import to avoid loading jspdf at startup
  const { jsPDF } = await import('jspdf');

  const PAGE_W = 210; // A4 mm
  const PAGE_H = 297;
  const MARGIN = 16;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ─── Fonts / helpers ──────────────────────────────────────────────────────────
  const setFont = (size: number, style: 'normal' | 'bold' | 'italic' = 'normal') => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
  };
  const setColor = (r: number, g: number, b: number) => doc.setTextColor(r, g, b);
  const setFill  = (r: number, g: number, b: number) => doc.setFillColor(r, g, b);
  const setDraw  = (r: number, g: number, b: number) => doc.setDrawColor(r, g, b);

  let y = MARGIN;

  // ─── Page management ──────────────────────────────────────────────────────────
  const checkPage = (needed: number) => {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
      drawHeader();
    }
  };

  const drawHeader = () => {
    // Thin sky-blue top bar
    setFill(6, 182, 212);
    doc.rect(0, 0, PAGE_W, 6, 'F');
    // Footer
    setFont(7);
    setColor(148, 163, 184);
    doc.text(`ErgoKit CV Ergonomics · ${session.id} · ${session.date}`, MARGIN, PAGE_H - 5);
    doc.text(`Page ${doc.getNumberOfPages()}`, PAGE_W - MARGIN, PAGE_H - 5, { align: 'right' });
    setColor(15, 23, 42); // reset to dark
  };

  // ─── PAGE 1: Cover ────────────────────────────────────────────────────────────
  drawHeader();
  y = 14;

  // Logo / brand
  setFont(9, 'bold');
  setColor(6, 182, 212);
  doc.text('ErgoKit', MARGIN, y);
  setFont(9);
  setColor(100, 116, 139);
  doc.text('Industrial Ergonomics Assessment', MARGIN + 22, y);
  y += 10;

  // Title
  setFont(18, 'bold');
  setColor(15, 23, 42);
  doc.text(sanitizePdfText(session.taskName || 'Ergonomics Assessment'), MARGIN, y);
  y += 7;

  // Metadata row
  setFont(9);
  setColor(100, 116, 139);
  const meta: string[] = [
    `Session: ${session.id}`,
    `Date: ${session.date}`,
    `Duration: ${session.duration}s`,
    `Samples: ${session.snapshots.length}`,
  ];
  if (session.assessor) meta.push(`Assessor: ${session.assessor}`);
  if (session.department) meta.push(`Dept: ${session.department}`);
  if (session.location) meta.push(`Location: ${session.location}`);
  doc.text(sanitizePdfText(meta.join('   ·   ')), MARGIN, y);
  y += 8;

  // Risk badge
  const [rr, rg, rb] = riskRgb(normalizeRisk(session.peakRisk));
  setFill(rr, rg, rb);
  doc.roundedRect(MARGIN, y, 48, 8, 2, 2, 'F');
  setFont(9, 'bold');
  setColor(255, 255, 255);
  doc.text(`Peak Risk: ${riskLabel(session.peakRisk)}`, MARGIN + 4, y + 5.5);
  y += 14;

  // ─── Tracking Quality Banner ──────────────────────────────────────────────────
  const totalFrames = session.snapshots.length;
  const clampedFrames = session.clampedFrames ?? 0;
  const clampedPct = totalFrames > 0 ? Math.round((clampedFrames / totalFrames) * 100) : 0;
  const trackingQuality = clampedPct === 0 ? 'Excellent' : clampedPct < 10 ? 'Good' : clampedPct < 25 ? 'Fair' : 'Poor';
  const trackingColor: [number, number, number] = clampedPct === 0 ? [34, 197, 94] : clampedPct < 10 ? [34, 197, 94] : clampedPct < 25 ? [234, 179, 8] : [239, 68, 68];

  setFill(trackingColor[0], trackingColor[1], trackingColor[2]);
  doc.roundedRect(MARGIN, y, 4, 8, 1, 1, 'F');
  setFill(248, 250, 252);
  setDraw(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN + 4, y, CONTENT_W - 4, 8, 1, 1, 'FD');
  setFont(8, 'bold');
  setColor(trackingColor[0], trackingColor[1], trackingColor[2]);
  doc.text(`Tracking Quality: ${trackingQuality}`, MARGIN + 8, y + 5.5);
  setFont(7);
  setColor(100, 116, 139);
  const trackingText = clampedFrames === 0
    ? `All ${totalFrames} frames passed the anatomical plausibility check.`
    : `${clampedFrames} of ${totalFrames} frames (${clampedPct}%) had at least one joint angle clamped.`;
  doc.text(trackingText, MARGIN + 65, y + 5.5);
  y += 14;

  // Divider
  setDraw(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 8;

  // ─── Summary text ─────────────────────────────────────────────────────────────
  const peakRiskNorm = normalizeRisk(session.peakRisk);
  const isHighRisk = peakRiskNorm === 'high' || peakRiskNorm === 'very-high';
  const isMedRisk  = peakRiskNorm === 'medium';
  const summaryText = isHighRisk
    ? 'This assessment found serious ergonomic risks requiring immediate attention. The worker\'s posture during this task presents significant risk of musculoskeletal injury. Immediate corrective action is recommended.'
    : isMedRisk
    ? 'This assessment found moderate ergonomic risks. Continued exposure without changes will likely lead to discomfort or injury over time. The recommendations below outline practical steps to reduce this risk.'
    : 'This assessment found low ergonomic risk. The worker\'s posture during this task is generally acceptable. Minor improvements may still be beneficial for long-term comfort.';

  setFont(9);
  setColor(51, 65, 85);
  const summaryLines = doc.splitTextToSize(sanitizePdfText(summaryText), CONTENT_W);
  doc.text(summaryLines, MARGIN, y);
  y += summaryLines.length * 5 + 8;

  // ─── Score cards (2×2 grid) — Peak + Sustained ───────────────────────────────
  setFont(11, 'bold');
  setColor(15, 23, 42);
  doc.text('Assessment Scores', MARGIN, y);
  y += 7;

  const peakRula = session.peakRula ?? Math.round(session.avgRula);
  const peakReba = session.peakReba ?? Math.round(session.avgReba);
  const sustainedRula = session.sustainedPeakRula ?? peakRula;
  const sustainedReba = session.sustainedPeakReba ?? peakReba;

  const scores = [
    {
      label: 'RULA', fullName: 'Rapid Upper Limb Assessment',
      score: peakRula, sustained: sustainedRula,
      risk: scoreRulaRisk(peakRula) as RiskLevel, max: 7,
      nioshNA: false,
    },
    {
      label: 'REBA', fullName: 'Rapid Entire Body Assessment',
      score: peakReba, sustained: sustainedReba,
      risk: scoreRebaRisk(peakReba) as RiskLevel, max: 15,
      nioshNA: false,
    },
    {
      label: 'NIOSH LI', fullName: 'NIOSH Lifting Index',
      score: session.avgNiosh, sustained: null,
      risk: scoreNioshRisk(session.avgNiosh) as RiskLevel, max: 3,
      nioshNA: session.avgNiosh === 0 && session.taskProfile?.loadWeight === 0,
    },
    {
      label: 'RSI', fullName: 'Repetitive Strain Index',
      score: session.avgRsi, sustained: null,
      risk: scoreRsiRisk(session.avgRsi) as RiskLevel, max: 60,
      nioshNA: session.avgRsi === 0 && (session.taskProfile?.repRate ?? 0) < 2,
    },
  ];

  const cardW = (CONTENT_W - 6) / 2;
  const cardH = 32;
  const col2X = MARGIN + cardW + 6;

  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    const cx = i % 2 === 0 ? MARGIN : col2X;
    if (i % 2 === 0 && i > 0) y += cardH + 4;
    checkPage(cardH + 4);

    const [sr, sg, sb] = s.nioshNA ? [148, 163, 184] : riskRgb(s.risk);

    // Card background
    setFill(248, 250, 252);
    setDraw(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, y, cardW, cardH, 2, 2, 'FD');

    // Left accent bar
    setFill(sr, sg, sb);
    doc.roundedRect(cx, y, 3, cardH, 1, 1, 'F');

    // Score label
    setFont(8, 'bold');
    setColor(15, 23, 42);
    doc.text(s.label, cx + 7, y + 6);

    // PEAK label
    setFont(6, 'bold');
    setColor(100, 116, 139);
    doc.text('PEAK', cx + 7, y + 10.5);

    // Full name
    setFont(7);
    setColor(100, 116, 139);
    doc.text(s.fullName, cx + 7, y + 15);

    if (s.nioshNA) {
      // N/A display
      setFont(14, 'bold');
      setColor(148, 163, 184);
      doc.text('N/A', cx + 7, y + 26);
      setFont(6);
      setColor(148, 163, 184);
      doc.text('Not applicable for this task', cx + 7, y + 30);
    } else {
      // Score number (peak)
      setFont(18, 'bold');
      setColor(sr, sg, sb);
      doc.text(s.score.toFixed(0), cx + 7, y + 26);

      // Risk label
      setFont(8, 'bold');
      setColor(sr, sg, sb);
      doc.text(riskLabel(s.risk), cx + 22, y + 26);

      // Sustained peak (if available)
      if (s.sustained !== null && s.sustained !== undefined) {
        const sustainedRisk = s.label === 'RULA' ? scoreRulaRisk(s.sustained) : scoreRebaRisk(s.sustained);
        const [susr, susg, susb] = riskRgb(sustainedRisk);
        setFont(6);
        setColor(100, 116, 139);
     doc.text('Sustained (>=3 frames):', cx + 7, y + 30);       setFont(7, 'bold');
        setColor(susr, susg, susb);
        doc.text(String(s.sustained), cx + 46, y + 30);
        if (s.sustained < s.score) {
          setFont(6);
          setColor(59, 130, 246);
          doc.text(`(${s.score - s.sustained} below abs. peak)`, cx + 52, y + 30);
        }
      }

      // Progress bar
      const barX = cx + 7;
      const barY = y + 32.5;
      const barW = cardW - 14;
      setFill(226, 232, 240);
      doc.roundedRect(barX, barY - 2, barW, 1.5, 0.5, 0.5, 'F');
      const pct = Math.min(1, s.score / s.max);
      setFill(sr, sg, sb);
      doc.roundedRect(barX, barY - 2, barW * pct, 1.5, 0.5, 0.5, 'F');
    }
  }
  y += cardH + 10;

  // ─── PAGE 2: Body Region Risk Map + Peak-Frame Joint Angles ──────────────────
  checkPage(60);

  setFont(11, 'bold');
  setColor(15, 23, 42);
  doc.text('Body Region Risk Map', MARGIN, y);
  y += 7;

  const bodyRegions = session.bodyRegions ?? [];
  if (bodyRegions.length > 0) {
    const barMaxW = CONTENT_W - 60;
    const rowH = 8;
    for (const region of bodyRegions) {
      checkPage(rowH + 2);
      const [br, bg, bb] = riskRgb(normalizeRisk(region.riskLevel));
      const pct = Math.min(1, region.score / 10);

      setFont(8);
      setColor(51, 65, 85);
      doc.text(region.region, MARGIN, y + 5);

      setFill(241, 245, 249);
      doc.roundedRect(MARGIN + 55, y + 1, barMaxW, 5, 1, 1, 'F');
      setFill(br, bg, bb);
      doc.roundedRect(MARGIN + 55, y + 1, barMaxW * pct, 5, 1, 1, 'F');

      setFont(8, 'bold');
      setColor(br, bg, bb);
      doc.text(region.score.toFixed(1), MARGIN + 55 + barMaxW + 3, y + 5.5);

      y += rowH;
    }
    y += 6;
  } else {
    setFont(8);
    setColor(148, 163, 184);
    doc.text('No body region data available.', MARGIN, y);
    y += 10;
  }

  // ─── Peak-Frame Joint Angles (primary) ───────────────────────────────────────
  checkPage(30);

  setFont(11, 'bold');
  setColor(15, 23, 42);
  doc.text('Peak-Posture Frame Angles', MARGIN, y);
  setFont(7);
  setColor(100, 116, 139);
  doc.text('Joint angles at the worst-posture frame — the evidence that justifies the headline score', MARGIN, y + 5);
  y += 12;

  const ANGLE_SAFE_RANGES: Record<string, { safe: [number, number]; label: string }> = {
    neckFlexion:   { safe: [0, 20],  label: 'Neck Flexion' },
    trunkFlexion:  { safe: [0, 20],  label: 'Trunk Flexion' },
    leftUpperArm:  { safe: [0, 20],  label: 'L. Shoulder Elevation' },
    rightUpperArm: { safe: [0, 20],  label: 'R. Shoulder Elevation' },
    leftWrist:     { safe: [0, 15],  label: 'L. Wrist Deviation' },
    rightWrist:    { safe: [0, 15],  label: 'R. Wrist Deviation' },
    hipFlexion:    { safe: [0, 30],  label: 'Hip Flexion' },
    leftKnee:      { safe: [0, 30],  label: 'L. Knee Bend' },
    rightKnee:     { safe: [0, 30],  label: 'R. Knee Bend' },
  };

  // Use peak-frame angles as primary; fall back to avg angles
  const displayAngles = (session.peakAngles ?? session.avgAngles) as Partial<BodyAngles> | undefined;
  const anglesLabel = session.peakAngles ? 'Peak Frame' : 'Clip Average';

  if (displayAngles && Object.keys(displayAngles).length > 0) {
    setFont(7, 'italic');
    setColor(100, 116, 139);
    doc.text(`Source: ${anglesLabel}`, MARGIN, y);
    y += 5;

    for (const [key, value] of Object.entries(displayAngles)) {
      const info = ANGLE_SAFE_RANGES[key];
      if (!info || typeof value !== 'number') continue;
      checkPage(10);

      const [lo, hi] = info.safe;
      const inSafe = value >= lo && value <= hi;
      const risk: RiskLevel = inSafe ? 'low' : value > hi * 1.5 ? 'high' : 'medium';
      const [ar, ag, ab] = riskRgb(risk);

      setFont(8);
      setColor(51, 65, 85);
      doc.text(info.label, MARGIN, y + 5);

      const barMaxW2 = CONTENT_W - 70;
      const maxRange = hi * 3;
      const pct2 = Math.min(1, Math.abs(value) / maxRange);
      setFill(241, 245, 249);
      doc.roundedRect(MARGIN + 60, y + 1, barMaxW2, 5, 1, 1, 'F');
      setFill(ar, ag, ab);
      doc.roundedRect(MARGIN + 60, y + 1, barMaxW2 * pct2, 5, 1, 1, 'F');

      setFont(8, 'bold');
      setColor(ar, ag, ab);
      doc.text(`${value.toFixed(1)} deg`, MARGIN + 60 + barMaxW2 + 3, y + 5.5);

      setFont(6);
      setColor(148, 163, 184);
      doc.text(`Safe: 0 to ${hi} deg`, MARGIN + 60, y + 9);

      y += 11;
    }
    y += 4;
  } else {
    setFont(8);
    setColor(148, 163, 184);
    doc.text('No joint angle data available.', MARGIN, y);
    y += 10;
  }

  // ─── PAGE 3: Recommendations + Actions ───────────────────────────────────────
  checkPage(30);

  setFont(11, 'bold');
  setColor(15, 23, 42);
  doc.text('Recommendations', MARGIN, y);
  y += 7;

  const recommendations = session.recommendations ?? [];
  if (recommendations.length > 0) {
    for (let i = 0; i < recommendations.length; i++) {
      const rec = recommendations[i];
      const lines = doc.splitTextToSize(sanitizePdfText(rec), CONTENT_W - 12);
      const blockH = lines.length * 5 + 6;
      checkPage(blockH + 2);

      setFill(255, 251, 235);
      setDraw(253, 230, 138);
      doc.setLineWidth(0.3);
      doc.roundedRect(MARGIN, y, CONTENT_W, blockH, 2, 2, 'FD');

      setFill(217, 119, 6);
      doc.circle(MARGIN + 5, y + blockH / 2, 3.5, 'F');
      setFont(7, 'bold');
      setColor(255, 255, 255);
      doc.text(String(i + 1), MARGIN + 5, y + blockH / 2 + 2.5, { align: 'center' });

      setFont(8);
      setColor(51, 65, 85);
      doc.text(lines, MARGIN + 12, y + 5.5);

      y += blockH + 3;
    }
    y += 4;
  } else {
    setFont(8);
    setColor(148, 163, 184);
    doc.text('No recommendations generated.', MARGIN, y);
    y += 10;
  }

  // ─── Corrective Actions ───────────────────────────────────────────────────────
  const actions = session.actions ?? [];
  if (actions.length > 0) {
    checkPage(20);
    setFont(11, 'bold');
    setColor(15, 23, 42);
    doc.text('Corrective Actions', MARGIN, y);
    y += 7;

    for (const action of actions) {
      const lines = doc.splitTextToSize(sanitizePdfText(action.description), CONTENT_W - 50);
      const blockH = Math.max(12, lines.length * 5 + 6);
      checkPage(blockH + 2);

      setFill(248, 250, 252);
      setDraw(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(MARGIN, y, CONTENT_W, blockH, 2, 2, 'FD');

      const priorityColors: Record<string, [number, number, number]> = {
        critical: [239, 68, 68], high: [249, 115, 22], medium: [234, 179, 8], low: [100, 116, 139],
      };
      const [pr, pg, pb] = priorityColors[action.priority] ?? [100, 116, 139];
      setFill(pr, pg, pb);
      doc.roundedRect(MARGIN + 3, y + 3, 18, 5, 1, 1, 'F');
      setFont(6, 'bold');
      setColor(255, 255, 255);
      doc.text(action.priority.toUpperCase(), MARGIN + 12, y + 6.5, { align: 'center' });

      const statusColors: Record<string, [number, number, number]> = {
        open: [100, 116, 139], 'in-progress': [59, 130, 246], completed: [34, 197, 94], verified: [16, 185, 129],
      };
      const [str, stg, stb] = statusColors[action.status] ?? [100, 116, 139];
      setFont(6);
      setColor(str, stg, stb);
      doc.text(action.status.replace('-', ' ').toUpperCase(), MARGIN + 25, y + 6.5);

      setFont(8);
      setColor(51, 65, 85);
      doc.text(lines, MARGIN + 48, y + 5.5);

      y += blockH + 3;
    }
    y += 4;
  }

  // ─── Thumbnail page (if available) ───────────────────────────────────────────
  const thumbUrl = (session as any).thumbnailDataUrl as string | undefined;
  if (thumbUrl) {
    doc.addPage();
    drawHeader();
    y = 14;

    setFont(11, 'bold');
    setColor(15, 23, 42);
    doc.text('Session Thumbnail — Peak-Posture Frame', MARGIN, y);
    setFont(7);
    setColor(100, 116, 139);
    doc.text('Captured from the frame that produced the highest RULA score', MARGIN, y + 5);
    y += 12;

    try {
      // Derive the aspect ratio from the image data so the thumbnail is not
      // letterboxed or stretched regardless of the video's original aspect ratio.
      // We load the data URL into an Image element to read naturalWidth/naturalHeight.
      const imgEl = new Image();
      await new Promise<void>((resolve) => {
        imgEl.onload = () => resolve();
        imgEl.onerror = () => resolve();
        imgEl.src = thumbUrl;
      });
      const nW = imgEl.naturalWidth  || 16;
      const nH = imgEl.naturalHeight || 9;
      const imgW = CONTENT_W;
      const imgH = imgW * (nH / nW);
      // Cap height so the image doesn't overflow the page
      const maxH = PAGE_H - y - MARGIN - 20;
      const finalH = Math.min(imgH, maxH);
      const finalW = finalH < imgH ? imgW * (finalH / imgH) : imgW;
      const xOff = MARGIN + (CONTENT_W - finalW) / 2;
      doc.addImage(thumbUrl, 'JPEG', xOff, y, finalW, finalH);
      y += finalH + 4;
    } catch {
      setFont(8);
      setColor(148, 163, 184);
      doc.text('Thumbnail could not be embedded.', MARGIN, y);
    }
  }

  // ─── Notes ────────────────────────────────────────────────────────────────────
  if (session.notes) {
    checkPage(20);
    setFont(11, 'bold');
    setColor(15, 23, 42);
    doc.text('Assessor Notes', MARGIN, y);
    y += 7;
    setFont(8);
    setColor(51, 65, 85);
  const noteLines = doc.splitTextToSize(sanitizePdfText(session.notes), CONTENT_W);
  doc.text(noteLines, MARGIN, y);
    y += noteLines.length * 5 + 4;
  }

  // ─── Legal footer on last page ────────────────────────────────────────────────
  checkPage(12);
  setFont(7);
  setColor(148, 163, 184);
  const disclaimer = 'This report is generated automatically by computer vision analysis. Results should be reviewed by a qualified ergonomist for critical decisions. Sustained peak scores represent the highest risk level maintained for >=3 consecutive frames; absolute peak scores represent the single worst frame.';
  const disclaimerLines = doc.splitTextToSize(disclaimer, CONTENT_W);
  doc.text(disclaimerLines, MARGIN, y);

  // ─── Save ─────────────────────────────────────────────────────────────────────────────
  const filename = `ergokit-${session.id}-${session.taskName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
  doc.save(filename);
}
