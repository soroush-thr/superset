#!/usr/bin/env python3
"""
Rule-based sub-muscle enrichment for free-exercise-db.

Reads exercises.raw.json (public domain, yuhonas/free-exercise-db) and emits:
  - src/data/exercises.json   enriched catalog
  - src/data/taxonomy.json    muscle taxonomy (majors -> subgroups -> svg regions)

Every exercise gets `sub` : {subgroup_id: weight}, weights sum to 1.0,
plus `conf` : "high" | "med" (whether a name-keyword rule fired) and
`reviewed`: false, so a later manual or LLM pass can overwrite selectively.

Run once. The output is a versioned artifact; the app never runs this.
"""
import json
import re
from collections import OrderedDict
from pathlib import Path

# Paths are anchored to this script's location, not the cwd, so the tool
# behaves the same whether it's run as `python tools/enrich.py` from the repo
# root or `python enrich.py` from inside tools/.
ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "exercises.raw.json"
DATA_DIR = ROOT / "src" / "data"

# ---------------------------------------------------------------- taxonomy

# id: (display, major, svg region key)
SUBGROUPS = OrderedDict([
    ("pec_upper",      ("Upper chest",        "chest",     "pec_upper")),
    ("pec_mid",        ("Mid chest",          "chest",     "pec_mid")),
    ("pec_lower",      ("Lower chest",        "chest",     "pec_lower")),

    ("delt_ant",       ("Front delt",         "shoulders", "delt_ant")),
    ("delt_lat",       ("Side delt",          "shoulders", "delt_lat")),
    ("delt_post",      ("Rear delt",          "shoulders", "delt_post")),
    ("cuff",           ("Rotator cuff",       "shoulders", "cuff")),

    ("lat",            ("Lats",               "back",      "lat")),
    ("rhomboid",       ("Rhomboids",          "back",      "rhomboid")),
    ("trap_upper",     ("Upper traps",        "back",      "trap_upper")),
    ("trap_mid",       ("Mid traps",          "back",      "trap_mid")),
    ("trap_lower",     ("Lower traps",        "back",      "trap_lower")),
    ("teres",          ("Teres",              "back",      "teres")),
    ("erector",        ("Spinal erectors",    "back",      "erector")),

    ("bicep_long",     ("Biceps long head",   "arms",      "bicep")),
    ("bicep_short",    ("Biceps short head",  "arms",      "bicep")),
    ("brachialis",     ("Brachialis",         "arms",      "brachialis")),
    ("tricep_long",    ("Triceps long head",  "arms",      "tricep")),
    ("tricep_lat",     ("Triceps lateral",    "arms",      "tricep")),
    ("tricep_med",     ("Triceps medial",     "arms",      "tricep")),
    ("forearm_flex",   ("Forearm flexors",    "arms",      "forearm")),
    ("forearm_ext",    ("Forearm extensors",  "arms",      "forearm")),
    ("grip",           ("Grip",               "arms",      "forearm")),

    ("abs_upper",      ("Upper abs",          "core",      "abs_upper")),
    ("abs_lower",      ("Lower abs",          "core",      "abs_lower")),
    ("oblique",        ("Obliques",           "core",      "oblique")),
    ("tva",            ("Deep core / TVA",    "core",      "abs_lower")),
    ("serratus",       ("Serratus",           "core",      "serratus")),

    ("quad_rf",        ("Rectus femoris",     "legs",      "quad")),
    ("quad_vl",        ("Vastus lateralis",   "legs",      "quad")),
    ("quad_vm",        ("Vastus medialis",    "legs",      "quad")),
    ("ham_bf",         ("Biceps femoris",     "legs",      "ham")),
    ("ham_med",        ("Semis (inner ham)",  "legs",      "ham")),
    ("glute_max",      ("Glute max",          "legs",      "glute")),
    ("glute_med",      ("Glute med / min",    "legs",      "glute")),
    ("adductor",       ("Adductors",          "legs",      "adductor")),
    ("hip_flexor",     ("Hip flexors",        "legs",      "hip_flexor")),
    ("calf_gastroc",   ("Gastrocnemius",      "legs",      "calf")),
    ("calf_soleus",    ("Soleus",             "legs",      "calf")),
    ("tibialis",       ("Tibialis anterior",  "legs",      "tibialis")),

    ("neck",           ("Neck",               "neck",      "neck")),
])

MAJORS = OrderedDict([
    ("chest",     "Chest"),
    ("back",      "Back"),
    ("shoulders", "Shoulders"),
    ("arms",      "Arms"),
    ("core",      "Core"),
    ("legs",      "Legs"),
    ("neck",      "Neck"),
])

