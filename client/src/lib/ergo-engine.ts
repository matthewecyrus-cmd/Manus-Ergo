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
 *
 * SCORING ENGINE (June 2026): RULA/REBA and joint-angle computation are now
 * delegated to the validated Pose2Sim engine in ./pose2sim-engine. That engine
 * is a verbatim port of ErgoKit_latest.html, proven numerically identical to the
 * validated source (see __tests__/pose2sim-engine.parity.test.ts). The functions
 * below (extractAngles / calcRULA / calcREBA) are thin adapters that translate
 * between Manus's BodyAngles/ScoreResult/TaskProfile types and the engine.
 */

import {
  calcAngles as p2sCalcAngles,
  calcRULA as p2sCalcRULA,
  calcREBA as p2sCalcREBA,
  type P2SAngles,
  type P2STaskInputs,
} from './pose2sim-engine';

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
  notApplicable?: boolean; // true when method does not apply to this task type
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
  /**
   * Raw output of the validated Pose2Sim engine for this frame. Carries the
   * boolean posture flags (shoulderRaised, armAbducted, laCross, wrBent,
   * bilateral) and signed joint angles that BodyAngles cannot represent.
   * calcRULA/calcREBA score from THIS object, not the mapped fields above, so
   * the scores match the validated engine exactly. Survives validateAngles()
   * (which spreads). Optional only so hand-built test fixtures stay valid.
   */
  _p2s?: P2SAngles;
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
  loadWeight: 0,        // No load assumed until user configures task
  repRate: 1,           // Low repetition rate — conservative default
  cycleDuration: 30,    // 30s cycle — non-repetitive default
  horizontalDistance: 25,
  verticalOrigin: 75,
  verticalDestination: 100,
  asymmetryAngle: 0,
  coupling: 'good',     // Good coupling assumed until user configures
  duration: 'short',    // Short duration — conservative default
  dominantSide: 'right',
};

// ─── CONFIDENCE THRESHOLD ────────────────────────────────────────────
export const VISIBILITY_THRESHOLD = 0.65;

// ─── MOTION PROFILE SYSTEM ───────────────────────────────────────────────────
/**
 * A MotionProfile describes the expected range of motion for a task category.
 * It overrides per-joint anatomical limits where the task-specific safe range
 * differs from the absolute physiological maximum, and sets the tracking-quality
 * thresholds appropriate for the expected motion complexity.
 *
 * Profiles:
 *   'standing-carry'  — worker is upright, carrying/handling objects at waist-
 *                       to-shoulder height. Deep knee flexion is NOT expected;
 *                       the relevant knee risk is hyperextension (>160°) which
 *                       indicates a lunge or stumble. Flags deep flexion (<100°).
 *   'squat-lift'      — worker performs repetitive squat-to-stand lifts. Deep
 *                       knee flexion (down to 90°) is expected and normal;
 *                       hyperextension (>165°) is the artifact to flag.
 *   'dynamic'         — high-speed, whole-body tasks (sport, manual handling
 *                       with rotation, overhead work). Wide knee ROM expected;
 *                       only extreme values (<30° or >170°) are artifacts.
 *                       Tracking quality thresholds are relaxed because fast
 *                       motion inherently causes more landmark jitter.
 *   'sedentary'       — seated or near-stationary assembly. Knees are near
 *                       90° flexion; values outside 60–130° are artifacts.
 *                       Tracking quality thresholds are strict.
 */
export type MotionProfileKey = 'standing-carry' | 'squat-lift' | 'dynamic' | 'sedentary';

export interface MotionProfile {
  key: MotionProfileKey;
  label: string;
  description: string;
  /** Override knee limits (min/max degrees, 0=full extension, 180=full flexion) */
  kneeMin: number;
  kneeMax: number;
  /** Knee safe display range for the report (values outside this are highlighted red) */
  kneeSafeMin: number;
  kneeSafeMax: number;
  /** Tracking quality thresholds: fraction of clamped frames */
  trackingGood: number;  // below this → Good
  trackingFair: number;  // below this → Fair (above → Poor)
}

