import * as THREE from 'three';
import type { ArjunCharacterRig } from './ArjunCharacterModel.ts';
import type { PlayerMoveResult } from './PlayerController.ts';

export type ArjunAnimationState =
  | 'idle'
  | 'start'
  | 'walk'
  | 'run'
  | 'sprint'
  | 'turn'
  | 'stop'
  | 'airborne';

export type ArjunContextualAction =
  | 'pickup_package'
  | 'deliver_package'
  | 'drink_tea'
  | 'eat_snack'
  | 'talk'
  | 'sit';

export interface SeatedVehiclePoseInput {
  category: 'car' | 'suv' | 'scooter' | 'motorcycle' | 'auto_rickshaw' | 'bus' | 'delivery' | 'truck';
  steerNorm: number;
  leanAngleRad: number;
  speedMps: number;
  leanForwardRad: number;
}

export interface ArjunAnimatorSnapshot {
  activeState: ArjunAnimationState | 'driving';
  activeContextualAction: ArjunContextualAction | null;
  gaitPhase: number;
  blendWeights: {
    idle: number;
    walk: number;
    run: number;
    sprint: number;
  };
}

/**
 * State-blended procedural animator for Arjun's hierarchical character rig.
 * Smoothly blends idle breathing, starting acceleration lean, walk, run, sprint,
 * cornering bank/head lead, stopping weight settle, airborne transitions, and seated riding.
 */
export class ArjunAnimator {
  private activeState: ArjunAnimationState | 'driving' = 'idle';
  private idleTime = 0;
  private gaitPhase = 0;

  private idleW = 1;
  private walkW = 0;
  private runW = 0;
  private sprintW = 0;

  private startImpulse = 0;
  private stopSettle = 0;
  private prevSpeed = 0;
  private smoothedTurnRate = 0;

  private contextualAction: ArjunContextualAction | null = null;
  private contextualTimer = 0;
  private contextualDuration = 1.2;
  private contextualWeight = 0;

  triggerContextualAction(action: ArjunContextualAction, durationSec = 1.25): void {
    this.contextualAction = action;
    this.contextualDuration = Math.max(0.45, durationSec);
    this.contextualTimer = this.contextualDuration;
  }

  getSnapshot(): ArjunAnimatorSnapshot {
    return {
      activeState: this.activeState,
      activeContextualAction: this.contextualAction,
      gaitPhase: this.gaitPhase,
      blendWeights: {
        idle: Number(this.idleW.toFixed(3)),
        walk: Number(this.walkW.toFixed(3)),
        run: Number(this.runW.toFixed(3)),
        sprint: Number(this.sprintW.toFixed(3)),
      },
    };
  }