# Default split when only the coarse muscle label is known.
BASE = {
    "chest":       {"pec_upper": .25, "pec_mid": .50, "pec_lower": .25},
    "shoulders":   {"delt_ant": .40, "delt_lat": .35, "delt_post": .25},
    "lats":        {"lat": .85, "teres": .15},
    "middle back": {"rhomboid": .35, "trap_mid": .30, "lat": .20, "teres": .15},
    "traps":       {"trap_upper": .60, "trap_mid": .28, "trap_lower": .12},
    "lower back":  {"erector": 1.0},
    "biceps":      {"bicep_long": .45, "bicep_short": .35, "brachialis": .20},
    "triceps":     {"tricep_long": .40, "tricep_lat": .35, "tricep_med": .25},
    "forearms":    {"forearm_flex": .40, "forearm_ext": .25, "grip": .35},
    "abdominals":  {"abs_upper": .40, "abs_lower": .30, "oblique": .20, "tva": .10},
    "quadriceps":  {"quad_rf": .30, "quad_vl": .35, "quad_vm": .35},
    "hamstrings":  {"ham_bf": .55, "ham_med": .45},
    "glutes":      {"glute_max": .72, "glute_med": .28},
    "calves":      {"calf_gastroc": .70, "calf_soleus": .30},
    "adductors":   {"adductor": 1.0},
    "abductors":   {"glute_med": 1.0},
    "neck":        {"neck": 1.0},
}

# (regex on lowercased name, coarse muscle it refines, replacement split)
RULES = [
    # --- chest angle
    (r"\bincline\b",                     "chest", {"pec_upper": .62, "pec_mid": .30, "pec_lower": .08}),
    (r"\bdecline\b|\bdip\b|\bdips\b",    "chest", {"pec_upper": .08, "pec_mid": .35, "pec_lower": .57}),
    (r"\bpullover\b",                    "chest", {"pec_lower": .55, "pec_mid": .45}),
    # --- delts
    (r"lateral raise|side raise|\bupright row\b|\blateral\b",       "shoulders", {"delt_lat": .78, "delt_ant": .12, "trap_upper": .10}),
    (r"front raise|shoulder press|military|overhead press|\bpush press\b|arnold", "shoulders", {"delt_ant": .62, "delt_lat": .28, "tricep_long": .10}),
    (r"rear delt|reverse fly|reverse flye|face pull|bent[- ]over lateral|rear lateral", "shoulders", {"delt_post": .70, "rhomboid": .18, "trap_mid": .12}),
    (r"rotation|rotator|cuban|\bcuff\b",  "shoulders", {"cuff": .72, "delt_post": .18, "delt_lat": .10}),
    (r"\bshrug\b",                        "traps",     {"trap_upper": .85, "trap_mid": .15}),
    # --- back
    (r"pull[- ]?up|chin[- ]?up|pulldown|pull down",  "lats", {"lat": .78, "teres": .10, "bicep_long": .12}),
    (r"\brow\b|\brows\b",                            "lats", {"lat": .55, "rhomboid": .22, "trap_mid": .23}),
    (r"straight[- ]arm|pullover",                    "lats", {"lat": .82, "teres": .18}),
    (r"good morning|hyperextension|back extension|deadlift", "lower back", {"erector": 1.0}),
    # --- arms
    (r"preacher|concentration|spider",   "biceps", {"bicep_short": .68, "bicep_long": .22, "brachialis": .10}),
    (r"incline curl|incline dumbbell curl|drag curl", "biceps", {"bicep_long": .70, "bicep_short": .20, "brachialis": .10}),
    (r"hammer|reverse curl|zottman",     "biceps", {"brachialis": .50, "bicep_long": .22, "forearm_ext": .28}),
    (r"overhead|french press|skull|lying triceps|extension", "triceps", {"tricep_long": .62, "tricep_lat": .22, "tricep_med": .16}),
    (r"pushdown|push down|kickback|close[- ]grip|\bdip\b", "triceps", {"tricep_lat": .45, "tricep_med": .33, "tricep_long": .22}),
    (r"wrist curl",                      "forearms", {"forearm_flex": .85, "grip": .15}),
    (r"reverse wrist|wrist extension",   "forearms", {"forearm_ext": .85, "grip": .15}),
    (r"\bfarmer|\bhold\b|\bcarry\b|grip|plate pinch|\bhang\b", "forearms", {"grip": .70, "forearm_flex": .30}),
    # --- core
    (r"leg raise|knee raise|reverse crunch|hanging|flutter|scissor", "abdominals", {"abs_lower": .60, "abs_upper": .20, "hip_flexor": .12, "tva": .08}),
    (r"twist|side bend|oblique|woodchop|wood chop|windmill|side plank", "abdominals", {"oblique": .70, "tva": .15, "abs_upper": .15}),
    (r"\bplank\b|vacuum|hollow|dead ?bug|ab wheel|rollout|pallof", "abdominals", {"tva": .48, "abs_upper": .22, "abs_lower": .20, "oblique": .10}),
    (r"crunch|sit[- ]?up|v[- ]?up",      "abdominals", {"abs_upper": .58, "abs_lower": .26, "oblique": .16}),
    # --- legs
    (r"leg extension|sissy",             "quadriceps", {"quad_rf": .44, "quad_vl": .28, "quad_vm": .28}),
    (r"\bsplit squat\b|lunge|step[- ]?up|bulgarian", "quadriceps", {"quad_vm": .38, "quad_vl": .32, "quad_rf": .30}),
    (r"hack squat|leg press|front squat", "quadriceps", {"quad_vl": .38, "quad_vm": .34, "quad_rf": .28}),
    (r"stiff|romanian|\brdl\b|good morning|deadlift", "hamstrings", {"ham_bf": .58, "ham_med": .42}),
    (r"leg curl|lying curl|seated curl|nordic", "hamstrings", {"ham_bf": .50, "ham_med": .50}),
    (r"hip thrust|glute bridge|bridge|kickback|pull ?through", "glutes", {"glute_max": .82, "glute_med": .18}),
    (r"abduction|clam|band walk|side lying|monster walk", "glutes", {"glute_med": .85, "glute_max": .15}),
    (r"seated calf|soleus",              "calves", {"calf_soleus": .78, "calf_gastroc": .22}),
    (r"standing calf|donkey|calf raise|jump rope", "calves", {"calf_gastroc": .78, "calf_soleus": .22}),
    (r"tibialis|toe raise|dorsiflex",    "calves", {"tibialis": .90, "calf_soleus": .10}),
]