export const MOTION_PROFILES: Record<MotionProfileKey, MotionProfile> = {
  'standing-carry': {
    key: 'standing-carry',
    label: 'Standing / Carry',
    description: 'Upright work, carrying or handling objects at waist-to-shoulder height.',
    // Standing workers flex knees ~10–30° normally; deep flexion (<100°) is a lunge artifact
    // or genuine risk; hyperextension (>160°) is a stumble artifact.
    kneeMin: 100,
    kneeMax: 160,
    kneeSafeMin: 110,
    kneeSafeMax: 155,
    trackingGood: 0.20,
    trackingFair: 0.40,
  },
  'squat-lift': {
    key: 'squat-lift',
    label: 'Squat / Lift',
    description: 'Repetitive squat-to-stand lifts; deep knee flexion is expected.',
    // Deep squat reaches ~90° flexion (angle=90°); hyperextension >165° is artifact.
    kneeMin: 60,
    kneeMax: 165,
    kneeSafeMin: 70,
    kneeSafeMax: 160,
    trackingGood: 0.25,
    trackingFair: 0.50,
  },
  'dynamic': {
    key: 'dynamic',
    label: 'Dynamic / Sport',
    description: 'High-speed whole-body tasks: throwing, overhead work, manual handling with rotation.',
    // Very wide ROM expected; only extreme values are artifacts.
    kneeMin: 30,
    kneeMax: 170,
    kneeSafeMin: 40,
    kneeSafeMax: 165,
    trackingGood: 0.40,
    trackingFair: 0.65,
  },
  'sedentary': {
    key: 'sedentary',
    label: 'Sedentary / Assembly',
    description: 'Seated or near-stationary work; knees near 90° throughout.',
    // Seated: knees ~80–100°; values outside 60–130° are artifacts.
    kneeMin: 60,
    kneeMax: 130,
    kneeSafeMin: 70,
    kneeSafeMax: 120,
    trackingGood: 0.15,
    trackingFair: 0.35,
  },
};

export const DEFAULT_MOTION_PROFILE: MotionProfileKey = 'standing-carry';

/**
 * Infer a sensible default motion profile from the task name string.
 * Used when the user has not explicitly chosen a profile.
 */
export function inferMotionProfile(taskName: string): MotionProfileKey {
  const lower = taskName.toLowerCase();
  if (/squat|lift|floor|crouch|kneel/.test(lower)) return 'squat-lift';
  if (/throw|bowl|sport|swing|overhead|dynamic|run|jump|carry.*throw|throw.*carry/.test(lower)) return 'dynamic';
  if (/sit|seat|desk|assembly|bench|station/.test(lower)) return 'sedentary';
  return 'standing-carry';
}

// ─── ANATOMICAL PLAUSIBILITY GUARD (ITEM 4) ───────────────────────────────────
/**
 * Per-joint absolute range limits (degrees).
 * Values outside these bounds are anatomically impossible for a healthy adult
 * and indicate a tracking artifact (landmark flip, occlusion, or model error).
 *
 * Sources:
 *   - Neck flexion/extension: Kapandji 2008 (0–80° flex, 0–50° ext)
 *   - Trunk flexion: White & Panjabi 1990 (0–90°)
 *   - Upper arm elevation: shoulder ROM 0–180° (abduction/flexion)
 *   - Lower arm (elbow): 0–150° flexion (0° = full extension)
 *   - Wrist deviation: 0–90° (combined flex/ext/radial/ulnar)
 *   - Knee: 0–150° flexion (0° = full extension)
 *   - Hip flexion: 0–120° (standing to seated)
 *
 * Any angle outside [0, maxPlausible] is clamped to the boundary AND flagged
 * as low-confidence so downstream scoring can apply a conservative fallback.
 */
export const ANATOMICAL_LIMITS: Record<keyof BodyAngles, { min: number; max: number }> = {
  neckFlexion:           { min: 0,   max: 80  },
  neckLateral:           { min: 0,   max: 45  },
  trunkFlexion:          { min: 0,   max: 90  },
  trunkLateral:          { min: 0,   max: 45  },
  trunkRotation:         { min: 0,   max: 45  },
  leftUpperArm:          { min: 0,   max: 180 },
  rightUpperArm:         { min: 0,   max: 180 },
  leftLowerArm:          { min: 0,   max: 150 },
  rightLowerArm:         { min: 0,   max: 150 },
  leftWrist:             { min: 0,   max: 90  },
  rightWrist:            { min: 0,   max: 90  },
  leftKnee:              { min: 0,   max: 150 },
  rightKnee:             { min: 0,   max: 150 },
  hipFlexion:            { min: 0,   max: 120 },
  leftShoulderAbduction: { min: 0,   max: 180 },
  rightShoulderAbduction:{ min: 0,   max: 180 },
  leftForearmCross:      { min: 0,   max: 90  },
  rightForearmCross:     { min: 0,   max: 90  },
};

/**
 * Validate and clamp a BodyAngles object against anatomical limits.
 * Returns:
 *   - angles: clamped copy (values within plausible range)
 *   - implausibleJoints: list of joint names that were outside limits
 *   - lowConfidence: true if any joint was implausible (caller should flag the frame)
 *
 * Clamping strategy: we clamp to the boundary rather than discarding the frame
 * entirely, because a partially-visible frame still contains useful information
 * for other joints. The implausibleJoints list lets scoring functions apply
 * conservative fallbacks for only the affected joints.
 */
