/**
 * ErgoKit — Enterprise Ergonomics Engine
 * =========================================
 * Fully automated inference from MediaPipe BlazePose landmarks.
 *
 * Signal processing:
 *   1. EMA (Exponential Moving Average) jitter filter — smooths frame-to-frame noise
 *   2. Confidence / visibility gating — ignores joints below 65% confidence
 *   3. Torso-normalized 3D vector math — prevents false readings on body rotation
 *
 * Scoring algorithms:
 *   - RULA  (Rapid Upper Limb Assessment)
 *   - REBA  (Rapid Entire Body Assessment)
 *   - NIOSH Lifting Equation (Revised)
 *   - RSI   (Repetitive Strain Index)
 */

// ─── MediaPipe landmark indices (BlazePose 33-point model) ───────────────────
export const MP = {
  NOSE: 0,
  LEFT_EYE: 2, RIGHT_EYE: 5,
  LEFT_EAR: 7, RIGHT_EAR: 8,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_PINKY: 17, RIGHT_PINKY: 18,
  LEFT_INDEX: 19, RIGHT_INDEX: 20,
  LEFT_THUMB: 21, RIGHT_THUMB: 22,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
  LEFT_HEEL: 29, RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32,
} as const;

// ─── Core types ──────────────────────────────────────────────────────────────
export interface Vec3 { x: number; y: number; z: number }

export interface Landmark extends Vec3 {
  visibility?: number; // 0–1 confidence from MediaPipe
}

export type Landmarks = Landmark[];

export type RiskLevel = 'negligible' | 'low' | 'medium' | 'high' | 'very-high';

export interface ScoreResult {
  score: number;
  riskLevel: RiskLevel;
  actionLevel: number;
  interpretation: string;
  components: Record<string, number>;
  confidence: number; // 0–1 average joint confidence used
}

export interface ErgoSnapshot {
  timestamp: number;
  rula: ScoreResult;
  reba: ScoreResult;
  niosh: ScoreResult;
  rsi: ScoreResult;
  angles: BodyAngles;
  overallRisk: RiskLevel;
  overallScore: number;
  /** Raw smoothed landmarks — stored for video replay overlay */
  landmarks?: Landmark[];
}

export interface BodyAngles {
  neckFlexion: number;
  neckLateral: number;
  trunkFlexion: number;
  trunkLateral: number;
  trunkRotation: number;
  leftUpperArm: number;
  rightUpperArm: number;
  leftLowerArm: number;
  rightLowerArm: number;
  leftWrist: number;
  rightWrist: number;
  leftKnee: number;
  rightKnee: number;
  hipFlexion: number;
  /** Shoulder abduction — arm raised out to the side (degrees). RULA/REBA +1 penalty ≥45°. */
  leftShoulderAbduction: number;
  rightShoulderAbduction: number;
  /** Forearm crossing midline — positive = arm crosses body center. RULA lower-arm +1 penalty. */
  leftForearmCross: number;
  rightForearmCross: number;
}

export interface TaskProfile {
  taskName: string;
  /** kg — object weight for NIOSH */
  loadWeight: number;
  /** repetitions per minute */
  repRate: number;
  /** seconds per cycle */
  cycleDuration: number;
  /** horizontal distance from body to load (cm) for NIOSH */
  horizontalDistance: number;
  /** vertical origin height (cm) for NIOSH */
  verticalOrigin: number;
  /** vertical destination height (cm) for NIOSH */
  verticalDestination: number;
  /** asymmetry angle (degrees) for NIOSH */
  asymmetryAngle: number;
  /** coupling quality: 'good' | 'fair' | 'poor' */
  coupling: 'good' | 'fair' | 'poor';
  /** duration: 'short' (<1hr) | 'moderate' (1–2hr) | 'long' (>2hr) */
  duration: 'short' | 'moderate' | 'long';
  /** dominant side for RSI */
  dominantSide: 'left' | 'right' | 'bilateral';
}

export const DEFAULT_TASK_PROFILE: TaskProfile = {
  taskName: 'General Task',
  loadWeight: 5,
  repRate: 10,
  cycleDuration: 6,
  horizontalDistance: 30,
  verticalOrigin: 75,
  verticalDestination: 100,
  asymmetryAngle: 0,
  coupling: 'fair',
  duration: 'moderate',
  dominantSide: 'right',
};

// ─── CONFIDENCE THRESHOLD ────────────────────────────────────────────────────
export const VISIBILITY_THRESHOLD = 0.65;

// ─── EMA FILTER ──────────────────────────────────────────────────────────────
/**
 * Exponential Moving Average filter state.
 * alpha: smoothing factor 0–1. Lower = smoother but more lag.
 * Recommended: 0.25 for ergonomics (good balance of responsiveness vs. stability)
 */
export class EMAFilter {
  private state: Record<number, Landmark> = {};
  constructor(private alpha: number = 0.25) {}

  /** Apply EMA to a full landmarks array. Returns smoothed copy. */
  smooth(raw: Landmarks): Landmarks {
    return raw.map((lm, i) => {
      const prev = this.state[i];
      if (!prev) {
        this.state[i] = { ...lm };
        return { ...lm };
      }
      const smoothed: Landmark = {
        x: this.alpha * lm.x + (1 - this.alpha) * prev.x,
        y: this.alpha * lm.y + (1 - this.alpha) * prev.y,
        z: this.alpha * lm.z + (1 - this.alpha) * prev.z,
        visibility: lm.visibility,
      };
      this.state[i] = smoothed;
      return smoothed;
    });
  }

  reset() { this.state = {}; }
}

