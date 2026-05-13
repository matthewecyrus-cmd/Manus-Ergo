/**
 * ergo-explainer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Plain-English explanations for every ergonomics score, risk level, and
 * metric in ErgoKit.  Written for non-ergonomists — HR managers, supervisors,
 * and workers — with zero assumed technical knowledge.
 */

import type { RiskLevel } from "./ergo-engine";

// ─── Risk level explanations ──────────────────────────────────────────────────

export interface RiskExplanation {
  emoji: string;
  headline: string;
  /** One sentence a non-expert can read aloud to their boss */
  plain: string;
  /** What happens if nothing changes */
  consequence: string;
  /** Urgency of action */
  urgency: string;
  /** Background color class for the card */
  bgClass: string;
  /** Text color class */
  textClass: string;
  /** Border color class */
  borderClass: string;
}

export const RISK_EXPLANATIONS: Record<RiskLevel, RiskExplanation> = {
  negligible: {
    emoji: "✅",
    headline: "No Action Needed",
    plain: "The worker's posture is comfortable and safe for this task.",
    consequence: "No injury risk identified at this time.",
    urgency: "No changes required. Continue monitoring periodically.",
    bgClass: "bg-green-50",
    textClass: "text-green-800",
    borderClass: "border-green-200",
  },
  low: {
    emoji: "🟢",
    headline: "Low Risk — Monitor",
    plain: "The posture is mostly fine, but a few small improvements could make the job even more comfortable.",
    consequence: "Low chance of discomfort over time. Not urgent, but worth noting.",
    urgency: "Review at your next scheduled ergonomics check-in.",
    bgClass: "bg-green-50",
    textClass: "text-green-800",
    borderClass: "border-green-200",
  },
  medium: {
    emoji: "🟡",
    headline: "Moderate Risk — Investigate",
    plain: "The worker is in positions that could cause soreness or strain if repeated every day.",
    consequence: "Without changes, this worker may develop muscle strain, tendinitis, or back pain within months.",
    urgency: "Schedule an ergonomics review within the next 30 days.",
    bgClass: "bg-amber-50",
    textClass: "text-amber-800",
    borderClass: "border-amber-200",
  },
  high: {
    emoji: "🔴",
    headline: "High Risk — Act Soon",
    plain: "The worker is regularly in positions that put significant strain on their joints and muscles.",
    consequence: "Without changes, this worker is at real risk of a musculoskeletal injury — such as a rotator cuff tear, herniated disc, or carpal tunnel syndrome — within weeks to months.",
    urgency: "Implement corrective changes within the next 1–2 weeks.",
    bgClass: "bg-red-50",
    textClass: "text-red-800",
    borderClass: "border-red-200",
  },
  "very-high": {
    emoji: "🚨",
    headline: "Very High Risk — Act Immediately",
    plain: "The worker is in seriously harmful positions. This is the kind of posture that causes injuries quickly.",
    consequence: "Continuing this task without changes is very likely to result in a serious injury that could require surgery, extended time off work, or permanent disability.",
    urgency: "Stop or modify the task immediately. Do not wait.",
    bgClass: "bg-red-100",
    textClass: "text-red-900",
    borderClass: "border-red-400",
  },
};

// ─── Score method explanations ────────────────────────────────────────────────

export interface MethodExplanation {
  name: string;
  acronym: string;
  /** What body parts it measures */
  measures: string;
  /** Plain-English scale description */
  scale: string;
  /** What the score number means at each threshold */
  thresholds: { max: number; label: string; meaning: string }[];
  /** Why this method exists */
  purpose: string;
}