export function validateAngles(raw: BodyAngles, profile?: MotionProfile): {
  angles: BodyAngles;
  implausibleJoints: string[];
  lowConfidence: boolean;
} {
  const angles = { ...raw };
  const implausibleJoints: string[] = [];

  for (const key of Object.keys(ANATOMICAL_LIMITS) as (keyof BodyAngles)[]) {
    // Use profile-specific knee limits when a profile is provided
    let min: number;
    let max: number;
    if (profile && (key === 'leftKnee' || key === 'rightKnee')) {
      min = profile.kneeMin;
      max = profile.kneeMax;
    } else {
      ({ min, max } = ANATOMICAL_LIMITS[key]);
    }
    const v = angles[key];
    if (v < min || v > max) {
      implausibleJoints.push(key);
      // Clamp to nearest boundary
      (angles as Record<string, number>)[key] = Math.max(min, Math.min(max, v));
    }
  }

  return {
    angles,
    implausibleJoints,
    lowConfidence: implausibleJoints.length > 0,
  };
}

/**
 * Confidence threshold below which a frame is considered low-confidence
 * for scoring purposes. Frames with avgConfidence < this value are still
 * processed but their scores are down-weighted in the outlier filter.
 * (Separate from VISIBILITY_THRESHOLD which gates individual joints.)
 */
export const LOW_CONFIDENCE_FRAME_THRESHOLD = 0.55;

// ─── EMA FILTER ──────────────────────────────────────────────────────────────
/**
 * Exponential Moving Average filter state.
 * alpha: smoothing factor 0–1. Lower = smoother but more lag.
 * Recommended: 0.25 for ergonomics (good balance of responsiveness vs. stability)
 */
export class EMAFilter {
  private state: Record<number, Landmark> = {};
  // MAX_JUMP: maximum allowed normalized displacement per frame (0.0–1.0 of frame width)
  // Landmarks that jump more than this are clamped to prevent "shooting off" artifacts
  // during fast motion where MediaPipe returns spurious high-confidence predictions
  private readonly MAX_JUMP = 0.18;

  constructor(private alpha: number = 0.25) {}