// ─── VECTOR MATH ─────────────────────────────────────────────────────────────
function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function mag(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}
function norm(v: Vec3): Vec3 {
  const m = mag(v) || 1e-9;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Angle (degrees) between vectors BA and BC at vertex B.
 */
function angleBetween(a: Vec3, b: Vec3, c: Vec3): number {
  const ba = norm(sub(a, b));
  const bc = norm(sub(c, b));
  const cosTheta = Math.max(-1, Math.min(1, dot(ba, bc)));
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

/**
 * Project vector v onto the plane defined by normal n.
 */
function projectOntoPlane(v: Vec3, n: Vec3): Vec3 {
  const nn = norm(n);
  const d = dot(v, nn);
  return { x: v.x - d * nn.x, y: v.y - d * nn.y, z: v.z - d * nn.z };
}

/**
 * Torso coordinate frame from shoulder and hip midpoints.
 * Returns { forward, up, right } unit vectors.
 */
function torsoFrame(lm: Landmarks): { forward: Vec3; up: Vec3; right: Vec3 } | null {
  const ls = lm[MP.LEFT_SHOULDER], rs = lm[MP.RIGHT_SHOULDER];
  const lh = lm[MP.LEFT_HIP], rh = lm[MP.RIGHT_HIP];
  if (
    (ls.visibility ?? 0) < VISIBILITY_THRESHOLD ||
    (rs.visibility ?? 0) < VISIBILITY_THRESHOLD ||
    (lh.visibility ?? 0) < VISIBILITY_THRESHOLD ||
    (rh.visibility ?? 0) < VISIBILITY_THRESHOLD
  ) return null;

  const midShoulder: Vec3 = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2, z: (ls.z + rs.z) / 2 };
  const midHip: Vec3 = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2, z: (lh.z + rh.z) / 2 };

  const up = norm(sub(midShoulder, midHip));
  const right = norm(sub(rs, ls));
  const forward = norm(cross(right, up));

  return { forward, up, right };
}

/**
 * Confidence-gated angle: returns null if any joint is below threshold.
 */
function gatedAngle(
  lm: Landmarks,
  a: number, b: number, c: number
): { angle: number; confidence: number } | null {
  const la = lm[a], lb = lm[b], lc = lm[c];
  const minVis = Math.min(la.visibility ?? 0, lb.visibility ?? 0, lc.visibility ?? 0);
  if (minVis < VISIBILITY_THRESHOLD) return null;
  return {
    angle: angleBetween(la, lb, lc),
    confidence: minVis,
  };
}

// ─── HOLD-LAST-VALID ANGLE STATE ─────────────────────────────────────────────
// When a joint drops below the visibility threshold we return the previous
// valid value instead of 0°. This eliminates the "all-green flash" on occlusion.
let _lastValidAngles: BodyAngles | null = null;
/** Reset hold-last-valid state (call when starting a new session). */
export function resetAngleState() { _lastValidAngles = null; }