export const METHOD_EXPLANATIONS: Record<string, MethodExplanation> = {
  RULA: {
    name: "Rapid Upper Limb Assessment",
    acronym: "RULA",
    measures: "Neck, shoulders, elbows, and wrists — the upper half of the body",
    scale: "Scored 1–7. Lower is safer. Think of it like a pain forecast for the arms and neck.",
    thresholds: [
      { max: 2, label: "1–2 · Acceptable", meaning: "The arm and neck positions are comfortable. No changes needed." },
      { max: 4, label: "3–4 · Monitor", meaning: "Some awkward positions detected. Worth investigating, but not urgent." },
      { max: 6, label: "5–6 · Investigate Soon", meaning: "The worker's upper body is under real stress. Changes should be made within weeks." },
      { max: 7, label: "7 · Change Now", meaning: "The highest possible risk. This posture will cause injury. Immediate action required." },
    ],
    purpose: "RULA was developed by ergonomics researchers to quickly flag jobs where arm, shoulder, and neck injuries are likely. It is used in factories, offices, and warehouses worldwide.",
  },
  REBA: {
    name: "Rapid Entire Body Assessment",
    acronym: "REBA",
    measures: "The entire body — neck, trunk, legs, arms, and wrists together",
    scale: "Scored 1–15. Lower is safer. Covers the whole body, not just the upper limbs.",
    thresholds: [
      { max: 3, label: "1–3 · Acceptable", meaning: "The whole-body posture is safe and comfortable." },
      { max: 7, label: "4–7 · Investigate", meaning: "Some body segments are in awkward positions. Review the workstation setup." },
      { max: 10, label: "8–10 · Investigate Soon", meaning: "Multiple body parts are under strain. Changes are needed within weeks." },
      { max: 12, label: "11–12 · Implement Changes", meaning: "High whole-body risk. The worker's back, hips, or legs are at serious risk." },
      { max: 15, label: "13–15 · Change Immediately", meaning: "Maximum risk level. This task will cause serious injury without immediate changes." },
    ],
    purpose: "REBA was designed specifically for jobs that involve unpredictable postures — like lifting, bending, or reaching — where the whole body is at risk, not just the arms.",
  },
  NIOSH: {
    name: "NIOSH Revised Lifting Equation",
    acronym: "NIOSH LI",
    measures: "The safety of a lifting task based on weight, distance, frequency, and posture",
    scale: "Expressed as a Lifting Index (LI). LI < 1 means the lift is safe for most workers. LI > 1 means the lift is too heavy or awkward.",
    thresholds: [
      { max: 1, label: "LI < 1 · Safe", meaning: "The lift is within safe limits for most healthy workers." },
      { max: 2, label: "LI 1–2 · Caution", meaning: "Some workers may be at risk. Consider reducing the load or improving technique." },
      { max: 999, label: "LI > 2 · High Risk", meaning: "The lift is too demanding. Redesign the task — use mechanical aids, reduce load, or change the lift height." },
    ],
    purpose: "Developed by the National Institute for Occupational Safety and Health (NIOSH), this equation calculates the maximum safe weight for a specific lifting task. It is the gold standard for evaluating manual material handling.",
  },
  RSI: {
    name: "Repetitive Strain Index",
    acronym: "RSI",
    measures: "The cumulative stress on muscles and tendons from doing the same motion over and over",
    scale: "Scored 0–100+. Lower is safer. Scores above 20 indicate meaningful repetitive strain risk.",
    thresholds: [
      { max: 10, label: "0–10 · Low Strain", meaning: "The repetition rate and force are within comfortable limits." },
      { max: 20, label: "11–20 · Moderate Strain", meaning: "Repetitive motions are accumulating. Breaks and job rotation are recommended." },
      { max: 40, label: "21–40 · High Strain", meaning: "The worker is at real risk of repetitive strain injuries like tendinitis or carpal tunnel syndrome." },
      { max: 9999, label: "40+ · Very High Strain", meaning: "Serious cumulative trauma risk. Engineering controls — such as tool changes or task redesign — are needed immediately." },
    ],
    purpose: "The RSI captures what RULA and REBA miss: the damage that builds up over time from doing the same motion hundreds of times per shift, even if each individual motion looks fine.",
  },
};

// ─── Joint angle explanations ─────────────────────────────────────────────────

export interface AngleExplanation {
  label: string;
  unit: string;
  safeRange: string;
  plain: string;
  /** Returns a plain-English interpretation for a given angle value */
  interpret: (deg: number) => string;
}