SECONDARY_DISCOUNT = 0.5   # configurable; see notes


def split_for(muscle, name_l):
    """Return the subgroup split for one coarse muscle, applying keyword rules."""
    for pattern, target, repl in RULES:
        if target == muscle and re.search(pattern, name_l):
            return dict(repl), True
    base = BASE.get(muscle)
    return (dict(base), False) if base else (None, False)


def enrich(ex):
    name_l = ex["name"].lower()
    acc, fired = {}, False

    for muscle in ex.get("primaryMuscles", []):
        split, hit = split_for(muscle, name_l)
        fired = fired or hit
        if not split:
            continue
        for k, v in split.items():
            acc[k] = acc.get(k, 0) + v

    for muscle in ex.get("secondaryMuscles", []):
        split, hit = split_for(muscle, name_l)
        if not split:
            continue
        for k, v in split.items():
            acc[k] = acc.get(k, 0) + v * SECONDARY_DISCOUNT

    total = sum(acc.values())
    if total <= 0:
        return {}, "low"
    acc = {k: round(v / total, 4) for k, v in acc.items() if v / total >= 0.02}
    total = sum(acc.values())
    acc = {k: round(v / total, 4) for k, v in acc.items()}
    # Rounding every weight to 4dp can leave the sum a few 1e-4 off 1.0.
    # Push the residual onto the largest weight so the stored sum is exact
    # (acceptance checklist requires within 1e-6, not just "close").
    residual = round(1.0 - sum(acc.values()), 10)
    if residual != 0:
        top_key = max(acc, key=acc.get)
        acc[top_key] = round(acc[top_key] + residual, 10)
    return acc, ("high" if fired else "med")


def main():
    raw = json.load(open(SRC))
    out = []
    stats = {"high": 0, "med": 0, "low": 0}

    for ex in raw:
        sub, conf = enrich(ex)
        stats[conf] += 1
        out.append({
            "id": ex["id"],
            "name": ex["name"],
            "level": ex.get("level"),
            "equipment": ex.get("equipment") or "other",
            "mechanic": ex.get("mechanic"),
            "force": ex.get("force"),
            "category": ex.get("category"),
            "primary": ex.get("primaryMuscles", []),
            "secondary": ex.get("secondaryMuscles", []),
            "steps": ex.get("instructions", []),
            "images": ex.get("images", []),
            "sub": sub,
            "conf": conf,
            "reviewed": False,
        })

    tax = {
        "version": 1,
        "secondaryDiscount": SECONDARY_DISCOUNT,
        "majors": [{"id": k, "name": v} for k, v in MAJORS.items()],
        "subgroups": [
            {"id": k, "name": n, "major": m, "region": r}
            for k, (n, m, r) in SUBGROUPS.items()
        ],
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    json.dump(out, open(DATA_DIR / "exercises.json", "w"), separators=(",", ":"))
    json.dump(tax, open(DATA_DIR / "taxonomy.json", "w"), indent=1)

    print(f"{len(out)} exercises  confidence: {stats}")
    unmapped = [e["name"] for e in out if not e["sub"]]
    print(f"unmapped: {len(unmapped)}", unmapped[:8])


if __name__ == "__main__":
    main()