// ─── BODY ANGLE EXTRACTION ───────────────────────────────────────────────────
export function extractAngles(lm: Landmarks): { angles: BodyAngles; avgConfidence: number } {
  const frame = torsoFrame(lm);
  const prev = _lastValidAngles;

  function safeAngle(a: number, b: number, c: number, fallback: number): number {
    const r = gatedAngle(lm, a, b, c);
    return r ? r.angle : fallback;
  }

  // Neck flexion: ear–shoulder–hip plane, torso-normalized
  let neckFlexion = 0;
  let neckLateral = 0;
  if (frame) {
    const ls = lm[MP.LEFT_SHOULDER], rs = lm[MP.RIGHT_SHOULDER];
    const midShoulder: Vec3 = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2, z: (ls.z + rs.z) / 2 };
    const nose = lm[MP.NOSE];
    if ((nose.visibility ?? 0) >= VISIBILITY_THRESHOLD) {
      const headVec = sub(nose, midShoulder);
      const headInPlane = projectOntoPlane(headVec, frame.right); // sagittal plane
      const headLateral = projectOntoPlane(headVec, frame.forward); // frontal plane
      neckFlexion = (Math.atan2(dot(headInPlane, frame.forward), dot(headInPlane, frame.up)) * 180) / Math.PI;
      neckLateral = Math.abs((Math.atan2(dot(headLateral, frame.right), dot(headLateral, frame.up)) * 180) / Math.PI);
    }
  }

  // Trunk flexion (torso-normalized)
  let trunkFlexion = 0, trunkLateral = 0, trunkRotation = 0;
  if (frame) {
    const lh = lm[MP.LEFT_HIP], rh = lm[MP.RIGHT_HIP];
    const midHip: Vec3 = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2, z: (lh.z + rh.z) / 2 };
    const ls = lm[MP.LEFT_SHOULDER], rs = lm[MP.RIGHT_SHOULDER];
    const midShoulder: Vec3 = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2, z: (ls.z + rs.z) / 2 };
    const spineVec = sub(midShoulder, midHip);
    // Flexion: angle in sagittal plane from vertical
    const sagittal = projectOntoPlane(spineVec, frame.right);
    trunkFlexion = Math.abs((Math.atan2(dot(sagittal, frame.forward), dot(sagittal, frame.up)) * 180) / Math.PI);
    // Lateral: angle in frontal plane
    const frontal = projectOntoPlane(spineVec, frame.forward);
    trunkLateral = Math.abs((Math.atan2(dot(frontal, frame.right), dot(frontal, frame.up)) * 180) / Math.PI);
    // Rotation: shoulder vs hip alignment
    const shoulderVec = norm(sub(rs, ls));
    const hipVec = norm(sub(rh, lh));
    const rotCos = Math.max(-1, Math.min(1, dot(shoulderVec, hipVec)));
    trunkRotation = (Math.acos(rotCos) * 180) / Math.PI;
  }

  // Upper arm angles (shoulder–elbow relative to torso)
  const leftUpperArm  = safeAngle(MP.LEFT_HIP,  MP.LEFT_SHOULDER,  MP.LEFT_ELBOW,  prev?.leftUpperArm  ?? 0);
  const rightUpperArm = safeAngle(MP.RIGHT_HIP, MP.RIGHT_SHOULDER, MP.RIGHT_ELBOW, prev?.rightUpperArm ?? 0);

  // Lower arm (elbow angle)
  const leftLowerArm  = safeAngle(MP.LEFT_SHOULDER,  MP.LEFT_ELBOW,  MP.LEFT_WRIST,  prev?.leftLowerArm  ?? 90);
  const rightLowerArm = safeAngle(MP.RIGHT_SHOULDER, MP.RIGHT_ELBOW, MP.RIGHT_WRIST, prev?.rightLowerArm ?? 90);

  // Wrist deviation
  const leftWrist  = safeAngle(MP.LEFT_ELBOW,  MP.LEFT_WRIST,  MP.LEFT_INDEX,  prev?.leftWrist  ?? 0);
  const rightWrist = safeAngle(MP.RIGHT_ELBOW, MP.RIGHT_WRIST, MP.RIGHT_INDEX, prev?.rightWrist ?? 0);

  // Knee angles
  const leftKnee  = safeAngle(MP.LEFT_HIP,  MP.LEFT_KNEE,  MP.LEFT_ANKLE,  prev?.leftKnee  ?? 180);
  const rightKnee = safeAngle(MP.RIGHT_HIP, MP.RIGHT_KNEE, MP.RIGHT_ANKLE, prev?.rightKnee ?? 180);

  // Hip flexion
  const hipFlexion = safeAngle(MP.LEFT_SHOULDER, MP.LEFT_HIP, MP.LEFT_KNEE, prev?.hipFlexion ?? 180);

  // Average confidence of key joints
  const keyJoints = [
    MP.LEFT_SHOULDER, MP.RIGHT_SHOULDER, MP.LEFT_ELBOW, MP.RIGHT_ELBOW,
    MP.LEFT_WRIST, MP.RIGHT_WRIST, MP.LEFT_HIP, MP.RIGHT_HIP,
    MP.LEFT_KNEE, MP.RIGHT_KNEE,
  ];
  const avgConfidence = keyJoints.reduce((s, i) => s + (lm[i]?.visibility ?? 0), 0) / keyJoints.length;

  // Shoulder abduction — arm raised out to the side (torso-frame projection)
  let leftShoulderAbduction  = prev?.leftShoulderAbduction  ?? 0;
  let rightShoulderAbduction = prev?.rightShoulderAbduction ?? 0;
  if (frame) {
    const ls = lm[MP.LEFT_SHOULDER],  le2 = lm[MP.LEFT_ELBOW];
    const rs = lm[MP.RIGHT_SHOULDER], re2 = lm[MP.RIGHT_ELBOW];
    if ((ls.visibility ?? 0) >= VISIBILITY_THRESHOLD && (le2.visibility ?? 0) >= VISIBILITY_THRESHOLD) {
      const lArmVec = norm(sub(le2, ls));
      leftShoulderAbduction = Math.abs((Math.asin(Math.max(-1, Math.min(1, dot(lArmVec, frame.right)))) * 180) / Math.PI);
    }
    if ((rs.visibility ?? 0) >= VISIBILITY_THRESHOLD && (re2.visibility ?? 0) >= VISIBILITY_THRESHOLD) {
      const rArmVec = norm(sub(re2, rs));
      rightShoulderAbduction = Math.abs((Math.asin(Math.max(-1, Math.min(1, dot(rArmVec, frame.right)))) * 180) / Math.PI);
    }
  }

  // Forearm crossing midline (RULA lower-arm penalty)
  let leftForearmCross  = prev?.leftForearmCross  ?? 0;
  let rightForearmCross = prev?.rightForearmCross ?? 0;
  if (frame) {
    const le3 = lm[MP.LEFT_ELBOW],  lw2 = lm[MP.LEFT_WRIST];
    const re3 = lm[MP.RIGHT_ELBOW], rw2 = lm[MP.RIGHT_WRIST];
    if ((le3.visibility ?? 0) >= VISIBILITY_THRESHOLD && (lw2.visibility ?? 0) >= VISIBILITY_THRESHOLD) {
      const lForeVec = norm(sub(lw2, le3));
      leftForearmCross = Math.max(0, dot(lForeVec, frame.right) * 90);
    }
    if ((re3.visibility ?? 0) >= VISIBILITY_THRESHOLD && (rw2.visibility ?? 0) >= VISIBILITY_THRESHOLD) {
      const rForeVec = norm(sub(rw2, re3));
      rightForearmCross = Math.max(0, -dot(rForeVec, frame.right) * 90);
    }
  }

  const angles: BodyAngles = {
    neckFlexion, neckLateral, trunkFlexion, trunkLateral, trunkRotation,
    leftUpperArm, rightUpperArm, leftLowerArm, rightLowerArm,
    leftWrist, rightWrist, leftKnee, rightKnee, hipFlexion,
    leftShoulderAbduction, rightShoulderAbduction,
    leftForearmCross, rightForearmCross,
  };
  _lastValidAngles = angles;
  return { angles, avgConfidence };
}