  update(
    rig: ArjunCharacterRig,
    state: PlayerMoveResult,
    dt: number,
    seatedVehicle?: SeatedVehiclePoseInput | null,
  ): void {
    const safeDt = Math.min(Math.max(dt, 0), 0.05);
    this.idleTime += safeDt;

    if (seatedVehicle) {
      this.activeState = 'driving';
      const isScooter = seatedVehicle.category === 'scooter';
      const isAuto = seatedVehicle.category === 'auto_rickshaw';
      const hipBend = isScooter ? -1.08 : isAuto ? -1.16 : -0.82;
      const kneeBend = isScooter ? 1.18 : isAuto ? 1.25 : 1.05;
      const steerYaw = seatedVehicle.steerNorm * 0.22;

      rig.pelvisGroup.position.y = THREE.MathUtils.damp(rig.pelvisGroup.position.y, 0.88, 16, safeDt);
      rig.pelvisGroup.rotation.y = THREE.MathUtils.damp(rig.pelvisGroup.rotation.y, 0, 16, safeDt);
      rig.pelvisGroup.rotation.z = THREE.MathUtils.damp(rig.pelvisGroup.rotation.z, 0, 16, safeDt);

      rig.spineGroup.rotation.x = THREE.MathUtils.damp(
        rig.spineGroup.rotation.x,
        seatedVehicle.leanForwardRad,
        14,
        safeDt,
      );
      rig.spineGroup.rotation.z = THREE.MathUtils.damp(
        rig.spineGroup.rotation.z,
        seatedVehicle.leanAngleRad * 0.28,
        12,
        safeDt,
      );
      rig.chestGroup.rotation.x = THREE.MathUtils.damp(
        rig.chestGroup.rotation.x,
        seatedVehicle.leanForwardRad * 0.6,
        14,
        safeDt,
      );
      rig.chestGroup.rotation.y = THREE.MathUtils.damp(rig.chestGroup.rotation.y, steerYaw * 0.4, 12, safeDt);

      rig.headGroup.rotation.y = THREE.MathUtils.damp(rig.headGroup.rotation.y, -steerYaw * 0.7, 10, safeDt);
      rig.headGroup.rotation.x = THREE.MathUtils.damp(
        rig.headGroup.rotation.x,
        -seatedVehicle.leanForwardRad * 0.85,
        12,
        safeDt,
      );

      rig.hipL.rotation.x = THREE.MathUtils.damp(rig.hipL.rotation.x, hipBend, 16, safeDt);
      rig.hipR.rotation.x = THREE.MathUtils.damp(rig.hipR.rotation.x, hipBend, 16, safeDt);
      rig.kneeL.rotation.x = THREE.MathUtils.damp(rig.kneeL.rotation.x, kneeBend, 16, safeDt);
      rig.kneeR.rotation.x = THREE.MathUtils.damp(rig.kneeR.rotation.x, kneeBend, 16, safeDt);
      rig.ankleL.rotation.x = THREE.MathUtils.damp(rig.ankleL.rotation.x, -0.15, 14, safeDt);
      rig.ankleR.rotation.x = THREE.MathUtils.damp(rig.ankleR.rotation.x, -0.15, 14, safeDt);

      const armReach = isAuto ? -0.95 : -0.82;
      rig.shoulderL.rotation.x = THREE.MathUtils.damp(
        rig.shoulderL.rotation.x,
        armReach + steerYaw * 0.35,
        16,
        safeDt,
      );
      rig.shoulderR.rotation.x = THREE.MathUtils.damp(
        rig.shoulderR.rotation.x,
        armReach - steerYaw * 0.35,
        16,
        safeDt,
      );
      rig.shoulderL.rotation.z = THREE.MathUtils.damp(rig.shoulderL.rotation.z, 0.16, 14, safeDt);
      rig.shoulderR.rotation.z = THREE.MathUtils.damp(rig.shoulderR.rotation.z, -0.16, 14, safeDt);
      rig.elbowL.rotation.x = THREE.MathUtils.damp(rig.elbowL.rotation.x, -0.45, 16, safeDt);
      rig.elbowR.rotation.x = THREE.MathUtils.damp(rig.elbowR.rotation.x, -0.45, 16, safeDt);
      rig.setHeldActionProp('none');
      rig.contactShadow.scale.setScalar(0.8);
      return;
    }

    // Advance contextual action timer & smooth weight
    if (this.contextualTimer > 0 && this.contextualAction) {
      this.contextualTimer = Math.max(0, this.contextualTimer - safeDt);
      this.contextualWeight = THREE.MathUtils.damp(this.contextualWeight, 1, 14, safeDt);
      if (this.contextualTimer === 0) {
        this.contextualAction = null;
      }
    } else {
      this.contextualWeight = THREE.MathUtils.damp(this.contextualWeight, 0, 12, safeDt);
    }

    const speed = state.speed;
    const isMoving = state.isMoving || speed > 0.14;
    const isGrounded = state.isGrounded ?? true;
    const turnRate = state.turnRate ?? 0;

    // Detect start & stop impulse transitions
    if (this.prevSpeed <= 0.25 && speed > 0.35) {
      this.startImpulse = 1.0;
    }
    if (this.prevSpeed > 1.2 && !state.isMoving && speed < 1.2) {
      this.stopSettle = 1.0;
    }
    this.prevSpeed = speed;

    this.startImpulse = Math.max(0, this.startImpulse - safeDt * 3.8);
    this.stopSettle = Math.max(0, this.stopSettle - safeDt * 3.2);
    this.smoothedTurnRate = THREE.MathUtils.damp(this.smoothedTurnRate, turnRate, 10, safeDt);

    // Compute target blend weights from continuous movement speed
    let tIdle = 0;
    let tWalk = 0;
    let tRun = 0;
    let tSprint = 0;

    if (!isMoving || speed < 0.15) {
      tIdle = 1;
    } else if (speed < 3.4) {
      tWalk = 1;
    } else if (speed < 6.4 && !state.isSprinting) {
      const ratio = THREE.MathUtils.clamp((speed - 3.4) / 2.2, 0, 1);
      tWalk = 1 - ratio;
      tRun = ratio;
    } else {
      const ratio = THREE.MathUtils.clamp((speed - 5.6) / 2.4, 0, 1);
      tRun = 1 - ratio;
      tSprint = ratio;
    }

    const blendLambda = 13;
    this.idleW = THREE.MathUtils.damp(this.idleW, tIdle, blendLambda, safeDt);
    this.walkW = THREE.MathUtils.damp(this.walkW, tWalk, blendLambda, safeDt);
    this.runW = THREE.MathUtils.damp(this.runW, tRun, blendLambda, safeDt);
    this.sprintW = THREE.MathUtils.damp(this.sprintW, tSprint, blendLambda, safeDt);

    // Normalize weights safely
    const wSum = this.idleW + this.walkW + this.runW + this.sprintW || 1;
    const wIdle = this.idleW / wSum;
    const wWalk = this.walkW / wSum;
    const wRun = this.runW / wSum;
    const wSprint = this.sprintW / wSum;

    // Resolve readable primary animation state label
    if (!isGrounded) {
      this.activeState = 'airborne';
    } else if (!isMoving && this.stopSettle > 0.25) {
      this.activeState = 'stop';
    } else if (!isMoving && Math.abs(this.smoothedTurnRate) > 0.5) {
      this.activeState = 'turn';
    } else if (!isMoving) {
      this.activeState = 'idle';
    } else if (this.startImpulse > 0.45 && speed < 3.2) {
      this.activeState = 'start';
    } else if (wSprint >= wRun && wSprint >= wWalk) {
      this.activeState = 'sprint';
    } else if (wRun >= wWalk) {
      this.activeState = 'run';
    } else if (Math.abs(this.smoothedTurnRate) > 3.2) {
      this.activeState = 'turn';
    } else {
      this.activeState = 'walk';
    }

    // Advance cadence proportionally to speed so foot contact matches ground velocity
    if (wIdle < 0.96) {
      const freq = 5.4 * wWalk + 8.6 * wRun + 12.2 * wSprint;
      const speedScale = THREE.MathUtils.clamp(speed / 3.8, 0.45, 2.3);
      this.gaitPhase = (this.gaitPhase + safeDt * Math.max(4.2, freq * 0.72 + speedScale * 2.1)) % (Math.PI * 2);
    } else if (this.stopSettle > 0.02) {
      // Gracefully settle stride phase toward neutral stance
      this.gaitPhase *= Math.max(0, 1 - safeDt * 10);
    }

    const s = Math.sin(this.gaitPhase);
    const c = Math.cos(this.gaitPhase);
    const s2 = Math.sin(this.gaitPhase * 2);

    // Idle pose targets
    const breath = Math.sin(this.idleTime * 1.9);
    const idleHeadScan = Math.sin(this.idleTime * 0.65) * 0.09;
    const idleShoulderHang = 0.05 + breath * 0.015;
    const idleElbowFlex = -0.16 - breath * 0.02;

    // Locomotion targets blended across walk / run / sprint
    const strideAmp = 0.42 * wWalk + 0.72 * wRun + 0.98 * wSprint;
    const kneeFlexAmp = 0.48 * wWalk + 0.92 * wRun + 1.24 * wSprint;
    const armSwingAmp = 0.36 * wWalk + 0.74 * wRun + 1.05 * wSprint;
    const elbowBendTarget = -0.16 * wIdle - 0.34 * wWalk - 0.96 * wRun - 1.38 * wSprint;
    const forwardLean =
      0.01 * wIdle +
      0.04 * wWalk +
      0.14 * wRun +
      0.24 * wSprint +
      this.startImpulse * 0.14 -
      this.stopSettle * 0.08 +
      THREE.MathUtils.clamp((state.groundSlope ?? 0) * 0.18, -0.08, 0.12);

    const movingFactor = 1 - wIdle;
    const bounceAmp = (0.018 * wWalk + 0.048 * wRun + 0.068 * wSprint) * movingFactor;
    const pelvisBob = -Math.abs(s2) * bounceAmp + (wIdle * breath * 0.006) - this.stopSettle * 0.025;
    const airborneLift = !isGrounded ? -0.06 : 0;

    const speedFactor = THREE.MathUtils.clamp(1 - speed / 4.2, 0.2, 1);
    const cw = this.contextualWeight * speedFactor;
    const headLeadYaw = THREE.MathUtils.clamp(this.smoothedTurnRate * 0.075, -0.28, 0.28);

    let ctxPelvisY = 0.92 + pelvisBob + airborneLift;
    let ctxSpineX = forwardLean * 0.55;
    let ctxChestX = forwardLean * 0.45 + wIdle * breath * 0.02;
    let ctxHeadX = -forwardLean * 0.45 + wIdle * breath * 0.015;
    let ctxHeadY = wIdle * idleHeadScan + headLeadYaw;
    let ctxHipL = !isGrounded ? -0.35 : s * strideAmp;
    let ctxHipR = !isGrounded ? 0.18 : -s * strideAmp;
    let ctxKneeL = !isGrounded ? 0.65 : Math.max(0.04 * movingFactor, -c * kneeFlexAmp * 0.65 + kneeFlexAmp * 0.3);
    let ctxKneeR = !isGrounded ? 0.32 : Math.max(0.04 * movingFactor, c * kneeFlexAmp * 0.65 + kneeFlexAmp * 0.3);
    let ctxShL = -s * armSwingAmp + wIdle * idleShoulderHang;
    let ctxShR = s * armSwingAmp + wIdle * idleShoulderHang;
    let ctxElL = elbowBendTarget + (wIdle * idleElbowFlex) - Math.max(0, -s) * 0.16 * movingFactor;
    let ctxElR = elbowBendTarget + (wIdle * idleElbowFlex) - Math.max(0, s) * 0.16 * movingFactor;

    let desiredProp: 'none' | 'parcel' | 'chai' = 'none';
    if (cw > 0.02 && this.contextualAction) {
      const actionWave = Math.sin(this.idleTime * 5.2);
      if (this.contextualAction === 'pickup_package' || this.contextualAction === 'deliver_package') {
        desiredProp = 'parcel';
        ctxSpineX = THREE.MathUtils.lerp(ctxSpineX, 0.14, cw);
        ctxChestX = THREE.MathUtils.lerp(ctxChestX, 0.08, cw);
        ctxShR = THREE.MathUtils.lerp(ctxShR, -1.06, cw);
        ctxElR = THREE.MathUtils.lerp(ctxElR, -0.68, cw);
        ctxShL = THREE.MathUtils.lerp(ctxShL, -0.34, cw);
        ctxElL = THREE.MathUtils.lerp(ctxElL, -0.42, cw);
      } else if (this.contextualAction === 'drink_tea' || this.contextualAction === 'eat_snack') {
        desiredProp = 'chai';
        const sipOsc = 0.5 + 0.5 * Math.sin(this.idleTime * 4.1);
        ctxShR = THREE.MathUtils.lerp(ctxShR, -1.25 - sipOsc * 0.16, cw);
        ctxElR = THREE.MathUtils.lerp(ctxElR, -1.68 - sipOsc * 0.18, cw);
        ctxHeadX = THREE.MathUtils.lerp(ctxHeadX, -0.14 - sipOsc * 0.06, cw);
      } else if (this.contextualAction === 'talk') {
        ctxShR = THREE.MathUtils.lerp(ctxShR, -0.58 + actionWave * 0.24, cw);
        ctxElR = THREE.MathUtils.lerp(ctxElR, -0.92 + actionWave * 0.18, cw);
        ctxShL = THREE.MathUtils.lerp(ctxShL, -0.26 - actionWave * 0.12, cw);
        ctxElL = THREE.MathUtils.lerp(ctxElL, -0.48, cw);
        ctxHeadY = THREE.MathUtils.lerp(ctxHeadY, Math.sin(this.idleTime * 2.1) * 0.14, cw);
        ctxHeadX = THREE.MathUtils.lerp(ctxHeadX, Math.sin(this.idleTime * 4.4) * 0.06, cw);
      } else if (this.contextualAction === 'sit') {
        ctxPelvisY = THREE.MathUtils.lerp(ctxPelvisY, 0.68, cw);
        ctxSpineX = THREE.MathUtils.lerp(ctxSpineX, -0.05, cw);
        ctxHipL = THREE.MathUtils.lerp(ctxHipL, -1.16, cw);
        ctxHipR = THREE.MathUtils.lerp(ctxHipR, -1.16, cw);
        ctxKneeL = THREE.MathUtils.lerp(ctxKneeL, 1.24, cw);
        ctxKneeR = THREE.MathUtils.lerp(ctxKneeR, 1.24, cw);
        ctxShL = THREE.MathUtils.lerp(ctxShL, -0.22, cw);
        ctxShR = THREE.MathUtils.lerp(ctxShR, -0.22, cw);
        ctxElL = THREE.MathUtils.lerp(ctxElL, -0.52, cw);
        ctxElR = THREE.MathUtils.lerp(ctxElR, -0.52, cw);
      }
    }
    rig.setHeldActionProp(desiredProp);

    // Pelvis height, sway, bounce & twist
    rig.pelvisGroup.position.y = THREE.MathUtils.damp(
      rig.pelvisGroup.position.y,
      ctxPelvisY,
      16,
      safeDt,
    );
    rig.pelvisGroup.rotation.y = THREE.MathUtils.damp(
      rig.pelvisGroup.rotation.y,
      -s * (0.05 * wWalk + 0.1 * wRun + 0.14 * wSprint),
      15,
      safeDt,
    );
    rig.pelvisGroup.rotation.z = THREE.MathUtils.damp(
      rig.pelvisGroup.rotation.z,
      c * 0.025 * movingFactor,
      14,
      safeDt,
    );

    // Spine & chest counter-rotation + banking on sharp turns
    const turnBank = THREE.MathUtils.clamp(this.smoothedTurnRate * -0.042, -0.16, 0.16);
    rig.spineGroup.rotation.x = THREE.MathUtils.damp(rig.spineGroup.rotation.x, ctxSpineX, 14, safeDt);
    rig.spineGroup.rotation.z = THREE.MathUtils.damp(rig.spineGroup.rotation.z, turnBank, 12, safeDt);
    rig.chestGroup.rotation.x = THREE.MathUtils.damp(
      rig.chestGroup.rotation.x,
      ctxChestX,
      14,
      safeDt,
    );
    rig.chestGroup.rotation.y = THREE.MathUtils.damp(
      rig.chestGroup.rotation.y,
      s * (0.06 * wWalk + 0.12 * wRun + 0.18 * wSprint),
      14,
      safeDt,
    );

    // Head stabilization & turn anticipation look
    rig.headGroup.rotation.y = THREE.MathUtils.damp(
      rig.headGroup.rotation.y,
      ctxHeadY,
      10,
      safeDt,
    );
    rig.headGroup.rotation.x = THREE.MathUtils.damp(
      rig.headGroup.rotation.x,
      ctxHeadX,
      12,
      safeDt,
    );

    // Left & Right Legs (Hip + Knee + Ankle plantar/dorsiflexion)
    rig.hipL.rotation.x = THREE.MathUtils.damp(rig.hipL.rotation.x, ctxHipL, 18, safeDt);
    rig.hipR.rotation.x = THREE.MathUtils.damp(rig.hipR.rotation.x, ctxHipR, 18, safeDt);
    rig.kneeL.rotation.x = THREE.MathUtils.damp(rig.kneeL.rotation.x, ctxKneeL, 18, safeDt);
    rig.kneeR.rotation.x = THREE.MathUtils.damp(rig.kneeR.rotation.x, ctxKneeR, 18, safeDt);

    rig.ankleL.rotation.x = THREE.MathUtils.damp(
      rig.ankleL.rotation.x,
      movingFactor * (-ctxHipL * 0.32),
      16,
      safeDt,
    );
    rig.ankleR.rotation.x = THREE.MathUtils.damp(
      rig.ankleR.rotation.x,
      movingFactor * (-ctxHipR * 0.32),
      16,
      safeDt,
    );

    // Left & Right Arms (counter-swing + natural relaxed shoulder abduction + contextual pose)
    rig.shoulderL.rotation.x = THREE.MathUtils.damp(rig.shoulderL.rotation.x, ctxShL, 17, safeDt);
    rig.shoulderR.rotation.x = THREE.MathUtils.damp(rig.shoulderR.rotation.x, ctxShR, 17, safeDt);
    rig.shoulderL.rotation.z = THREE.MathUtils.damp(rig.shoulderL.rotation.z, 0.08 + 0.04 * wSprint, 12, safeDt);
    rig.shoulderR.rotation.z = THREE.MathUtils.damp(rig.shoulderR.rotation.z, -0.08 - 0.04 * wSprint, 12, safeDt);

    rig.elbowL.rotation.x = THREE.MathUtils.damp(rig.elbowL.rotation.x, ctxElL, 16, safeDt);
    rig.elbowR.rotation.x = THREE.MathUtils.damp(rig.elbowR.rotation.x, ctxElR, 16, safeDt);

    // Keep contact shadow anchored under Arjun even during brief jumps
    const jumpHeightOffset = Math.max(0, state.y - state.visualY);
    const shadowScale = Math.max(0.62, 1 - jumpHeightOffset * 0.32);
    rig.contactShadow.scale.setScalar(shadowScale);
  }
}