  /** Apply EMA with velocity clamping to a full landmarks array. Returns smoothed copy. */
  smooth(raw: Landmarks): Landmarks {
    return raw.map((lm, i) => {
      const prev = this.state[i];
      if (!prev) {
        this.state[i] = { ...lm };
        return { ...lm };
      }

      // Velocity clamp: limit how far a landmark can move in one frame
      // This suppresses tracking jump artifacts during fast motion
      const dx = lm.x - prev.x;
      const dy = lm.y - prev.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let cx = lm.x, cy = lm.y;
      if (dist > this.MAX_JUMP) {
        const scale = this.MAX_JUMP / dist;
        cx = prev.x + dx * scale;
        cy = prev.y + dy * scale;
      }

      const smoothed: Landmark = {
        x: this.alpha * cx + (1 - this.alpha) * prev.x,
        y: this.alpha * cy + (1 - this.alpha) * prev.y,
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
export function extractAngles(lm: Landmarks, isWorld: boolean = false): { angles: BodyAngles; avgConfidence: number } {
  // Average detection confidence over the key load-bearing joints (unchanged
  // metric — still used by computeSnapshot's visibility gate).
  const keyJoints = [
    MP.LEFT_SHOULDER, MP.RIGHT_SHOULDER, MP.LEFT_ELBOW, MP.RIGHT_ELBOW,
    MP.LEFT_WRIST, MP.RIGHT_WRIST, MP.LEFT_HIP, MP.RIGHT_HIP,
    MP.LEFT_KNEE, MP.RIGHT_KNEE,
  ];
  const avgConfidence = keyJoints.reduce((s, i) => s + (lm[i]?.visibility ?? 0), 0) / keyJoints.length;

  // Run the validated Pose2Sim engine. Pass worldLandmarks with isWorld=true
  // (the validated path); image landmarks with isWorld=false are a fallback.
  const p = p2sCalcAngles(
    lm as unknown as { x: number; y: number; z: number; visibility?: number }[],
    isWorld,
  );

  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  // Map the engine's angle object into Manus's BodyAngles for the heat-map,
  // body-region rollup, and the plausibility-guard tracking metric. SCORING
  // does NOT use these mapped fields — calcRULA/calcREBA read angles._p2s — so
  // approximations here (boolean flags expanded to representative angles, hip
  // proxied by trunk) never affect RULA/REBA validity.
  const angles: BodyAngles = {
    neckFlexion: clamp(p.nf, 0, 90),
    neckLateral: clamp(p.ns, 0, 90),
    trunkFlexion: clamp(p.tf, 0, 90),
    trunkLateral: clamp(p.ts, 0, 90),
    trunkRotation: clamp(p.trunkRot, 0, 90),
    leftUpperArm: clamp(Math.abs(p.joints.lShoulder), 0, 180),
    rightUpperArm: clamp(Math.abs(p.joints.rShoulder), 0, 180),
    leftLowerArm: clamp(Math.abs(p.joints.lElbow), 0, 180),
    rightLowerArm: clamp(Math.abs(p.joints.rElbow), 0, 180),
    leftWrist: clamp(Math.abs(p.joints.lWrist), 0, 90),
    rightWrist: clamp(Math.abs(p.joints.rWrist), 0, 90),
    // Engine knee = flexion from straight (0=straight); BodyAngles knee =
    // included angle (180=straight). Convert.
    leftKnee: clamp(180 - Math.abs(p.joints.lKnee), 0, 180),
    rightKnee: clamp(180 - Math.abs(p.joints.rKnee), 0, 180),
    hipFlexion: clamp(p.tf, 0, 90),
    leftShoulderAbduction: p.armAbducted ? 45 : 0,
    rightShoulderAbduction: p.armAbducted ? 45 : 0,
    leftForearmCross: p.laCross ? 16 : 0,
    rightForearmCross: p.laCross ? 16 : 0,
    _p2s: p,
  };

  _lastValidAngles = angles;
  return { angles, avgConfidence };
}

// ─── RULA CALCULATOR ─────────────────────────────────────────────────────────
/**
 * Map Manus's rich TaskProfile onto the validated engine's 3-tap inputs.
 *   load: kg bucket → 0 light / 1 medium / 2 heavy (RULA & REBA force bands)
 *   freq: +1 muscle-use (RULA) / activity (REBA) when posture is sustained
 *         (duration not 'short') or repeated ≥4×/min
 *   grip: coupling good→0, fair→1, poor→2
 */
function taskToP2STi(task: TaskProfile): P2STaskInputs {
  const load = task.loadWeight >= 10 ? 2 : task.loadWeight >= 2 ? 1 : 0;
  const freq = (task.repRate >= 4 || task.duration !== 'short') ? 1 : 0;
  const grip = task.coupling === 'poor' ? 2 : task.coupling === 'fair' ? 1 : 0;
  return { load, freq, grip };
}

export function calcRULA(angles: BodyAngles, task: TaskProfile, confidence: number): ScoreResult {
  const p = angles._p2s;
  if (!p) {
    return {
      score: 0, riskLevel: 'negligible', actionLevel: 0,
      interpretation: 'No pose data for this frame.',
      components: {}, confidence, notApplicable: true,
    };
  }
  const r = p2sCalcRULA(p, taskToP2STi(task));
  const grandScore = r.fs;

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
    components: {
      upperArm: r.ua, lowerArm: r.la, wrist: r.wr, neck: r.nk, trunk: r.tr, legs: r.lg,
      armWristScore: r.wristArmScore, neckTrunkScore: r.neckTrunkLegScore,
    },
    confidence,
  };
}

// ─── REBA CALCULATOR ─────────────────────────────────────────────────────────
export function calcREBA(angles: BodyAngles, task: TaskProfile, confidence: number): ScoreResult {
  const p = angles._p2s;
  if (!p) {
    return {
      score: 0, riskLevel: 'negligible', actionLevel: 0,
      interpretation: 'No pose data for this frame.',
      components: {}, confidence, notApplicable: true,
    };
  }
  const r = p2sCalcREBA(p, taskToP2STi(task));
  const rebaScore = r.fs;

  let actionLevel = 0;
  if (rebaScore >= 11) actionLevel = 4;
  else if (rebaScore >= 8) actionLevel = 3;
  else if (rebaScore >= 4) actionLevel = 2;
  else if (rebaScore >= 2) actionLevel = 1;

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

  const riskLevel: RiskLevel = rebaScore >= 11 ? 'very-high' : rebaScore >= 8 ? 'high' : rebaScore >= 4 ? 'medium' : rebaScore >= 2 ? 'low' : 'negligible';

  return {
    score: rebaScore,
    riskLevel,
    actionLevel,
    interpretation: interpretations[Math.min(rebaScore, 11)] ?? 'Very high risk. Implement changes immediately.',
    components: {
      neck: r.nk, trunk: r.tr, legs: r.lg, upperArm: r.ua, lowerArm: r.la, wrist: r.wr,
      postureScoreA: r.scoreA, postureScoreB: r.scoreB,
    },
    confidence,
  };
}

// ─── NIOSH LIFTING EQUATION ───────────────────────────────────────────────────
export function calcNIOSH(task: TaskProfile, confidence: number): ScoreResult {
  const { loadWeight, horizontalDistance, verticalOrigin, verticalDestination,
    asymmetryAngle, coupling, duration } = task;

  // Applicability check: NIOSH LI is only valid for manual lifting tasks with a defined load
  if (!loadWeight || loadWeight <= 0) {
    return {
      score: 0,
      riskLevel: 'negligible',
      actionLevel: 0,
      interpretation: 'N/A — NIOSH Lifting Index requires a defined load weight. Set load weight in Task Configuration to enable this score.',
      components: {},
      confidence: 0,
      notApplicable: true,
    };
  }

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
  // Applicability: valid only for repetitive distal upper extremity tasks (repRate ≥ 2/min)
  if (task.repRate < 2) {
    return {
      score: 0,
      riskLevel: 'negligible',
      actionLevel: 0,
      interpretation: 'N/A — Strain Index applies to repetitive distal upper extremity tasks. Set repetitions/min ≥ 2 in Task Configuration to enable this score.',
      components: {},
      confidence: 0,
      notApplicable: true,
    };
  }

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

/// ─── FULL SNAPSHOT CALCULATOR ────────────────────────────────────────────
export function computeSnapshot(
  smoothedLandmarks: Landmarks,
  task: TaskProfile,
  motionProfile?: MotionProfile,
  isWorld: boolean = false,
): ErgoSnapshot | null {
  const { angles: rawAngles, avgConfidence } = extractAngles(smoothedLandmarks, isWorld);
  if (avgConfidence < 0.3) return null; // not enough body visible

  // ITEM 4: Anatomical plausibility guard.
  // Clamp any joint angle that falls outside its published physiological range.
  // This prevents tracking artifacts (landmark flips, occlusion glitches) from
  // inflating RULA/REBA scores. Implausible joints are logged; if any are found
  // the frame is treated as low-confidence (confidence capped at 0.5) so the
  // outlier filter in summarizeSession is more likely to exclude it.
  // When a motionProfile is provided, knee limits are overridden to match the
  // expected ROM for the task category (e.g. standing-carry vs squat-lift).
  const { angles, implausibleJoints, lowConfidence } = validateAngles(rawAngles, motionProfile);
  const effectiveConfidence = lowConfidence
    ? Math.min(avgConfidence, LOW_CONFIDENCE_FRAME_THRESHOLD)
    : avgConfidence;

  if (implausibleJoints.length > 0 && process.env.NODE_ENV !== 'production') {
    // Development-only diagnostic: log which joints were clamped
    console.debug(
      `[ErgoKit] Plausibility guard clamped ${implausibleJoints.length} joint(s): ${implausibleJoints.join(', ')}`,
    );
  }

  const rula = calcRULA(angles, task, effectiveConfidence);
  const reba = calcREBA(angles, task, effectiveConfidence);
  const niosh = calcNIOSH(task, effectiveConfidence);
  const rsi = calcRSI(angles, task, effectiveConfidence);
  const { overallRisk, overallScore } = aggregateRisk([rula, reba, niosh, rsi]);

  return {
    timestamp: Date.now(),
    rula, reba, niosh, rsi,
    angles, overallRisk, overallScore,
  };
}

// ─── RISK COLOR HELPERS───────────────────────────────────────────────────────
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
  /** Peak integer RULA score (worst single frame) — the methodologically correct headline score */
  peakRula: number;
  /** Peak integer REBA score (worst single frame) — the methodologically correct headline score */
  peakReba: number;
  /** Index into snapshots[] of the peak RULA frame */
  peakRulaFrame: number;
  /** Index into snapshots[] of the peak REBA frame */
  peakRebaFrame: number;
  /** Percentage of frames in high or very-high risk (REBA ≥8) */
  timeInHighRiskPct: number;
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
  /**
   * FIX 3: Joint angles from the peak-posture frame (the frame that produced the
   * peak RULA score). These are the authoritative angles that justify the headline
   * score. Recommendations and corrective actions are derived from this frame.
   * Source: snapshots[peakRulaFrame].angles
   */
  peakAngles?: Record<string, number>;
  /** Frame index (within snapshots[]) that peakAngles was taken from */
  peakAnglesFrame?: number;
  /**
   * Number of frames where the plausibility guard clamped at least one joint angle.
   * Used for the Tracking Quality indicator in the session report header.
   * A high ratio (clampedFrames / snapshots.length) suggests unreliable tracking.
   */
  clampedFrames: number;
  /**
   * Sustained peak RULA score — the highest RULA score that was maintained for
   * at least 3 consecutive frames. Filters out single-frame spikes caused by
   * tracking artifacts. More actionable than the absolute peak for intervention planning.
   */
  sustainedPeakRula: number;
  /**
   * Sustained peak REBA score — the highest REBA score maintained for ≥3 consecutive
   * frames. Same rationale as sustainedPeakRula.
   */
  sustainedPeakReba: number;
  /**
   * Motion profile key used for this session's plausibility guard and tracking
   * quality thresholds. Persisted so the PDF badge is always reproducible.
   */
  motionProfileKey: MotionProfileKey;
  /**
   * Computed tracking quality label using the profile-specific thresholds.
   * 'good' | 'fair' | 'poor' — persisted so the PDF badge is always reproducible.
   */
  trackingQuality: 'good' | 'fair' | 'poor';
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
/**
 * FIX 3: generateRecommendations now accepts a single peak-posture snapshot
 * (the frame that produced the peak RULA score) in addition to the full snapshot
 * array. When peakSnapshot is provided, joint-angle thresholds are evaluated
 * against the peak-frame angles, and recommendation text references that frame
 * explicitly (e.g. "at peak posture") rather than "averaged".
 *
 * The full snapshots array is still used for task-level metrics (repRate, NIOSH)
 * and for the fallback path when no peak snapshot is available.
 */
export function generateRecommendations(
  snapshots: ErgoSnapshot[],
  task: TaskProfile,
  peakSnapshot?: ErgoSnapshot,
): string[] {
  if (!snapshots.length) return [];
  const recs: string[] = [];

  // Use peak-frame angles when available; fall back to clip averages
  const usePeak = !!peakSnapshot;
  const angles = peakSnapshot?.angles;

  const avgA = (fn: (s: ErgoSnapshot) => number) =>
    snapshots.reduce((s, x) => s + fn(x), 0) / snapshots.length;

  const neckFlex  = angles ? angles.neckFlexion  : avgA(s => s.angles.neckFlexion);
  const trunkFlex = angles ? angles.trunkFlexion : avgA(s => s.angles.trunkFlexion);
  const trunkRot  = angles ? angles.trunkRotation : avgA(s => s.angles.trunkRotation);
  const maxUA     = angles ? Math.max(angles.leftUpperArm, angles.rightUpperArm) : avgA(s => Math.max(s.angles.leftUpperArm, s.angles.rightUpperArm));
  const maxWr     = angles ? Math.max(angles.leftWrist, angles.rightWrist) : avgA(s => Math.max(s.angles.leftWrist, s.angles.rightWrist));

  // For score-level recommendations, use peak scores (not averages)
  const peakRula = peakSnapshot ? peakSnapshot.rula.score : avgA(s => s.rula.score);
  const peakReba = peakSnapshot ? peakSnapshot.reba.score : avgA(s => s.reba.score);

  const nioshLI = task.loadWeight / Math.max(0.01, 23 * (task.horizontalDistance > 0 ? Math.min(1, 25 / task.horizontalDistance) : 1));

  const qualifier = usePeak ? 'at peak posture' : 'on average';

  if (neckFlex > 20) recs.push(`Neck flexion ${qualifier}: ${neckFlex.toFixed(0)}°. Raise the work surface or monitor to bring the head to a neutral position (0–10°).`);
  if (trunkFlex > 20) recs.push(`Trunk flexion ${qualifier}: ${trunkFlex.toFixed(0)}°. Adjust workstation height to allow an upright posture. Consider a height-adjustable table.`);
  if (trunkRot > 15) recs.push(`Trunk rotation ${qualifier}: ${trunkRot.toFixed(0)}°. Reposition materials to the front of the worker to eliminate twisting.`);
  if (maxUA > 45) recs.push(`Shoulder elevation ${qualifier}: ${maxUA.toFixed(0)}°. Lower the work surface or use a tool with an extended handle to reduce overhead reach.`);
  if (maxWr > 15) recs.push(`Wrist deviation ${qualifier}: ${maxWr.toFixed(0)}°. Use a neutral-grip tool or reorient the work piece to straighten the wrist.`);
  if (task.repRate > 10) recs.push(`Repetition rate of ${task.repRate} reps/min is high. Introduce job rotation every 30–60 minutes to distribute exposure.`);
  if (task.loadWeight > 15) recs.push(`Load weight of ${task.loadWeight} kg exceeds recommended limits. Use a mechanical assist (hoist, lift table, or cart) for loads above 15 kg.`);
  if (nioshLI > 1) recs.push(`NIOSH Lifting Index of ${nioshLI.toFixed(2)} indicates risk. Reduce load, shorten horizontal reach, or raise the lift origin height.`);
  if (peakRula >= 5) recs.push(`Peak RULA score of ${peakRula} requires prompt investigation. Conduct a detailed ergonomics review with a qualified ergonomist.`);
  if (peakReba >= 8) recs.push(`Peak REBA score of ${peakReba} indicates high whole-body risk. Prioritize engineering controls before administrative measures.`);
  if (task.duration === 'long' && task.repRate > 4) recs.push('Long-duration repetitive task. Schedule mandatory micro-breaks every 20–30 minutes and provide stretching guidance.');

  if (recs.length === 0) recs.push('Posture and task parameters are within acceptable limits. Continue to monitor and reassess if the task changes.');
  return recs;
}

// ─── AUTO-GENERATE CORRECTIVE ACTIONS ────────────────────────────────────────────
// FIX 3: generateActions now accepts an optional peakSnapshot so that action
// descriptions reference peak-posture angles, not clip averages.
export function generateActions(snapshots: ErgoSnapshot[], task: TaskProfile, peakSnapshot?: ErgoSnapshot): CorrectiveAction[] {
  const recs = generateRecommendations(snapshots, task, peakSnapshot);
  // Use peak scores for priority determination (not averages)
  const peakRula = peakSnapshot ? peakSnapshot.rula.score : (snapshots.length ? Math.max(...snapshots.map(s => s.rula.score)) : 0);
  const peakReba = peakSnapshot ? peakSnapshot.reba.score : (snapshots.length ? Math.max(...snapshots.map(s => s.reba.score)) : 0);

  return recs.map((rec, i) => ({
    id: `ACT-${Date.now().toString(36).toUpperCase()}-${i}`,
    description: rec,
    category: rec.includes('mechanical') || rec.includes('height') || rec.includes('tool') ? 'engineering' :
               rec.includes('rotation') || rec.includes('break') ? 'administrative' : 'engineering',
    priority: (peakRula >= 6 || peakReba >= 10) ? 'critical' : (peakRula >= 4 || peakReba >= 7) ? 'high' : 'medium',
    status: 'open',
    riskDriver: rec.split('.')[0],
  }));
}
export function summarizeSession(
  snapshots: ErgoSnapshot[],
  task: TaskProfile,
  durationSec: number,
  source: SessionSource = 'camera',
  meta?: { assessor?: string; department?: string; location?: string; notes?: string; thumbnailDataUrl?: string; motionProfileKey?: MotionProfileKey },
): SessionRecord {
  // Outlier filtering: remove snapshots where REBA is a statistical outlier
  // (>2.5 std deviations from median) — these are tracking artifact frames from fast motion
  // Only filter if we have enough samples to compute reliable statistics
  let filteredSnapshots = snapshots;
  if (snapshots.length >= 10) {
    const rebaScores = snapshots.map(s => s.reba.score);
    const sorted = [...rebaScores].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const mean = rebaScores.reduce((a, b) => a + b, 0) / rebaScores.length;
    const variance = rebaScores.reduce((s, v) => s + (v - mean) ** 2, 0) / rebaScores.length;
    const stdDev = Math.sqrt(variance);
    const threshold = 2.5;
    filteredSnapshots = snapshots.filter(s => Math.abs(s.reba.score - median) <= threshold * stdDev);
    // Ensure we don't filter out too many frames (keep at least 70%)
    if (filteredSnapshots.length < snapshots.length * 0.7) filteredSnapshots = snapshots;
  }

  const avg = (fn: (s: ErgoSnapshot) => number) =>
    filteredSnapshots.length ? filteredSnapshots.reduce((s, x) => s + fn(x), 0) / filteredSnapshots.length : 0;

  const peakRisk = snapshots.reduce<RiskLevel>((max, s) => {
    return RISK_ORDER.indexOf(s.overallRisk) > RISK_ORDER.indexOf(max) ? s.overallRisk : max;
  }, 'negligible');

  // Peak integer scores — the methodologically correct headline scores for RULA/REBA
  // (ordinal scales must not be averaged; peak worst-frame is the standard reporting value)
  let peakRulaScore = 0;
  let peakRebaScore = 0;
  let peakRulaFrame = 0;
  let peakRebaFrame = 0;
  filteredSnapshots.forEach((s, i) => {
    if (s.rula.score > peakRulaScore) { peakRulaScore = s.rula.score; peakRulaFrame = i; }
    if (s.reba.score > peakRebaScore) { peakRebaScore = s.reba.score; peakRebaFrame = i; }
  });
  const timeInHighRiskPct = filteredSnapshots.length
    ? Math.round(filteredSnapshots.filter(s => s.reba.score >= 8).length / filteredSnapshots.length * 100)
    : 0;

  // ── Tracking quality: count frames clamped by the plausibility guard ──────
  // computeSnapshot caps confidence to LOW_CONFIDENCE_FRAME_THRESHOLD (0.55) when
  // any joint was implausible. We use that as a proxy for "clamped frame".
  const clampedFrames = filteredSnapshots.filter(
    s => s.rula.confidence <= LOW_CONFIDENCE_FRAME_THRESHOLD ||
         s.reba.confidence <= LOW_CONFIDENCE_FRAME_THRESHOLD
  ).length;

  // ── Resolve motion profile and tracking quality thresholds ───────────────
  const motionProfileKey: MotionProfileKey = meta?.motionProfileKey
    ?? inferMotionProfile(task.taskName);
  const resolvedProfile = MOTION_PROFILES[motionProfileKey];
  const clampRatio = filteredSnapshots.length > 0
    ? clampedFrames / filteredSnapshots.length
    : 0;
  const trackingQuality: 'good' | 'fair' | 'poor' =
    clampRatio < resolvedProfile.trackingGood ? 'good'
    : clampRatio < resolvedProfile.trackingFair ? 'fair'
    : 'poor';

  // ── Sustained peak scores (≥3 consecutive frames at that level) ──────────
  // Sliding-window: find the highest score that appears in any run of ≥3
  // consecutive frames. Falls back to the absolute peak if no run exists.
  function sustainedPeak(scores: number[]): number {
    if (scores.length < 3) return scores.length ? Math.max(...scores) : 0;
    let best = 0;
    for (let i = 0; i <= scores.length - 3; i++) {
      const window = [scores[i], scores[i + 1], scores[i + 2]];
      const windowMin = Math.min(...window);
      if (windowMin > best) best = windowMin;
    }
    // If no 3-frame run found (all windows have variance), fall back to absolute peak
    return best > 0 ? best : Math.max(...scores);
  }
  const sustainedPeakRula = sustainedPeak(filteredSnapshots.map(s => s.rula.score));
  const sustainedPeakReba = sustainedPeak(filteredSnapshots.map(s => s.reba.score));

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
    peakRula: peakRulaScore,
    peakReba: peakRebaScore,
    peakRulaFrame,
    peakRebaFrame,
    timeInHighRiskPct,
    peakRisk,
    taskProfile: task,
    source,
    assessor: meta?.assessor,
    department: meta?.department,
    location: meta?.location,
    notes: meta?.notes,
    thumbnailDataUrl: meta?.thumbnailDataUrl,
    // FIX 3: Pass the peak RULA snapshot so recommendations and actions reference
    // the worst-posture frame, not clip averages.
    actions: generateActions(filteredSnapshots, task, filteredSnapshots[peakRulaFrame]),
    bodyRegions: buildBodyRegions(filteredSnapshots),
    recommendations: generateRecommendations(filteredSnapshots, task, filteredSnapshots[peakRulaFrame]),
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
    // FIX 3: Store the peak-frame angles separately so the report can display them
    // as the authoritative evidence for the headline score.
    peakAngles: filteredSnapshots.length ? {
      neckFlexion:   Math.round((filteredSnapshots[peakRulaFrame]?.angles.neckFlexion   ?? 0) * 10) / 10,
      trunkFlexion:  Math.round((filteredSnapshots[peakRulaFrame]?.angles.trunkFlexion  ?? 0) * 10) / 10,
      leftUpperArm:  Math.round((filteredSnapshots[peakRulaFrame]?.angles.leftUpperArm  ?? 0) * 10) / 10,
      rightUpperArm: Math.round((filteredSnapshots[peakRulaFrame]?.angles.rightUpperArm ?? 0) * 10) / 10,
      leftWrist:     Math.round((filteredSnapshots[peakRulaFrame]?.angles.leftWrist     ?? 0) * 10) / 10,
      rightWrist:    Math.round((filteredSnapshots[peakRulaFrame]?.angles.rightWrist    ?? 0) * 10) / 10,
      hipFlexion:    Math.round((filteredSnapshots[peakRulaFrame]?.angles.hipFlexion    ?? 0) * 10) / 10,
      leftKnee:      Math.round((filteredSnapshots[peakRulaFrame]?.angles.leftKnee      ?? 0) * 10) / 10,
      rightKnee:     Math.round((filteredSnapshots[peakRulaFrame]?.angles.rightKnee     ?? 0) * 10) / 10,
    } : undefined,
    peakAnglesFrame: peakRulaFrame,
    clampedFrames,
    sustainedPeakRula,
    sustainedPeakReba,
    motionProfileKey,
    trackingQuality,
  };
}
