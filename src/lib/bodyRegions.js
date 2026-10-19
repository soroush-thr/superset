// Region layout for BodyMap: where each of the 30 taxonomy regions (section
// 7.1) sits on a 260x620 anatomical front/back figure. Data-driven so the
// SVG itself stays a thin render of this table -- see BUILD-PLAN.md
// section 7.2. Coordinates are drawn on the figure's right side (viewer's
// right); bilateral muscles get their twin by mirroring the points.
import { smoothClosed, smoothOpen, symmetric, mirrorPoints, ellipse } from './bodyShapes.js'

export const VIEW_BOX = '0 0 260 620'

// ------------------------------------------------------------- silhouette
// One shared outline for front and back (section 7.2), proportioned on an
// eight-head figure: chin ~80, nipples ~158, navel ~233, crotch ~316,
// knees ~435. Traced as the right half from the crown down to the crotch.
const SILHOUETTE_RIGHT = [
  // head and jaw
  [130, 10], [146, 14], [155, 27], [157, 45], [154, 62], [148, 74], [140, 82],
  // neck, trapezius slope, shoulder cap
  [139, 92], [143, 100], [156, 105], [172, 110], [188, 114], [200, 122], [206, 136], [209, 154],
  // outer upper arm, elbow, outer forearm
  [211, 176], [212, 200], [213, 222], [217, 246], [220, 268], [217, 292], [213, 310],
  // hand
  [216, 328], [217, 346], [212, 362], [205, 368], [198, 362], [195, 344], [195, 326],
  // inner forearm, inner upper arm, armpit
  [196, 310], [192, 288], [188, 264], [185, 242], [184, 220], [184, 196], [183, 174], [179, 158],
  // flank, waist, hip
  [178, 172], [176, 194], [170, 220], [169, 242], [174, 264], [180, 288],
  // outer thigh, knee, calf, ankle
  [183, 314], [182, 344], [178, 374], [173, 404], [169, 430], [170, 448], [175, 474], [175, 498],
  [170, 526], [163, 554], [160, 574],
  // foot
  [163, 590], [172, 600], [174, 608], [160, 611], [146, 609], [143, 596], [145, 578],
  // inner shin, knee, thigh up to the crotch
  [143, 554], [140, 524], [140, 494], [142, 466], [141, 440], [139, 414], [137, 386], [135, 356],
  [133, 334], [130, 318],
]

export const SILHOUETTE_D = smoothClosed(symmetric(SILHOUETTE_RIGHT), 0.9)

// ---------------------------------------------------------------- regions
// `mirror: true` means BodyMap renders both `d` and `dMirror` as sibling
// <path> elements sharing one data-region (section 7.2); midline muscles
// (neck, abs, traps, erectors) are built whole via symmetric() instead.

function side(id, points, tension = 1) {
  return {
    id,
    mirror: true,
    d: smoothClosed(points, tension),
    dMirror: smoothClosed(mirrorPoints(points), tension),
  }
}

function mid(id, rightHalf, tension = 1) {
  return { id, mirror: false, d: smoothClosed(symmetric(rightHalf), tension), dMirror: null }
}

const FOREARM = [
  [188, 230], [200, 226], [211, 234], [217, 254], [218, 276], [213, 298], [205, 306], [198, 303],
  [193, 284], [189, 262], [186, 244],
]

export const FRONT_REGIONS = [
  mid('neck', [[130, 84], [137, 83], [141, 96], [138, 103], [130, 108]], 0.8),
  side('delt_ant', [[171, 111], [183, 113], [191, 121], [195, 135], [196, 156], [189, 151], [181, 139], [174, 125]], 0.9),
  side('delt_lat', [[192, 117], [201, 123], [207, 137], [209, 154], [205, 170], [200, 160], [198, 138]], 0.9),
  side('pec_upper', [[133, 111], [150, 111], [165, 114], [172, 121], [172, 129], [152, 128], [133, 128]], 0.8),
  side('pec_mid', [[133, 131], [152, 131], [174, 132], [181, 141], [177, 150], [156, 152], [133, 150]], 0.8),
  side('pec_lower', [[133, 153], [156, 155], [175, 154], [170, 164], [156, 171], [142, 173], [133, 170]], 0.9),
  side('serratus', [[175, 158], [180, 160], [179, 172], [175, 186], [169, 190], [168, 176], [171, 164]], 0.8),
  side('bicep', [[187, 160], [197, 158], [203, 170], [205, 192], [201, 213], [195, 222], [188, 214], [186, 192], [186, 172]], 1),
  side('brachialis', [[207, 186], [211, 194], [213, 218], [209, 232], [203, 226], [205, 206]], 0.9),
  side('forearm', FOREARM, 1),
  mid('abs_upper', [[130, 176], [140, 175], [145, 182], [146, 202], [145, 222], [130, 223]], 0.6),
  mid('abs_lower', [[130, 226], [145, 226], [146, 250], [143, 270], [137, 284], [130, 289]], 0.8),
  side('oblique', [[152, 178], [162, 180], [168, 194], [168, 216], [167, 236], [170, 252], [160, 258], [150, 248], [149, 216]], 0.9),
  side('hip_flexor', [[149, 264], [164, 256], [173, 265], [171, 279], [162, 292], [152, 287]], 0.9),
  side('quad', [[157, 300], [168, 291], [177, 293], [181, 310], [181, 338], [178, 370], [172, 402], [166, 422], [155, 428], [145, 420], [142, 400], [145, 376], [150, 350], [154, 324]], 1),
  side('adductor', [[134, 322], [142, 312], [153, 305], [151, 328], [146, 354], [140, 384], [136, 362], [134, 342]], 0.9),
  side('tibialis', [[155, 450], [167, 451], [173, 472], [171, 500], [165, 528], [159, 550], [154, 530], [153, 494], [153, 466]], 1),
  side('calf', [[142, 450], [149, 455], [151, 482], [149, 510], [145, 532], [141, 506], [140, 474]], 1),
]