// ─── RULA CALCULATOR ─────────────────────────────────────────────────────────
export function calcRULA(angles: BodyAngles, task: TaskProfile, confidence: number): ScoreResult {
  const a = angles;

  // Upper arm score (RULA Table 1)
  let upperArm = 1;
  const ua = Math.max(a.leftUpperArm, a.rightUpperArm);
  if (ua > 90) upperArm = 4;
  else if (ua > 45) upperArm = 3;
  else if (ua > 20) upperArm = 2;
  // +1 if shoulder is abducted ≥45° (arm raised out to side)
  if (Math.max(a.leftShoulderAbduction ?? 0, a.rightShoulderAbduction ?? 0) >= 45) upperArm += 1;

  // Lower arm score (RULA Table 2)
  let lowerArm = 1;
  const la = Math.min(a.leftLowerArm, a.rightLowerArm); // elbow angle
  if (la < 60 || la > 100) lowerArm = 2;
  // +1 if forearm crosses midline
  if (Math.max(a.leftForearmCross ?? 0, a.rightForearmCross ?? 0) > 15) lowerArm = Math.min(3, lowerArm + 1);

  // Wrist score
  let wrist = 1;
  const wr = Math.max(a.leftWrist, a.rightWrist);
  if (wr > 30) wrist = 3;
  else if (wr > 15) wrist = 2;

  // Neck score
  let neck = 1;
  if (a.neckFlexion > 30) neck = 4;
  else if (a.neckFlexion > 20) neck = 3;
  else if (a.neckFlexion > 10) neck = 2;
  if (a.neckLateral > 10) neck += 1;

  // Trunk score (RULA Table 5 — floor is 1 for 0–10°, neutral standing = no penalty)
  let trunk = 1;
  if (a.trunkFlexion > 60) trunk = 4;
  else if (a.trunkFlexion > 20) trunk = 3;
  else if (a.trunkFlexion > 10) trunk = 2;
  // 0–10° = 1 (neutral, no penalty)
  if (a.trunkLateral > 10) trunk += 1;
  if (a.trunkRotation > 15) trunk += 1;

  // Muscle use modifier
  const muscleScore = task.repRate > 4 ? 1 : 0;
  // Force/load modifier
  const forceScore = task.loadWeight > 10 ? 3 : task.loadWeight > 2 ? 2 : 0;

  // RULA table lookup (simplified validated formula)
  const armWristScore = Math.min(7, upperArm + lowerArm + wrist + muscleScore + forceScore);
  const neckTrunkScore = Math.min(7, neck + trunk + muscleScore + forceScore);
  const grandScore = Math.min(7, Math.round((armWristScore + neckTrunkScore) / 2) + 1);

  let actionLevel = 1;
  if (grandScore >= 7) actionLevel = 4;
  else if (grandScore >= 5) actionLevel = 3;
  else if (grandScore >= 3) actionLevel = 2;

  const interpretations: Record<number, string> = {
    1: 'Acceptable posture. Investigate if sustained.',
    2: 'Acceptable posture. Investigate if sustained.',
    3: 'Further investigation required. Changes may be needed.',
    4: 'Further investigation required. Changes may be needed.',
    5: 'Investigate and implement changes soon.',
    6: 'Investigate and implement changes soon.',
    7: 'Implement changes immediately.',
  };

  const riskLevel: RiskLevel = grandScore >= 7 ? 'very-high' : grandScore >= 5 ? 'high' : grandScore >= 3 ? 'medium' : 'low';

  return {
    score: grandScore,
    riskLevel,
    actionLevel,
    interpretation: interpretations[grandScore] ?? 'Evaluate posture.',
    components: { upperArm, lowerArm, wrist, neck, trunk, muscleScore, forceScore },
    confidence,
  };
}

// ─── REBA CALCULATOR ─────────────────────────────────────────────────────────
export function calcREBA(angles: BodyAngles, task: TaskProfile, confidence: number): ScoreResult {
  const a = angles;

  // Neck
  let neck = 1;
  if (a.neckFlexion > 20 || a.neckFlexion < 0) neck = 2;
  if (a.neckLateral > 10) neck += 1;

  // Trunk (REBA Table A — floor is 1 for 0–10°, neutral upright = no penalty)
  let trunk = 1;
  if (a.trunkFlexion > 60) trunk = 4;
  else if (a.trunkFlexion > 20) trunk = 3;
  else if (a.trunkFlexion > 10) trunk = 2;
  // 0–10° = 1 (neutral, no penalty)
  if (a.trunkLateral > 10) trunk += 1;
  if (a.trunkRotation > 15) trunk += 1;

  // Legs (simplified — use knee angle as proxy)
  const kneeAngle = Math.max(a.leftKnee, a.rightKnee);
  let legs = 1;
  if (kneeAngle < 150) legs = 2; // bent
  if (kneeAngle < 120) legs = 3; // deeply bent

  // Upper arm (REBA Table B)
  const ua = Math.max(a.leftUpperArm, a.rightUpperArm);
  let upperArm = 1;
  if (ua > 90) upperArm = 4;
  else if (ua > 45) upperArm = 3;
  else if (ua > 20) upperArm = 2;
  // +1 if shoulder is abducted ≥45°
  if (Math.max(a.leftShoulderAbduction ?? 0, a.rightShoulderAbduction ?? 0) >= 45) upperArm += 1;

  // Lower arm
  const la = Math.min(a.leftLowerArm, a.rightLowerArm);
  const lowerArm = (la >= 60 && la <= 100) ? 1 : 2;

  // Wrist
  const wr = Math.max(a.leftWrist, a.rightWrist);
  let wristScore = 1;
  if (wr > 15) wristScore = 2;

  // Load/force
  const loadScore = task.loadWeight > 10 ? 3 : task.loadWeight > 5 ? 2 : 0;
  // Coupling
  const couplingScore = { good: 0, fair: 1, poor: 2 }[task.coupling];
  // Activity
  const activityScore = task.repRate > 4 ? 1 : 0;

  const tableA = Math.min(9, neck + trunk + legs);
  const tableB = Math.min(9, upperArm + lowerArm + wristScore);
  const scoreC = Math.min(12, tableA + tableB);
  const rebaScore = Math.min(15, scoreC + loadScore + couplingScore + activityScore);

  let actionLevel = 0;
  if (rebaScore >= 11) actionLevel = 4;
  else if (rebaScore >= 8) actionLevel = 3;
  else if (rebaScore >= 4) actionLevel = 2;
  else if (rebaScore >= 2) actionLevel = 1;

  const riskLevel: RiskLevel =
    rebaScore >= 11 ? 'very-high' :
    rebaScore >= 8 ? 'high' :
    rebaScore >= 4 ? 'medium' :
    rebaScore >= 2 ? 'low' : 'negligible';

  const interpretations: Record<number, string> = {
    1: 'Negligible risk. No action required.',
    2: 'Low risk. Change may be needed.',
    3: 'Low risk. Change may be needed.',
    4: 'Medium risk. Further investigation, change soon.',
    5: 'Medium risk. Further investigation, change soon.',
    6: 'Medium risk. Further investigation, change soon.',
    7: 'Medium risk. Further investigation, change soon.',
    8: 'High risk. Investigate and implement changes.',
    9: 'High risk. Investigate and implement changes.',
    10: 'High risk. Investigate and implement changes.',
    11: 'Very high risk. Implement changes immediately.',
  };

  return {
    score: rebaScore,
    riskLevel,
    actionLevel,
    interpretation: interpretations[Math.min(rebaScore, 11)] ?? 'Very high risk. Implement changes immediately.',
    components: { neck, trunk, legs, upperArm, lowerArm, wristScore, loadScore, couplingScore, activityScore },
    confidence,
  };
}

