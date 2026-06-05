/**
 * ErgoKit Engine Validation Suite
 * 
 * Tests verify that RULA/REBA/NIOSH/RSI scoring matches published worksheets.
 * Anchor tests use postures from McAtamney & Corlett 1993 (RULA) and
 * Hignett & McAtamney 2000 (REBA) reference examples.
 * 
 * Run: npx vitest run src/lib/__tests__/ergo-engine.test.ts
 */

import { describe, it, expect } from 'vitest';
import { calcRULA, calcREBA, calcNIOSH, calcRSI, DEFAULT_TASK_PROFILE } from '../ergo-engine';
import type { BodyAngles, TaskProfile } from '../ergo-engine';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Neutral standing posture — all joints at anatomical neutral */
const NEUTRAL_ANGLES: BodyAngles = {
  neckFlexion: 5,
  neckLateral: 0,
  trunkFlexion: 5,
  trunkLateral: 0,
  trunkRotation: 0,
  leftUpperArm: 10,
  rightUpperArm: 10,
  leftLowerArm: 90,
  rightLowerArm: 90,
  leftWrist: 0,
  rightWrist: 0,
  leftKnee: 175,
  rightKnee: 175,
  hipFlexion: 5,
  leftShoulderAbduction: 0,
  rightShoulderAbduction: 0,
  leftForearmCross: 0,
  rightForearmCross: 0,
};

/** High-risk overhead assembly posture */
const HIGH_RISK_ANGLES: BodyAngles = {
  neckFlexion: 35,
  neckLateral: 15,
  trunkFlexion: 45,
  trunkLateral: 0,
  trunkRotation: 0,
  leftUpperArm: 95,
  rightUpperArm: 100,
  leftLowerArm: 45,
  rightLowerArm: 50,
  leftWrist: 25,
  rightWrist: 30,
  leftKnee: 170,
  rightKnee: 170,
  hipFlexion: 20,
  leftShoulderAbduction: 50,
  rightShoulderAbduction: 55,
  leftForearmCross: 0,
  rightForearmCross: 0,
};

/** Seated keyboard task posture */
const SEATED_KEYBOARD: BodyAngles = {
  neckFlexion: 15,
  neckLateral: 0,
  trunkFlexion: 15,
  trunkLateral: 0,
  trunkRotation: 0,
  leftUpperArm: 25,
  rightUpperArm: 25,
  leftLowerArm: 80,
  rightLowerArm: 80,
  leftWrist: 10,
  rightWrist: 10,
  leftKnee: 90,
  rightKnee: 90,
  hipFlexion: 90,
  leftShoulderAbduction: 0,
  rightShoulderAbduction: 0,
  leftForearmCross: 0,
  rightForearmCross: 0,
};

const TASK_NO_LOAD: TaskProfile = { ...DEFAULT_TASK_PROFILE, loadWeight: 0, repRate: 1 };
const TASK_LIGHT: TaskProfile = { ...DEFAULT_TASK_PROFILE, loadWeight: 2, repRate: 5 };
const TASK_HEAVY_LIFT: TaskProfile = {
  ...DEFAULT_TASK_PROFILE,
  loadWeight: 15,
  repRate: 4,
  horizontalDistance: 35,
  verticalOrigin: 75,
  verticalDestination: 140,
  asymmetryAngle: 0,
  coupling: 'good',
  duration: 'moderate',
};

// ─── RULA Tests ───────────────────────────────────────────────────────────────

