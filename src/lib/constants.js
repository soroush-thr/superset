// Shared constants: image base URL, default weekly targets, heat ramp.
// Pure data, no React, no side effects. See BUILD-PLAN.md sections 5.3, 7.3, 9.2.

// Verified working path (2026-08-30). The upstream README documents
// `/main/dist/exercises/`, which 404s. Do not "correct" this back.
export const IMG_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'

// Default weekly effective-set target ranges, [min, max], per sub-group.
// Opinionated starting points; editable in Settings. See BUILD-PLAN.md 5.3.
export const DEFAULT_TARGETS = {
  // Primary movers: 8-16
  pec_mid: [8, 16],
  lat: [8, 16],
  quad_vl: [8, 16],
  quad_vm: [8, 16],
  glute_max: [8, 16],
  ham_bf: [8, 16],

  // Secondary movers: 6-12
  pec_upper: [6, 12],
  pec_lower: [6, 12],
  delt_ant: [6, 12],
  delt_lat: [6, 12],
  delt_post: [6, 12],
  rhomboid: [6, 12],
  trap_mid: [6, 12],
  trap_upper: [6, 12],
  bicep_long: [6, 12],
  bicep_short: [6, 12],
  tricep_long: [6, 12],
  tricep_lat: [6, 12],
  quad_rf: [6, 12],
  ham_med: [6, 12],
  abs_upper: [6, 12],
  oblique: [6, 12],

  // Support: 4-10
  teres: [4, 10],
  trap_lower: [4, 10],
  brachialis: [4, 10],
  tricep_med: [4, 10],
  erector: [4, 10],
  glute_med: [4, 10],
  adductor: [4, 10],
  calf_gastroc: [4, 10],
  calf_soleus: [4, 10],
  abs_lower: [4, 10],
  serratus: [4, 10],
  forearm_flex: [4, 10],
  forearm_ext: [4, 10],
  grip: [4, 10],

  // Minimal: 2-6
  cuff: [2, 6],
  tva: [2, 6],
  hip_flexor: [2, 6],
  tibialis: [2, 6],
  neck: [2, 6],
}

// 5-stop heat ramp on t = clamp(value / scaleMax, 0, 1). See BUILD-PLAN.md 7.3.
export const HEAT_RAMP = [
  { t: 0.0, hex: '#1F262E' }, // untouched
  { t: 0.25, hex: '#2F4A5E' }, // minimal
  { t: 0.5, hex: '#5E7C57' }, // approaching target
  { t: 0.75, hex: '#B8913A' }, // in range
  { t: 1.0, hex: '#C9573C' }, // at or above ceiling
]

export const SECONDARY_MUSCLE_DISCOUNT = 0.5