// ─── NIOSH LIFTING EQUATION ───────────────────────────────────────────────────
export function calcNIOSH(task: TaskProfile, confidence: number): ScoreResult {
  const { loadWeight, horizontalDistance, verticalOrigin, verticalDestination,
    asymmetryAngle, coupling, duration } = task;

  // Load Constant (LC) = 23 kg (NIOSH standard)
  const LC = 23;

  // Horizontal Multiplier
  const HM = horizontalDistance > 0 ? Math.min(1, 25 / horizontalDistance) : 1;

  // Vertical Multiplier
  const VM = Math.max(0, 1 - 0.003 * Math.abs(verticalOrigin - 75));

  // Distance Multiplier
  const D = Math.abs(verticalDestination - verticalOrigin);
  const DM = D > 0 ? (0.82 + 4.5 / D) : 1;

  // Asymmetry Multiplier
  const AM = Math.max(0, 1 - 0.0032 * asymmetryAngle);

  // Frequency Multiplier (simplified)
  const freqTable: Record<string, number> = { short: 0.94, moderate: 0.88, long: 0.75 };
  const FM = freqTable[duration] ?? 0.88;

  // Coupling Multiplier
  const couplingTable: Record<string, number> = { good: 1.0, fair: 0.95, poor: 0.90 };
  const CM = couplingTable[coupling] ?? 0.95;

  // Recommended Weight Limit
  const RWL = LC * HM * VM * DM * AM * FM * CM;

  // Lifting Index
  const LI = loadWeight / Math.max(0.01, RWL);

  let riskLevel: RiskLevel = 'negligible';
  let interpretation = '';
  if (LI >= 3) { riskLevel = 'very-high'; interpretation = 'LI ≥ 3: Significant risk. Immediate redesign required.'; }
  else if (LI >= 2) { riskLevel = 'high'; interpretation = 'LI ≥ 2: Increased risk. Engineering controls needed.'; }
  else if (LI >= 1) { riskLevel = 'medium'; interpretation = 'LI ≥ 1: Some workers at risk. Administrative controls recommended.'; }
  else { riskLevel = 'low'; interpretation = 'LI < 1: Acceptable lift for most workers.'; }

  return {
    score: Math.round(LI * 100) / 100,
    riskLevel,
    actionLevel: LI >= 3 ? 3 : LI >= 2 ? 2 : LI >= 1 ? 1 : 0,
    interpretation,
    components: { RWL: Math.round(RWL * 10) / 10, HM, VM, DM, AM, FM, CM },
    confidence,
  };
}