export const BACK_REGIONS = [
  mid('neck', [[130, 82], [138, 82], [141, 94], [136, 99], [130, 100]], 0.8),
  mid('trap_upper', [[130, 101], [138, 100], [146, 104], [162, 108], [178, 114], [164, 121], [146, 123], [130, 126]], 0.8),
  mid('trap_mid', [[130, 129], [146, 126], [160, 125], [152, 137], [141, 147], [130, 150]], 0.8),
  mid('trap_lower', [[130, 153], [140, 151], [144, 162], [144, 176], [138, 194], [130, 204]], 0.8),
  side('delt_post', [[180, 116], [194, 120], [204, 132], [208, 150], [204, 164], [196, 156], [188, 140], [180, 128]], 0.9),
  side('cuff', [[163, 130], [176, 130], [185, 142], [183, 154], [172, 160], [162, 150]], 1),
  side('rhomboid', [[147, 134], [158, 128], [160, 142], [156, 158], [149, 166], [146, 152]], 0.9),
  side('teres', [[172, 163], [183, 158], [186, 168], [179, 177], [170, 173]], 1),
  side('lat', [[152, 168], [160, 164], [168, 177], [180, 180], [178, 198], [174, 218], [166, 238], [156, 252], [147, 256], [146, 230], [148, 202], [149, 180]], 1),
  mid('erector', [[130, 206], [137, 204], [143, 214], [143, 240], [145, 262], [141, 277], [130, 282]], 0.8),
  side('tricep', [[186, 166], [200, 162], [208, 172], [211, 196], [211, 218], [204, 228], [194, 224], [188, 206], [186, 186]], 1),
  side('forearm', FOREARM, 1),
  side('glute', [[134, 286], [148, 271], [166, 268], [178, 282], [182, 304], [176, 322], [160, 330], [142, 328], [134, 316]], 1),
  side('ham', [[137, 336], [150, 334], [166, 334], [178, 332], [180, 352], [176, 382], [170, 410], [162, 428], [150, 428], [143, 410], [139, 382], [137, 358]], 1),
  side('calf', [[144, 448], [158, 441], [170, 451], [175, 476], [172, 502], [164, 520], [156, 540], [150, 522], [144, 500], [141, 470]], 1),
]

// ---------------------------------------------------------------- details
// Non-interactive contour lines drawn over the regions: the anatomy cues
// (linea alba, ab segments, clavicles, kneecaps, spine) that make the
// figure read as a body rather than a set of blobs.
const both = (points) => [smoothOpen(points), smoothOpen(mirrorPoints(points))]

export const FRONT_DETAILS = [
  smoothOpen([[130, 178], [130, 230], [130, 286]]),
  smoothOpen([[116, 199], [130, 201], [144, 199]]),
  smoothOpen([[115, 223], [130, 225], [145, 223]]),
  smoothOpen([[116, 248], [130, 250], [144, 248]]),
  ...both([[134, 108], [150, 107], [168, 111]]),
  ...both([[176, 300], [166, 318], [158, 346]]),
  ellipse(130, 238, 2.2, 2.6),
  ellipse(155, 437, 8, 10),
  ellipse(105, 437, 8, 10),
].join(' ')

export const BACK_DETAILS = [
  smoothOpen([[130, 104], [130, 200], [130, 282]]),
  ...both([[148, 128], [160, 126], [176, 130]]),
  ...both([[133, 320], [148, 330], [166, 330]]),
  ...both([[156, 344], [158, 380], [156, 418]]),
  ...both([[155, 452], [156, 480], [156, 510]]),
].join(' ')
