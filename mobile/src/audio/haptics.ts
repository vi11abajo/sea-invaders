import * as Haptics from 'expo-haptics';

/**
 * The Seeker's motor, one named pattern per kind of moment. The rule: nothing frequent buzzes —
 * shots and ordinary kills never vibrate. Impacts mark moments; notifications mark outcomes. Every function is fire-and-forget
 * (`expo-haptics`'s calls are promises the caller must never await on a frame loop), swallows its own
 * errors (a device with no haptics motor, or a permission the OS refuses, must never crash a run —
 * warned once, not every call), and is a no-op while the Vibration switch is off.
 */

let vibrationEnabled = true;

/** The Profile's Vibration switch. Turning it off makes every function below a no-op. */
export function setVibrationEnabled(enabled: boolean): void {
  vibrationEnabled = enabled;
}

/** Set once, so a broken haptics module (no motor, a denied permission) warns once, not every call. */
let warned = false;

function warnOnce(error: unknown): void {
  if (warned) return;
  warned = true;
  console.warn('[haptics] a call failed', error instanceof Error ? error.message : error);
}

function impact(style: Haptics.ImpactFeedbackStyle): void {
  if (!vibrationEnabled) return;
  Haptics.impactAsync(style).catch(warnOnce);
}

function notification(type: Haptics.NotificationFeedbackType): void {
  if (!vibrationEnabled) return;
  Haptics.notificationAsync(type).catch(warnOnce);
}

// ---------------------------------------------------------------------------
// Single impacts, named by feel - the building blocks every named moment
// below is made from, and callable directly wherever a trigger is only ever "one impact".
// ---------------------------------------------------------------------------

export function hapticLight(): void {
  impact(Haptics.ImpactFeedbackStyle.Light);
}

export function hapticSoft(): void {
  impact(Haptics.ImpactFeedbackStyle.Soft);
}

export function hapticRigid(): void {
  impact(Haptics.ImpactFeedbackStyle.Rigid);
}

export function hapticMedium(): void {
  impact(Haptics.ImpactFeedbackStyle.Medium);
}

export function hapticHeavy(): void {
  impact(Haptics.ImpactFeedbackStyle.Heavy);
}

/** Any pill / button press, or a campaign node tap: the lightest tick the phone has. */
export function hapticTap(): void {
  if (!vibrationEnabled) return;
  Haptics.selectionAsync().catch(warnOnce);
}

export function hapticSuccess(): void {
  notification(Haptics.NotificationFeedbackType.Success);
}

export function hapticWarning(): void {
  notification(Haptics.NotificationFeedbackType.Warning);
}

export function hapticError(): void {
  notification(Haptics.NotificationFeedbackType.Error);
}

/** Fires `impact(style)` again after `delayMs` - skips the second beat on its own if Vibration was turned off in between (`impact` re-checks the switch). */
function impactTwice(style: Haptics.ImpactFeedbackStyle, delayMs: number): void {
  impact(style);
  setTimeout(() => impact(style), delayMs);
}

// ---------------------------------------------------------------------------
// In a run - named moments, most delegating straight to a single-impact/notification
// primitive above; the compound ones (a heartbeat, the tide coming back) are built here.
// ---------------------------------------------------------------------------

/** Octopi loses a life: the one buzz felt every time. */
export const hapticLifeLost = hapticHeavy;

/** SHIELD_BARRIER breaks: sharper than a hit. */
export const hapticShieldBreak = hapticRigid;

/** A boost is taken: one tick. */
export const hapticBoostPickup = hapticLight;

/** A wave arrives: barely there. */
export const hapticWaveStart = hapticSoft;

/** A wave is cleared. */
export const hapticWaveCleared = hapticLight;

/** A campaign level is cleared. */
export const hapticLevelCleared = hapticSuccess;

/** The run ends with no Tide offered - Warning, not Error: losing is normal. */
export const hapticRunOver = hapticWarning;

/** The boss appears: a heartbeat, two heavy beats 120 ms apart. */
export function hapticBossSpawn(): void {
  impactTwice(Haptics.ImpactFeedbackStyle.Heavy, 120);
}

/** The boss changes phase: two medium beats, 120 ms apart to match the spawn heartbeat's own spacing. */
export function hapticBossPhase(): void {
  impactTwice(Haptics.ImpactFeedbackStyle.Medium, 120);
}

/** The boss dies: a success notification, then one heavy beat. */
export function hapticBossDead(): void {
  hapticSuccess();
  hapticHeavy();
}

/** Solar's meteor warning ping, once per ping. */
export const hapticMeteorWarning = hapticMedium;

/** Solar's meteor impact. */
export const hapticMeteorImpact = hapticHeavy;

/** Crimson rages. */
export const hapticRage = hapticHeavy;

/** A boss teleports. */
export const hapticBossTeleport = hapticLight;

/** Octopi is frozen. */
export const hapticPlayerFreeze = hapticRigid;

/** A bombardier's charge bursts into its fragments: one of two new haptic ids added for reefs 6-10. */
export const hapticChargeBurst = hapticMedium;

/** The Tide revives Octopi: the tide coming back - soft, medium, heavy 150 ms apart, then a success notification. */
export function hapticRevived(): void {
  impact(Haptics.ImpactFeedbackStyle.Soft);
  setTimeout(() => impact(Haptics.ImpactFeedbackStyle.Medium), 150);
  setTimeout(() => impact(Haptics.ImpactFeedbackStyle.Heavy), 300);
  setTimeout(() => notification(Haptics.NotificationFeedbackType.Success), 450);
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/** A sheet opens (not on close - table D marks only the open). */
export const hapticSheetOpen = hapticLight;

/** A campaign node tapped: the lightest tick, same as any pill. */
export const hapticNodeTap = hapticTap;

/** Switching reefs on the campaign map. */
export const hapticReefSwitch = hapticLight;

/** A new level / reef unlocks. */
export const hapticUnlocked = hapticLight;

/** Wallet connected, a transaction confirmed, the Seeker link verified. */
export const hapticTxConfirmed = hapticSuccess;

/** A signature declined, or a transaction that failed. */
export const hapticTxFailed = hapticError;