// ─── RSI (Repetitive Strain Index) ───────────────────────────────────────────
export function calcRSI(angles: BodyAngles, task: TaskProfile, confidence: number): ScoreResult {
  // RSI = IE × EF × AD × WP × SP × DP
  // Based on Moore & Garg (1995) Strain Index

  // Intensity of Exertion (IE) — proxy from load
  const IE = task.loadWeight > 10 ? 9 : task.loadWeight > 5 ? 5 : task.loadWeight > 2 ? 3 : 1;

  // Exertion Frequency (EF) — reps/min
  const EF = task.repRate > 20 ? 9 : task.repRate > 10 ? 6 : task.repRate > 4 ? 3 : 1;

  // Activity Duration (AD) — seconds per cycle
  const AD = task.cycleDuration > 30 ? 9 : task.cycleDuration > 10 ? 6 : task.cycleDuration > 4 ? 3 : 1;

  // Wrist Posture (WP) — from wrist angle
  const wristAngle = Math.max(angles.leftWrist, angles.rightWrist);
  const WP = wristAngle > 40 ? 9 : wristAngle > 25 ? 6 : wristAngle > 15 ? 3 : 1;

  // Speed of Work (SP) — proxy from rep rate
  const SP = task.repRate > 15 ? 6 : task.repRate > 8 ? 3 : 1;

  // Duration per Day (DP)
  const DP = task.duration === 'long' ? 6 : task.duration === 'moderate' ? 3 : 1;

  const rsi = IE * EF * AD * WP * SP * DP;
  // Normalize to 0–100 scale (max theoretical ~531441)
  const normalizedRsi = Math.min(100, Math.round(rsi / 5000 * 100));

  const riskLevel: RiskLevel =
    normalizedRsi >= 70 ? 'very-high' :
    normalizedRsi >= 40 ? 'high' :
    normalizedRsi >= 20 ? 'medium' :
    normalizedRsi >= 5 ? 'low' : 'negligible';

  return {
    score: normalizedRsi,
    riskLevel,
    actionLevel: normalizedRsi >= 70 ? 3 : normalizedRsi >= 40 ? 2 : normalizedRsi >= 20 ? 1 : 0,
    interpretation: normalizedRsi >= 70
      ? 'Very high strain. Immediate intervention required.'
      : normalizedRsi >= 40
      ? 'High strain. Engineering controls recommended.'
      : normalizedRsi >= 20
      ? 'Moderate strain. Monitor and review task design.'
      : 'Low strain. Acceptable for most workers.',
    components: { IE, EF, AD, WP, SP, DP, rawRSI: rsi },
    confidence,
  };
}

// ─── OVERALL RISK AGGREGATOR ─────────────────────────────────────────────────
const RISK_ORDER: RiskLevel[] = ['negligible', 'low', 'medium', 'high', 'very-high'];

export function aggregateRisk(scores: ScoreResult[]): { overallRisk: RiskLevel; overallScore: number } {
  const maxRisk = scores.reduce<RiskLevel>((max, s) => {
    return RISK_ORDER.indexOf(s.riskLevel) > RISK_ORDER.indexOf(max) ? s.riskLevel : max;
  }, 'negligible');

  // Composite 0–10 score
  const rulaNorm = (scores[0]?.score ?? 0) / 7 * 10;
  const rebaNorm = (scores[1]?.score ?? 0) / 15 * 10;
  const nioshNorm = Math.min(10, (scores[2]?.score ?? 0) * 3.33);
  const rsiNorm = (scores[3]?.score ?? 0) / 10;
  const overallScore = Math.round(((rulaNorm + rebaNorm + nioshNorm + rsiNorm) / 4) * 10) / 10;

  return { overallRisk: maxRisk, overallScore };
}

// ─── FULL SNAPSHOT CALCULATOR ────────────────────────────────────────────────
export function computeSnapshot(
  smoothedLandmarks: Landmarks,
  task: TaskProfile,
): ErgoSnapshot | null {
  const { angles, avgConfidence } = extractAngles(smoothedLandmarks);
  if (avgConfidence < 0.3) return null; // not enough body visible

  const rula = calcRULA(angles, task, avgConfidence);
  const reba = calcREBA(angles, task, avgConfidence);
  const niosh = calcNIOSH(task, avgConfidence);
  const rsi = calcRSI(angles, task, avgConfidence);
  const { overallRisk, overallScore } = aggregateRisk([rula, reba, niosh, rsi]);

  return {
    timestamp: Date.now(),
    rula, reba, niosh, rsi,
    angles, overallRisk, overallScore,
  };
}

// ─── RISK COLOR HELPERS ───────────────────────────────────────────────────────
export function riskColor(level: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    negligible: '#16A34A',
    low: '#22C55E',
    medium: '#D97706',
    high: '#DC2626',
    'very-high': '#991B1B',
  };
  return map[level];
}

export function riskBgClass(level: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    negligible: 'bg-green-100 text-green-800 border-green-200',
    low: 'bg-green-100 text-green-800 border-green-200',
    medium: 'bg-amber-100 text-amber-800 border-amber-200',
    high: 'bg-red-100 text-red-800 border-red-200',
    'very-high': 'bg-red-200 text-red-900 border-red-300',
  };
  return map[level];
}

export function riskLabel(level: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    negligible: 'Negligible', low: 'Low', medium: 'Medium', high: 'High', 'very-high': 'Very High',
  };
  return map[level];
}

// ─── CORRECTIVE ACTIONS ──────────────────────────────────────────────────────
export type ActionPriority = 'critical' | 'high' | 'medium' | 'low';
export type ActionStatus = 'open' | 'in-progress' | 'completed' | 'verified';

export interface CorrectiveAction {
  id: string;
  description: string;
  category: 'engineering' | 'administrative' | 'ppe' | 'training';
  priority: ActionPriority;
  status: ActionStatus;
  owner?: string;
  dueDate?: string;
  completedDate?: string;
  notes?: string;
  riskDriver: string; // which body region / score drove this
}

// ─── BODY REGION RISK ────────────────────────────────────────────────────────
export interface BodyRegionRisk {
  region: string;
  score: number;     // 0–10
  riskLevel: RiskLevel;
  primaryAngles: string; // e.g. "Flexion: 35°"
}

// ─── SESSION STORAGE ─────────────────────────────────────────────────────────
export type SessionSource = 'camera' | 'video-upload';

export interface SessionRecord {
  id: string;
  taskName: string;
  date: string;
  duration: number; // seconds
  snapshots: ErgoSnapshot[];
  avgRula: number;
  avgReba: number;
  avgNiosh: number;
  avgRsi: number;
  peakRisk: RiskLevel;
  taskProfile: TaskProfile;
  // New fields
  source: SessionSource;
  assessor?: string;
  department?: string;
  location?: string;
  notes?: string;
  actions: CorrectiveAction[];
  bodyRegions: BodyRegionRisk[];
  recommendations: string[];
  /** ID of a previous session this is a reassessment of */
  baselineSessionId?: string;
  /** Thumbnail data URL from a key frame */
  thumbnailDataUrl?: string;
  /** Object URL of the original video file — for replay with skeleton overlay */
  videoUrl?: string;
  /** Average joint angles across all snapshots */
  avgAngles?: Record<string, number>;
}