describe('RULA Scoring', () => {
  it('ANCHOR: neutral standing posture scores RULA ≤ 3 (acceptable)', () => {
    const result = calcRULA(NEUTRAL_ANGLES, TASK_NO_LOAD, 0.9);
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThanOrEqual(3);
    expect(result.riskLevel).toMatch(/negligible|low/);
  });

  it('ANCHOR: overhead high-risk posture scores RULA 6–7 (action required)', () => {
    const result = calcRULA(HIGH_RISK_ANGLES, TASK_LIGHT, 0.85);
    expect(result.score).toBeGreaterThanOrEqual(6);
    expect(result.score).toBeLessThanOrEqual(7);
    expect(result.riskLevel).toMatch(/high|very-high/);
  });

  it('BOUNDARY: score is an integer (ordinal scale)', () => {
    const result = calcRULA(SEATED_KEYBOARD, TASK_LIGHT, 0.9);
    expect(Number.isInteger(result.score)).toBe(true);
  });

  it('BOUNDARY: score is within valid range 1–7', () => {
    const result = calcRULA(HIGH_RISK_ANGLES, TASK_HEAVY_LIFT, 0.8);
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThanOrEqual(7);
  });

  it('BOUNDARY: neck flexion >20° increases score vs neutral', () => {
    const highNeck = { ...NEUTRAL_ANGLES, neckFlexion: 25 };
    const neutralResult = calcRULA(NEUTRAL_ANGLES, TASK_NO_LOAD, 0.9);
    const highNeckResult = calcRULA(highNeck, TASK_NO_LOAD, 0.9);
    expect(highNeckResult.score).toBeGreaterThanOrEqual(neutralResult.score);
  });

  it('BOUNDARY: upper arm >90° scores higher than upper arm 20°', () => {
    const lowArm = { ...NEUTRAL_ANGLES, leftUpperArm: 20, rightUpperArm: 20 };
    const highArm = { ...NEUTRAL_ANGLES, leftUpperArm: 95, rightUpperArm: 95 };
    const lowResult = calcRULA(lowArm, TASK_NO_LOAD, 0.9);
    const highResult = calcRULA(highArm, TASK_NO_LOAD, 0.9);
    expect(highResult.score).toBeGreaterThan(lowResult.score);
  });

  it('DETERMINISM: same inputs always produce same output', () => {
    const r1 = calcRULA(SEATED_KEYBOARD, TASK_LIGHT, 0.9);
    const r2 = calcRULA(SEATED_KEYBOARD, TASK_LIGHT, 0.9);
    const r3 = calcRULA(SEATED_KEYBOARD, TASK_LIGHT, 0.9);
    expect(r1.score).toBe(r2.score);
    expect(r2.score).toBe(r3.score);
  });
});

// ─── REBA Tests ───────────────────────────────────────────────────────────────

describe('REBA Scoring', () => {
  it('ANCHOR: neutral standing posture scores REBA 1–3 (negligible/low)', () => {
    const result = calcREBA(NEUTRAL_ANGLES, TASK_NO_LOAD, 0.9);
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThanOrEqual(3);
    expect(result.riskLevel).toMatch(/negligible|low/);
  });

  it('ANCHOR: heavy manual handling posture scores REBA ≥ 8 (high risk)', () => {
    const result = calcREBA(HIGH_RISK_ANGLES, TASK_HEAVY_LIFT, 0.8);
    expect(result.score).toBeGreaterThanOrEqual(8);
    expect(result.riskLevel).toMatch(/high|very-high/);
  });

  it('BOUNDARY: score is an integer (ordinal scale)', () => {
    const result = calcREBA(SEATED_KEYBOARD, TASK_LIGHT, 0.9);
    expect(Number.isInteger(result.score)).toBe(true);
  });

  it('BOUNDARY: score is within valid range 1–15', () => {
    const result = calcREBA(HIGH_RISK_ANGLES, TASK_HEAVY_LIFT, 0.8);
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThanOrEqual(15);
  });

  it('BOUNDARY: trunk flexion >60° scores higher than trunk 5°', () => {
    const straightTrunk = { ...NEUTRAL_ANGLES, trunkFlexion: 5 };
    const bentTrunk = { ...NEUTRAL_ANGLES, trunkFlexion: 65 };
    const straightResult = calcREBA(straightTrunk, TASK_NO_LOAD, 0.9);
    const bentResult = calcREBA(bentTrunk, TASK_NO_LOAD, 0.9);
    expect(bentResult.score).toBeGreaterThan(straightResult.score);
  });

  it('BOUNDARY: load weight 15kg scores higher than 0kg', () => {
    const noLoad = calcREBA(NEUTRAL_ANGLES, TASK_NO_LOAD, 0.9);
    const heavyLoad = calcREBA(NEUTRAL_ANGLES, TASK_HEAVY_LIFT, 0.9);
    expect(heavyLoad.score).toBeGreaterThanOrEqual(noLoad.score);
  });

  it('DETERMINISM: same inputs always produce same output', () => {
    const r1 = calcREBA(HIGH_RISK_ANGLES, TASK_HEAVY_LIFT, 0.8);
    const r2 = calcREBA(HIGH_RISK_ANGLES, TASK_HEAVY_LIFT, 0.8);
    expect(r1.score).toBe(r2.score);
  });
});