export const ANGLE_EXPLANATIONS: Record<string, AngleExplanation> = {
  neckFlexion: {
    label: "Neck Bend (Forward/Back)",
    unit: "°",
    safeRange: "0–20°",
    plain: "How far the worker's head is tilted forward. Looking down at a table or phone causes this.",
    interpret: (d) => {
      const a = Math.abs(d);
      if (a <= 20) return "Safe — the head is in a neutral, comfortable position.";
      if (a <= 45) return "Caution — the head is tilted forward. This strains the neck muscles and can cause headaches and neck pain over time.";
      return "High risk — the head is severely bent forward. This posture puts up to 5× the normal load on the neck spine.";
    },
  },
  trunkFlexion: {
    label: "Back Bend (Forward/Back)",
    unit: "°",
    safeRange: "0–20°",
    plain: "How far the worker is bending their back forward. Leaning over a workbench causes this.",
    interpret: (d) => {
      const a = Math.abs(d);
      if (a <= 20) return "Safe — the back is upright and well-supported.";
      if (a <= 45) return "Caution — the worker is bending forward. This increases spinal disc pressure and can lead to lower back pain.";
      return "High risk — severe forward bending. This is one of the most common causes of serious back injuries in industrial settings.";
    },
  },
  leftUpperArm: {
    label: "Left Shoulder Elevation",
    unit: "°",
    safeRange: "0–45°",
    plain: "How high the left arm is raised. Reaching overhead or to the side causes this.",
    interpret: (d) => {
      const a = Math.abs(d);
      if (a <= 45) return "Safe — the arm is in a comfortable working position.";
      if (a <= 90) return "Caution — the arm is raised significantly. Sustained overhead work fatigues shoulder muscles quickly.";
      return "High risk — the arm is raised above shoulder height. This dramatically increases the risk of rotator cuff injuries.";
    },
  },
  rightUpperArm: {
    label: "Right Shoulder Elevation",
    unit: "°",
    safeRange: "0–45°",
    plain: "How high the right arm is raised.",
    interpret: (d) => {
      const a = Math.abs(d);
      if (a <= 45) return "Safe — the arm is in a comfortable working position.";
      if (a <= 90) return "Caution — the arm is raised significantly. Sustained overhead work fatigues shoulder muscles quickly.";
      return "High risk — the arm is raised above shoulder height. This dramatically increases the risk of rotator cuff injuries.";
    },
  },
  leftWrist: {
    label: "Left Wrist Bend",
    unit: "°",
    safeRange: "0–15°",
    plain: "How much the left wrist is bent or twisted. Using tools at awkward angles causes this.",
    interpret: (d) => {
      const a = Math.abs(d);
      if (a <= 15) return "Safe — the wrist is in a neutral, relaxed position.";
      if (a <= 30) return "Caution — the wrist is moderately bent. This increases pressure on the carpal tunnel.";
      return "High risk — severe wrist deviation. This is a primary driver of carpal tunnel syndrome and tendinitis.";
    },
  },
  rightWrist: {
    label: "Right Wrist Bend",
    unit: "°",
    safeRange: "0–15°",
    plain: "How much the right wrist is bent or twisted.",
    interpret: (d) => {
      const a = Math.abs(d);
      if (a <= 15) return "Safe — the wrist is in a neutral, relaxed position.";
      if (a <= 30) return "Caution — the wrist is moderately bent. This increases pressure on the carpal tunnel.";
      return "High risk — severe wrist deviation. This is a primary driver of carpal tunnel syndrome and tendinitis.";
    },
  },
  hipFlexion: {
    label: "Hip Bend",
    unit: "°",
    safeRange: "0–60°",
    plain: "How much the worker is bending at the hips. Sitting or squatting causes this.",
    interpret: (d) => {
      const a = Math.abs(d);
      if (a <= 60) return "Safe — hip position is within normal working range.";
      if (a <= 90) return "Caution — significant hip flexion. Prolonged sitting or crouching in this position can compress spinal discs.";
      return "High risk — extreme hip flexion. This posture puts severe stress on the lower back and hip joints.";
    },
  },
  leftKnee: {
    label: "Left Knee Bend",
    unit: "°",
    safeRange: "0–60°",
    plain: "How bent the left knee is. Kneeling or squatting causes this.",
    interpret: (d) => {
      const a = Math.abs(d);
      if (a <= 60) return "Safe — the knee is in a comfortable position.";
      if (a <= 90) return "Caution — the knee is significantly bent. Prolonged kneeling increases knee joint pressure.";
      return "High risk — extreme knee flexion. This posture can damage knee cartilage and cause chronic knee pain.";
    },
  },
  rightKnee: {
    label: "Right Knee Bend",
    unit: "°",
    safeRange: "0–60°",
    plain: "How bent the right knee is.",
    interpret: (d) => {
      const a = Math.abs(d);
      if (a <= 60) return "Safe — the knee is in a comfortable position.";
      if (a <= 90) return "Caution — the knee is significantly bent. Prolonged kneeling increases knee joint pressure.";
      return "High risk — extreme knee flexion. This posture can damage knee cartilage and cause chronic knee pain.";
    },
  },
};

// ─── Overall summary generator ────────────────────────────────────────────────

export interface PlainSummary {
  headline: string;
  oneLiner: string;
  topConcerns: string[];
  bottomLine: string;
}

export function generatePlainSummary(
  rulaScore: number,
  rebaScore: number,
  nioshLI: number,
  rsiScore: number,
  overallRisk: RiskLevel,
): PlainSummary {
  const riskExp = RISK_EXPLANATIONS[overallRisk];
  const concerns: string[] = [];

  if (rulaScore >= 5) concerns.push(`Upper body stress (RULA ${rulaScore.toFixed(1)}/7): The worker's arms, shoulders, or neck are in positions that cause strain.`);
  if (rebaScore >= 8) concerns.push(`Whole-body risk (REBA ${rebaScore.toFixed(1)}/15): Multiple body parts are under significant load simultaneously.`);
  if (nioshLI > 1) concerns.push(`Lifting load (NIOSH LI ${nioshLI.toFixed(1)}): The weight being handled exceeds safe limits for this task setup.`);
  if (rsiScore > 20) concerns.push(`Repetitive strain (RSI ${rsiScore.toFixed(0)}): The task is performed so frequently that cumulative damage is building up.`);

  if (concerns.length === 0) {
    concerns.push("No significant risk factors detected in this session.");
  }

  const bottomLines: Record<RiskLevel, string> = {
    negligible: "This task is safe as currently performed. No changes are needed.",
    low: "This task is mostly safe. Minor workstation adjustments could improve comfort.",
    medium: "This task needs attention. Schedule a workstation review and consider simple changes like adjusting table height or tool grip.",
    high: "This task poses a real injury risk. Assign a corrective action owner and implement changes within 1–2 weeks.",
    "very-high": "Stop or modify this task immediately. The risk of serious injury is high. Escalate to management and your safety team today.",
  };

  return {
    headline: riskExp.headline,
    oneLiner: riskExp.plain,
    topConcerns: concerns,
    bottomLine: bottomLines[overallRisk],
  };
}