// ─── BODY REGION RISK BUILDER ────────────────────────────────────────────────
export function buildBodyRegions(snapshots: ErgoSnapshot[]): BodyRegionRisk[] {
  if (!snapshots.length) return [];
  const avgA = (fn: (s: ErgoSnapshot) => number) =>
    snapshots.reduce((s, x) => s + fn(x), 0) / snapshots.length;

  const score = (raw: number, max: number) => Math.min(10, Math.round((raw / max) * 10 * 10) / 10);
  const rl = (s: number): RiskLevel => s >= 8 ? 'very-high' : s >= 6 ? 'high' : s >= 4 ? 'medium' : s >= 2 ? 'low' : 'negligible';

  const neckFlex = avgA(s => s.angles.neckFlexion);
  const trunkFlex = avgA(s => s.angles.trunkFlexion);
  const trunkRot = avgA(s => s.angles.trunkRotation);
  const lUA = avgA(s => s.angles.leftUpperArm);
  const rUA = avgA(s => s.angles.rightUpperArm);
  const lLA = avgA(s => s.angles.leftLowerArm);
  const rLA = avgA(s => s.angles.rightLowerArm);
  const lWr = avgA(s => s.angles.leftWrist);
  const rWr = avgA(s => s.angles.rightWrist);
  const knee = avgA(s => Math.max(s.angles.leftKnee, s.angles.rightKnee));
  const hip = avgA(s => s.angles.hipFlexion);

  const regions: BodyRegionRisk[] = [
    { region: 'Neck',        score: score(neckFlex, 45),          riskLevel: rl(score(neckFlex, 45)),          primaryAngles: `Flexion: ${neckFlex.toFixed(1)}°` },
    { region: 'Upper Back',  score: score(trunkFlex, 90),         riskLevel: rl(score(trunkFlex, 90)),         primaryAngles: `Flexion: ${trunkFlex.toFixed(1)}°` },
    { region: 'Lower Back',  score: score(trunkRot + trunkFlex * 0.5, 90), riskLevel: rl(score(trunkRot + trunkFlex * 0.5, 90)), primaryAngles: `Rotation: ${trunkRot.toFixed(1)}°` },
    { region: 'L. Shoulder', score: score(lUA, 90),               riskLevel: rl(score(lUA, 90)),               primaryAngles: `Elevation: ${lUA.toFixed(1)}°` },
    { region: 'R. Shoulder', score: score(rUA, 90),               riskLevel: rl(score(rUA, 90)),               primaryAngles: `Elevation: ${rUA.toFixed(1)}°` },
    { region: 'L. Elbow',    score: score(Math.abs(lLA - 90), 90), riskLevel: rl(score(Math.abs(lLA - 90), 90)), primaryAngles: `Angle: ${lLA.toFixed(1)}°` },
    { region: 'R. Elbow',    score: score(Math.abs(rLA - 90), 90), riskLevel: rl(score(Math.abs(rLA - 90), 90)), primaryAngles: `Angle: ${rLA.toFixed(1)}°` },
    { region: 'L. Wrist',    score: score(lWr, 40),               riskLevel: rl(score(lWr, 40)),               primaryAngles: `Deviation: ${lWr.toFixed(1)}°` },
    { region: 'R. Wrist',    score: score(rWr, 40),               riskLevel: rl(score(rWr, 40)),               primaryAngles: `Deviation: ${rWr.toFixed(1)}°` },
    { region: 'Hips',        score: score(hip, 90),               riskLevel: rl(score(hip, 90)),               primaryAngles: `Flexion: ${hip.toFixed(1)}°` },
    { region: 'Knees',       score: score(Math.abs(knee - 180), 90), riskLevel: rl(score(Math.abs(knee - 180), 90)), primaryAngles: `Bend: ${(180 - knee).toFixed(1)}°` },
  ];
  return regions.sort((a, b) => b.score - a.score);
}