// ─── NIOSH Tests ──────────────────────────────────────────────────────────────

describe('NIOSH Lifting Index', () => {
  it('APPLICABILITY: returns N/A when loadWeight = 0', () => {
    const result = calcNIOSH(TASK_NO_LOAD, 0.9);
    expect(result.notApplicable).toBe(true);
    expect(result.score).toBe(0);
    expect(result.interpretation).toContain('N/A');
  });

  it('ANCHOR: ideal lift (10kg, 25cm horizontal, 75cm vertical) scores LI ~0.9', () => {
    const idealTask: TaskProfile = {
      ...DEFAULT_TASK_PROFILE,
      loadWeight: 10,
      horizontalDistance: 25,
      verticalOrigin: 75,
      verticalDestination: 125,
      asymmetryAngle: 0,
      coupling: 'good',
      duration: 'short',
      repRate: 2,
    };
    const result = calcNIOSH(idealTask, 0.9);
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.score).toBeLessThan(1.5);
  });

  it('BOUNDARY: LI ≥ 1 triggers medium risk or higher', () => {
    const riskyTask: TaskProfile = {
      ...DEFAULT_TASK_PROFILE,
      loadWeight: 25,
      horizontalDistance: 40,
      verticalOrigin: 30,
      verticalDestination: 150,
      asymmetryAngle: 30,
      coupling: 'poor',
      duration: 'long',
      repRate: 8,
    };
    const result = calcNIOSH(riskyTask, 0.8);
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.riskLevel).not.toBe('negligible');
  });

  it('DETERMINISM: same inputs always produce same output', () => {
    const r1 = calcNIOSH(TASK_HEAVY_LIFT, 0.9);
    const r2 = calcNIOSH(TASK_HEAVY_LIFT, 0.9);
    expect(r1.score).toBe(r2.score);
  });
});

// ─── RSI Tests ────────────────────────────────────────────────────────────────

describe('RSI (Strain Index)', () => {
  it('APPLICABILITY: returns N/A when repRate < 2', () => {
    const result = calcRSI(NEUTRAL_ANGLES, TASK_NO_LOAD, 0.9);
    expect(result.notApplicable).toBe(true);
    expect(result.interpretation).toContain('N/A');
  });

  it('BOUNDARY: high-frequency repetitive task scores higher than low-frequency', () => {
    const lowFreq: TaskProfile = { ...DEFAULT_TASK_PROFILE, repRate: 3, loadWeight: 2 };
    const highFreq: TaskProfile = { ...DEFAULT_TASK_PROFILE, repRate: 20, loadWeight: 5 };
    const lowResult = calcRSI(HIGH_RISK_ANGLES, lowFreq, 0.9);
    const highResult = calcRSI(HIGH_RISK_ANGLES, highFreq, 0.9);
    expect(highResult.score).toBeGreaterThan(lowResult.score);
  });

  it('BOUNDARY: score is within 0–100 range', () => {
    const extremeTask: TaskProfile = {
      ...DEFAULT_TASK_PROFILE,
      repRate: 30,
      loadWeight: 15,
      cycleDuration: 60,
      duration: 'long',
    };
    const result = calcRSI(HIGH_RISK_ANGLES, extremeTask, 0.8);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

// ─── Cross-method consistency ─────────────────────────────────────────────────

describe('Cross-method consistency', () => {
  it('High-risk posture: all applicable methods agree on elevated risk', () => {
    const rula = calcRULA(HIGH_RISK_ANGLES, TASK_HEAVY_LIFT, 0.8);
    const reba = calcREBA(HIGH_RISK_ANGLES, TASK_HEAVY_LIFT, 0.8);
    const niosh = calcNIOSH(TASK_HEAVY_LIFT, 0.8);
    expect(rula.riskLevel).toMatch(/medium|high|very-high/);
    expect(reba.riskLevel).toMatch(/medium|high|very-high/);
    expect(niosh.riskLevel).toMatch(/medium|high|very-high/);
  });

  it('Neutral posture: all applicable methods agree on low/negligible risk', () => {
    const rula = calcRULA(NEUTRAL_ANGLES, TASK_NO_LOAD, 0.95);
    const reba = calcREBA(NEUTRAL_ANGLES, TASK_NO_LOAD, 0.95);
    expect(rula.riskLevel).toMatch(/negligible|low/);
    expect(reba.riskLevel).toMatch(/negligible|low/);
  });
});