// ─── AI RECOMMENDATIONS GENERATOR ────────────────────────────────────────────
export function generateRecommendations(
  snapshots: ErgoSnapshot[],
  task: TaskProfile,
): string[] {
  if (!snapshots.length) return [];
  const recs: string[] = [];
  const avgA = (fn: (s: ErgoSnapshot) => number) =>
    snapshots.reduce((s, x) => s + fn(x), 0) / snapshots.length;

  const neckFlex = avgA(s => s.angles.neckFlexion);
  const trunkFlex = avgA(s => s.angles.trunkFlexion);
  const trunkRot = avgA(s => s.angles.trunkRotation);
  const maxUA = avgA(s => Math.max(s.angles.leftUpperArm, s.angles.rightUpperArm));
  const maxWr = avgA(s => Math.max(s.angles.leftWrist, s.angles.rightWrist));
  const avgRula = avgA(s => s.rula.score);
  const avgReba = avgA(s => s.reba.score);
  const nioshLI = task.loadWeight / Math.max(0.01, 23 * (task.horizontalDistance > 0 ? Math.min(1, 25 / task.horizontalDistance) : 1));

  if (neckFlex > 20) recs.push(`Neck flexion averaged ${neckFlex.toFixed(0)}°. Raise the work surface or monitor to bring the head to a neutral position (0–10°).`);
  if (trunkFlex > 20) recs.push(`Trunk flexion averaged ${trunkFlex.toFixed(0)}°. Adjust workstation height to allow an upright posture. Consider a height-adjustable table.`);
  if (trunkRot > 15) recs.push(`Trunk rotation averaged ${trunkRot.toFixed(0)}°. Reposition materials to the front of the worker to eliminate twisting.`);
  if (maxUA > 45) recs.push(`Shoulder elevation averaged ${maxUA.toFixed(0)}°. Lower the work surface or use a tool with an extended handle to reduce overhead reach.`);
  if (maxWr > 15) recs.push(`Wrist deviation averaged ${maxWr.toFixed(0)}°. Use a neutral-grip tool or reorient the work piece to straighten the wrist.`);
  if (task.repRate > 10) recs.push(`Repetition rate of ${task.repRate} reps/min is high. Introduce job rotation every 30–60 minutes to distribute exposure.`);
  if (task.loadWeight > 15) recs.push(`Load weight of ${task.loadWeight} kg exceeds recommended limits. Use a mechanical assist (hoist, lift table, or cart) for loads above 15 kg.`);
  if (nioshLI > 1) recs.push(`NIOSH Lifting Index of ${nioshLI.toFixed(2)} indicates risk. Reduce load, shorten horizontal reach, or raise the lift origin height.`);
  if (avgRula >= 5) recs.push(`RULA score of ${avgRula.toFixed(1)} requires prompt investigation. Conduct a detailed ergonomics review with a qualified ergonomist.`);
  if (avgReba >= 8) recs.push(`REBA score of ${avgReba.toFixed(1)} indicates high whole-body risk. Prioritize engineering controls before administrative measures.`);
  if (task.duration === 'long' && task.repRate > 4) recs.push('Long-duration repetitive task. Schedule mandatory micro-breaks every 20–30 minutes and provide stretching guidance.');

  if (recs.length === 0) recs.push('Posture and task parameters are within acceptable limits. Continue to monitor and reassess if the task changes.');
  return recs;
}

// ─── AUTO-GENERATE CORRECTIVE ACTIONS ────────────────────────────────────────
export function generateActions(snapshots: ErgoSnapshot[], task: TaskProfile): CorrectiveAction[] {
  const recs = generateRecommendations(snapshots, task);
  const avgA = (fn: (s: ErgoSnapshot) => number) =>
    snapshots.length ? snapshots.reduce((s, x) => s + fn(x), 0) / snapshots.length : 0;
  const avgRula = avgA(s => s.rula.score);
  const avgReba = avgA(s => s.reba.score);

  return recs.map((rec, i) => ({
    id: `ACT-${Date.now().toString(36).toUpperCase()}-${i}`,
    description: rec,
    category: rec.includes('mechanical') || rec.includes('height') || rec.includes('tool') ? 'engineering' :
               rec.includes('rotation') || rec.includes('break') ? 'administrative' : 'engineering',
    priority: (avgRula >= 6 || avgReba >= 10) ? 'critical' : (avgRula >= 4 || avgReba >= 7) ? 'high' : 'medium',
    status: 'open',
    riskDriver: rec.split('.')[0],
  }));
}

export function summarizeSession(
  snapshots: ErgoSnapshot[],
  task: TaskProfile,
  durationSec: number,
  source: SessionSource = 'camera',
  meta?: { assessor?: string; department?: string; location?: string; notes?: string; thumbnailDataUrl?: string },
): SessionRecord {
  const avg = (fn: (s: ErgoSnapshot) => number) =>
    snapshots.length ? snapshots.reduce((s, x) => s + fn(x), 0) / snapshots.length : 0;

  const peakRisk = snapshots.reduce<RiskLevel>((max, s) => {
    return RISK_ORDER.indexOf(s.overallRisk) > RISK_ORDER.indexOf(max) ? s.overallRisk : max;
  }, 'negligible');

  return {
    id: `ERG-${Date.now().toString(36).toUpperCase()}`,
    taskName: task.taskName,
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
    duration: durationSec,
    snapshots,
    avgRula: Math.round(avg(s => s.rula.score) * 10) / 10,
    avgReba: Math.round(avg(s => s.reba.score) * 10) / 10,
    avgNiosh: Math.round(avg(s => s.niosh.score) * 100) / 100,
    avgRsi: Math.round(avg(s => s.rsi.score) * 10) / 10,
    peakRisk,
    taskProfile: task,
    source,
    assessor: meta?.assessor,
    department: meta?.department,
    location: meta?.location,
    notes: meta?.notes,
    thumbnailDataUrl: meta?.thumbnailDataUrl,
    actions: generateActions(snapshots, task),
    bodyRegions: buildBodyRegions(snapshots),
    recommendations: generateRecommendations(snapshots, task),
    avgAngles: snapshots.length ? {
      neckFlexion: Math.round(avg(s => s.angles.neckFlexion) * 10) / 10,
      trunkFlexion: Math.round(avg(s => s.angles.trunkFlexion) * 10) / 10,
      leftUpperArm: Math.round(avg(s => s.angles.leftUpperArm) * 10) / 10,
      rightUpperArm: Math.round(avg(s => s.angles.rightUpperArm) * 10) / 10,
      leftWrist: Math.round(avg(s => s.angles.leftWrist) * 10) / 10,
      rightWrist: Math.round(avg(s => s.angles.rightWrist) * 10) / 10,
      hipFlexion: Math.round(avg(s => s.angles.hipFlexion) * 10) / 10,
      leftKnee: Math.round(avg(s => s.angles.leftKnee) * 10) / 10,
      rightKnee: Math.round(avg(s => s.angles.rightKnee) * 10) / 10,
    } : undefined,
  };
}
