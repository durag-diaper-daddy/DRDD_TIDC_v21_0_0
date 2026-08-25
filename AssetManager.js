/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  DRDD DIPE CITY — AssetManager.js  (v16.14.0)                     ║
 * ║  Load order:  three.min.js → AssetManager.js → Factory.js        ║
 * ║                                                                  ║
 * ║  WHAT IT DOES                                                    ║
 * ║  • window.Assets — the GLB character-model pipeline:             ║
 * ║      – Loads .glb files from the assets/ folder next to the HTML ║
 * ║      – Uses the OFFICIAL three.js GLTFLoader (r160): fetched at  ║
 * ║        runtime and re-wired onto the game's global THREE via     ║
 * ║        blob modules — NO second copy of three.js is loaded.      ║
 * ║        (Verified: all 65 symbols the loader imports exist in     ║
 * ║        the UMD build.)                                           ║
 * ║      – Caches each model once; every spawn gets a fresh clone,   ║
 * ║        auto-normalized to game scale (see MANIFEST heights)      ║
 * ║  • Placeholders remain the permanent fallback: any missing file, ║
 * ║    network problem, or loader failure = that character keeps its ║
 * ║    Factory placeholder. The game NEVER breaks over assets.       ║
 * ║                                                                  ║
 * ║  HOW TO ACTUALLY USE YOUR GLB MODELS (3 steps)                   ║
 * ║   1. Make a folder called  assets  next to the game HTML and     ║
 * ║      put your .glb files in it, named as in MANIFEST below       ║
 * ║      (or edit the file names in MANIFEST to match yours).        ║
 * ║   2. In Factory.js (top of file) set:                            ║
 * ║        window.USE_PLACEHOLDERS = false;                          ║
 * ║   3. Serve the game over http, not file:// — browsers block      ║
 * ║      local file reads. Easiest options: VS Code "Live Server",   ║
 * ║      or in a terminal:  python -m http.server  (then open        ║
 * ║      http://localhost:8000), or upload to itch.io.               ║
 * ║      On file:// this manager detects the situation, logs it to   ║
 * ║      diagnostics, and quietly stays on placeholders.             ║
 * ║                                                                  ║
 * ║  TUNING A MODEL: each MANIFEST entry:                            ║
 * ║    file    the .glb file name inside assets/                     ║
 * ║    height  target in-game height (model auto-scaled to this)    ║
 * ║    y       extra vertical offset after grounding (default 0)     ║
 * ║    rotY    extra Y rotation in radians (default 0, use if the    ║
 * ║            model faces the wrong way)                            ║
 * ║    swap    false = character's animation code reaches into       ║
 * ║            specific parts (see its 'why'); its GLB is NOT        ║
 * ║            auto-swapped until an adapter session wires it up.    ║
 * ║  KNOWN LIMITS (for now): Draco-compressed GLBs are not           ║
 * ║  supported (re-export without compression); skinned/rigged      ║
 * ║  models display statically (rig animation is a later phase).     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
(function () {
  'use strict';

  // ── v23.1.0 — DOUBLE-LOAD GUARD ────────────────────────────────────────────
  // A second copy would replace window.Assets while the game holds the old one,
  // giving two independent GLB caches: every model downloaded, parsed and held
  // in memory twice. `booted` also lives in this closure, so boot() would run a
  // second time and re-fetch the entire manifest.
  if (window.Assets && window.Assets.__drddLoaded) {
    try { console.warn('[AssetManager.js] already loaded — this second copy was ignored (check for a duplicate <script> tag).'); } catch (e) {}
    return;
  }

  // ── THE MANIFEST — the one place to edit when adding models ────────────────
  // Keys match Factory function names exactly. Missing files are fine: that
  // character just keeps its placeholder (one summary line in diagnostics).
  // ── MANIFEST ───────────────────────────────────────────────────────────────
  // Per-character asset spec. Fields:
  //   file      required — exact filename in assets/ (CASE-SENSITIVE on GitHub
  //             Pages: 'Roadstumbler.glb' will NOT load as 'roadstumbler.glb')
  //   height    the model is normalised to this before anything else. Note
  //             that for characters that swap through Factory's wGLB this is
  //             then overridden by the fit-to-placeholder pass (V16.3.0) — it
  //             still matters for the Dipe Fighter rig and as a fallback.
  //   y         optional extra vertical offset after grounding
  //   rotY      V16.6.0 — degrees about Y, applied BEFORE measuring. Use when
  //             a character's procedural build faces the opposite way to the
  //             models (the _chase variants do). Applied to the model itself,
  //             so game code stays free to assign group.rotation.y.
  //   rotZ      v23.6.0 — degrees about Z (ROLL), applied BEFORE measuring.
  //             For a model lying on its SIDE, which no turn about X can fix —
  //             autoUpright has always reported this case and could never
  //             offer a way to act on it.
  //   rotX      V16.5.0 — degrees about X, applied BEFORE measuring, for a
  //             model exported lying down. A warning is logged automatically
  //             if a delivered file looks lying-down and has no rotX set.
  //   fitScale  V16.3.0 — multiplier on the fit-to-placeholder size, default 1.
  //             Use this to nudge ONE character that reads too big or small
  //             without touching any other.
  //   material  V16.4.0 — override any of {metalness, roughness,
  //             emissiveIntensity, envMapIntensity} for this character only.
  //             Defaults live in MATERIAL_DEFAULT above.
  //   swap      false pins the character to its procedural placeholder
  //   load      true loads the file anyway even when swap is false
  //   why       plain-English note explaining a swap:false
  var MANIFEST = {
    playerDRDD:              { file: 'drdd.glb',          height: 2.0, swap:false, load:true, why:'auto-swap off — the player rig system adopts this model itself (adoptPlayerGLB in the game) and drives its animation clips' },
    // V16.6.0: the Frogger player reuses the main DRDD model. Its procedural
    // build already faces +Z like the model, so no rotY is needed.
    characterDRDDFrogTop:    { file: 'drdd.glb',          height: 2.10 },  // v23.4.0: 2.0 -> 2.10 (+5%). Cosmetic only — the crossing stage's collisions are lane/constant based, not model based.
    characterDipeGenie:      { file: 'genie.glb',         height: 3.985 },  // v23.9.0: 3.465 -> 3.985 (+15%). v23.8.0: 3.15 -> 3.465 (+10%). v23.4.0: 3.0 -> 3.15 (+5%)
    characterMicFlex:        { file: 'micflex.glb',       height: 2.14, rotX:90 },  // V16.5.0: exported lying down. v23.4.0: 2.0 -> 2.14 (+7%)
    // V16.6.0: swap ENABLED — the ceremony's rage tint now recolours through
    // the model's own material (see _mfSetRage), so the bodyMesh contract no
    // longer needs the procedural build. Shares micflex.glb.
    characterMicFlexDurag:   { file: 'micflex.glb',       height: 2.14, rotX:90 },  // v23.4.0: 2.0 -> 2.14 (+7%), matching characterMicFlex
    characterDuragDada:      { file: 'duragdada.glb',     height: 2.1 },
    // V16.5.0: the durag variant has no file of its own; the base model
    // carries the same body, so both entries share duragdada.glb.
    characterDuragDadaDurag: { file: 'duragdada.glb',     height: 2.1 },
    // ── V22.3.0 — SWAP TURNED ON FOR THE THREE STOOGES ────────────────────
    // These were pinned to their placeholders because the procedural walk cycle
    // reaches into userData.legPivots, which a delivered model does not have.
    // That turned out to be safe: the walk code is already guarded
    // (`if(e.legPivots){...}` in the enemy update), so a swapped model simply
    // does not get the procedural leg swing — which is exactly what you want
    // when the .glb carries its own baked walk. See CLIPS below for the clip
    // names; a model with no matching clip just stands still, never errors.
    // NO rotX ON THESE SIX ON PURPOSE. v22.9.0 measures each delivered model
    // and turns it upright by itself (see autoUpright). Hand-guessing the sign
    // got it wrong twice; if you ever DO want to override the automatic choice,
    // adding rotX here still wins outright.
    enemyStooge_Moe:         { file: 'stooge_moe.glb',    height: 0.864, wave: 2 },  // v23.10.0: 0.96 -> 0.864 (-10%). v23.9.0: 1.13 -> 0.96 (-15%). v23.8.0: 1.33 -> 1.13 (-15%). v23.4.0: 1.9 -> 1.33 (70%)
    enemyStooge_Larry:       { file: 'stooge_larry.glb',  height: 0.864, wave: 2 },  // v23.10.0: 0.96 -> 0.864 (-10%). v23.9.0: 1.13 -> 0.96 (-15%). v23.8.0: 1.33 -> 1.13 (-15%). v23.4.0: 1.9 -> 1.33 (70%)
    enemyStooge_Curly:       { file: 'stooge_curly.glb',  height: 0.864, wave: 2 },  // v23.10.0: 0.96 -> 0.864 (-10%). v23.9.0: 1.13 -> 0.96 (-15%). v23.8.0: 1.33 -> 1.13 (-15%). v23.4.0: 1.9 -> 1.33 (70%)
    // ── V22.3.0 — the three that had no 3D form until now ─────────────────
    characterChina:          { file: 'china.glb',         height: 1.4535, wave: 2 },  // v23.8.0: 1.615 -> 1.4535 (-10%). v23.4.0: 1.9 -> 1.615 (85%)
    characterFreakyBlonde:   { file: 'freaky_blonde.glb', height: 1.4535, wave: 2 },  // v23.8.0: 1.615 -> 1.4535 (-10%). v23.4.0: 1.9 -> 1.615 (85%)
    characterDumbass:        { file: 'dumbass.glb',       height: 1.4535, wave: 2 },  // v23.8.0: 1.615 -> 1.4535 (-10%). v23.4.0: 1.9 -> 1.615 (85%)
    // ── v23.19.0 — enemyDuragStooge RETIRED (owner, Aug 11) ───────────────
    // stooge_durag.glb was never on the server; it 404'd on every boot. The
    // durag ceremony's stooges are the real Moe/Larry/Curly models, fitted
    // at spawn time in index.html's _buildDuragStooge().
    enemyOztrich:            { file: 'oztrich.glb',       height: 2.6, rotX:90 },  // V16.5.0: exported lying down
    enemyOztrichChase:       { file: 'oztrich.glb',       height: 2.6, rotX:90, rotY:180 },  // V16.5.0 / V16.6.0
    // V16.2.0: the delivered file is named pigeon.glb (the code has always
    // spelled him 'Pidgin'). Both the world and chase entries use the one file
    // — it is the same character, and it now carries its own animation clips.
    // V16.7.0: pigeon.glb's base texture is painted much lighter than the rest
    // of the cast (mean luminance 116/255 against DRDD's 56), so he read as
    // over-lit beside everything else. Toned down here, leaving the file alone.
    enemyPidgin:             { file: 'pigeon.glb',        height: 1.4, material:{ colorScale:0.72, envMapIntensity:0.42 } },
    enemyPidginChase:        { file: 'pigeon.glb',        height: 1.4, rotY:180, material:{ colorScale:0.72, envMapIntensity:0.42 } },  // V16.6.0 / V16.7.0
    enemySeagle:             { file: 'seagle.glb',        height: 1.5, rotX:90 },  // V16.5.0: exported lying down
    enemySeagleChase:        { file: 'seagle.glb',        height: 1.5, rotX:90, rotY:180 },  // V16.5.0 / V16.6.0
    enemyRoadstumbler:       { file: 'roadstumbler.glb',  height: 3.0 },
    enemyRoadstumblerBoss:   { file: 'roadstumbler.glb',  height: 3.0 },
    enemyKakapoo:            { file: 'kakapoo.glb',       height: 1.6 },
    enemyKakapooFrog:        { file: 'kakapoo.glb',       height: 1.6 },
    enemyPootoo:             { file: 'pootoo.glb',        height: 1.6 },
    enemyPootooFrog:         { file: 'pootoo.glb',        height: 1.6 },
    enemyGobbler:            { file: 'gobbler.glb',       height: 1.8 },
    enemyDooDoo:             { file: 'doodoo.glb',        height: 1.2 },
    // ── v23.19.0 — enemyMotoStooge / enemyFatStooge / enemyDodoBird RETIRED
    // (owner, Aug 11). Moto and Fat were the ORIGINAL placeholders for what
    // became China and Dumbass; their only appearances (Level 3's bosses)
    // already hot-swap to characterChina / characterDumbass via _wantGLB.
    // The dodo concept was replaced by Kakapoo, Pootoo and DooDoo long ago.
    // The procedural Factory builders all STAY — they are still the
    // pre-download placeholder bodies, just no longer download targets.
    // ── v23.6.0 — JOE L'S HEAD, THIRD ATTEMPT, AND WHY THE FIRST TWO FAILED
    // v23.3.1 set rotX:-90 on a head reported as face-DOWN. It came back
    // resting on the BACK of its head, i.e. face UP. That result is the whole
    // diagnosis, because it is impossible for the model this loader assumed:
    // a quarter turn about X takes a face pointing straight down and makes it
    // HORIZONTAL, and +90 and -90 both do so (they differ only in which
    // horizontal direction, which is invisible here because updateBoss() spins
    // the head about Y every frame). Moving the face 180 degrees, from down to
    // up, is something no single quarter turn about X can do.
    // So the file's own axes are not aligned the way rotX assumes, and the
    // turn is landing partly as ROLL. That is exactly the case autoUpright's
    // failure message has always described — "it needs rotZ, or re-exporting
    // upright" — and until v23.6.0 there was no way to act on that advice.
    // rotZ:90 is the first honest attempt on the correct axis, NOT a third
    // guess on the wrong one. If it is not right, the ladder is short and each
    // rung is a one-line edit; auto-upright cannot narrow it further because a
    // head is near-spherical and there is nothing to measure (see
    // autoupright_check.js). Try in this order:
    //     rotZ:90                 <-- shipped
    //     rotZ:-90
    //     rotZ:180
    //     rotX:90,  rotZ:90
    // The look you are after is simply UPRIGHT — which way he faces does not
    // matter, because he spins.
    // THE LADDER, COMPLETE — every rung owner-verified by screenshot:
    //   auto rotX:+90, rotZ:90  → FACE-DOWN            (v23.13.0)
    //   rotX:-90,      rotZ:90  → ON THE BACK OF HIS HEAD (v23.14.0)
    //   rotX:0,        rotZ:90  → ON HIS EAR           (v23.15.0)
    // With zero pitch the only remaining transform was the rotZ:90 roll —
    // so the roll was the last wrong guess, and the head is delivered
    // UPRIGHT needing no rotation at all. rotX:0 stays (explicit zero
    // suppresses the bbox auto, which fires on this near-spherical model
    // for no good reason); rotZ is gone. v23.16.0. If this model is ever
    // re-exported, delete rotX:0 and let the auto have one look first.
    enemyJoeLBossHead:       { file: 'joel_head.glb',     height: 4.5, rotX:0 }
  };
  // ── SEMANTIC CLIP MAPS (V16.1.0) ───────────────────────────────────────────
  // A GLB's clip names are whatever the animator called them, so the game
  // cannot guess. Name-guessing is actively DANGEROUS here: substring matching
  // "walk" against drdd.glb picks Stage_Walk, which travels 4.75m of ROOT
  // MOTION per cycle — the model would slide away from the position the game
  // thinks it is at. Every clip below was measured for root drift and only
  // in-place clips are used for looping states.
  //
  // Keys are GAME STATES, values are exact clip names inside that .glb.
  //   idle walk run jump land crouch block punch punch2 kick lowkick
  //   special hit ko death   (+ boss states: lockon charge tripped stumble)
  // A missing state is not an error — the caller falls back (see A.animator).
  // To retune, change one string; nothing else needs to move.
  var CLIPS = {
    // ── V22.3.0 — SIX CUSTOM MODELS WITH BAKED ANIMATION ──────────────────
    // EDIT THESE STRINGS to whatever your exporter called the clips. They are
    // the ONLY thing that needs changing when you drop the files in; nothing
    // in the game refers to a clip by name anywhere else.
    //
    // A missing state is never an error — the animator falls back, and a model
    // with no matching clip stands still rather than breaking. So it is safe to
    // put the files in before the names here are right, see what plays, and
    // correct one string at a time.
    //
    // Two things to check on export, both of which have cost this project a
    // session before now (DevLog section 4):
    //   1. LOOPING states (idle/walk/run) must be IN PLACE. A clip with root
    //      motion slides the model away from where the game thinks it is.
    //   2. No Draco compression — the loader here does not support it.
    _stoogeDefaults: null,   // (documentation anchor only; not a character)
    // V22.5.0 — the real clip names, as exported. A state with no clip is not
    // an error: the animator falls back, so Moe simply has no attack and Curly
    // simply has no death, and neither breaks anything.
    enemyStooge_Moe:      { idle:'Idle_8',  walk:'Walking', run:'Running',
                            hit:'Electrocution_Reaction',
                            ko:'Shot_and_Fall_Backward', death:'Shot_and_Fall_Backward' },
    enemyStooge_Larry:    { idle:'Idle_13', walk:'Walking', run:'Running',
                            punch:'Charged_Upward_Slash', special:'Charged_Upward_Slash',
                            hit:'Face_Punch_Reaction',
                            ko:'Knock_Down_1', death:'Knock_Down_1' },
    enemyStooge_Curly:    { idle:'Mirror_Viewing', walk:'Walking', run:'Running',
                            punch:'Left_Hook_from_Guard', special:'Left_Hook_from_Guard',
                            hit:'Face_Punch_Reaction' },
    characterChina:       { idle:'Idle_15', walk:'Walking', run:'Running',
                            hit:'Knock_Down',
                            ko:'dying_backwards', death:'dying_backwards' },
    characterFreakyBlonde:{ idle:'Idle_9',  walk:'Walking', run:'Running',
                            hit:'Face_Punch_Reaction_1',
                            ko:'Shot_and_Fall_Forward', death:'Shot_and_Fall_Forward' },
    characterDumbass:     { idle:'Idle_14', walk:'Slow_Orc_Walk', run:'Running',
                            punch:'Charged_Spell_Cast_1', special:'Charged_Spell_Cast_1',
                            hit:'Slap_Reaction',
                            ko:'Knock_Down_1', death:'Knock_Down_1' },

    playerDRDD: {
      // NOTE: drdd.glb has NO in-place idle clip. 'idle' is deliberately absent
      // for world levels so the player keeps the V13.10.1 step-bob at rest.
      // 'fightIdle' is used only in Dipe Fighter, where a bouncing guard
      // stance is correct (Hop_with_Arms_Raised drifts 0.0045 units — in place).
      fightIdle:'Hop_with_Arms_Raised',
      walk:'Walking', run:'Running', jump:'Regular_Jump',
      // V16.7.0 — world-level actions:
      throwDipe:'baseball_pitching',      // in place; a clean overarm pitch
      throwBomb:'Crouch_Pull_and_Throw',  // heavier two-handed wind-up for the
                                          // bomb. It carries 0.48m of travel, so
                                          // it is a ONE-SHOT only, faded back to
                                          // the movement state afterwards.
      shield:'Block2',                    // in place; braced guard
      block:'Block2', punch:'Left_Short_Hook_from_Guard',
      punch2:'Left_Uppercut_from_Guard', kick:'Step_in_High_Kick',
      lowkick:'Step_in_High_Kick', special:'baseball_pitching',
      ko:'Dead', death:'Dead'
      // 'hit' intentionally unmapped: the only candidate (Male_Head_Down_Charge)
      // travels 2.9m. Unmapped states hold the previous clip, which reads fine.
    },
    characterDipeGenie: {
      idle:'Idle_3', fightIdle:'Idle_3',
      walk:'Walking', run:'Running', jump:'Regular_Jump',
      block:'Block9', punch:'Left_Hook_from_Guard',
      punch2:'Right_Uppercut_from_Guard',
      kick:'Axe_Spin_Attack',        // Rising_Flying_Kick travels 1.9m — not used
      lowkick:'Axe_Spin_Attack', special:'Thrust_Slash',
      ko:'Dead', death:'Dead'
      // 'crouch' unmapped: Cautious_Crouch_Walk_Forward travels 1.76m.
    },
    enemyRoadstumbler: {
      // V16.7.0: idle was Dozing_Elderly, a slumped hover with no clear foot
    // contact — he looked like he was floating. Block4 is a braced, wide,
    // feet-planted stance (0.007m drift) and still suits a drunk boss squaring
    // up. Slow_Orc_Walk is the alternative if a lurch is preferred.
    idle:'Block4', fightIdle:'Block4',
      walk:'Slow_Orc_Walk', run:'Running',
      block:'Block4', punch:'Right_Hand_Sword_Slash',
      punch2:'Right_Hand_Sword_Slash', kick:'Skill_01',
      lowkick:'Skill_01', special:'High_Kick',
      hit:'BeHit_FlyUp', ko:'Shot_and_Fall_Forward', death:'Shot_and_Fall_Forward',
      // boss2 state machine (RS.state) — see updateRoadstumbler()
      lockon:'Arise', charge:'RunFast', tripped:'Shot_and_Fall_Forward',
      stumble:'Unsteady_Walk', getup:'Stand_Up4'
      // Stumble_Walk (3.2m), Lunge_Roundhouse_Kick (1.5m) and
      // Male_Head_Down_Charge (2.7m) all travel — the game moves him itself,
      // so using them would double up the motion. Deliberately unused.
    },
    enemyGobbler: {
      // gobbler.glb has no idle clip; Block9 is a settled guard stance and
      // reads correctly as "standing ready" in both the world and the arena.
      idle:'Block9', fightIdle:'Block9',
      walk:'Walking', run:'Running', jump:'Regular_Jump',
      block:'Block9', punch:'Left_Jab_from_Guard',
      punch2:'Right_Jab_from_Guard', kick:'Kick_a_Soccer_Ball',
      lowkick:'Kick_a_Soccer_Ball', special:'Kick_a_Soccer_Ball',
      ko:'Dead', death:'Dead'
    }
  };
  CLIPS.enemyRoadstumblerBoss = CLIPS.enemyRoadstumbler;   // same .glb, same clips

  // ── V16.2.0: the bird/critter four ─────────────────────────────────────────
  // Same 24-bone skeleton as the V16.1.0 set. Drift measured per clip again;
  // distances below are metres of travel per play (model ≈1.6–1.7m tall).
  CLIPS.enemyPidgin = {
    idle:'Look_Around_Dumbfounded',   // 0.6mm drift — a real idle, finally
    fightIdle:'Block8', walk:'Walking', run:'Running',
    crouch:'CrouchLookAroundBow',
    block:'Block8', punch:'Left_Hook_from_Guard', punch2:'Shield_Push_Left',
    kick:'Kick_a_Soccer_Ball', lowkick:'Kick_a_Soccer_Ball',
    special:'mage_soell_cast_4',      // reads as his Coocoustic Chaos cast
    taunt:'Shield_Push_Left',         // the Rufflin' dust-up
    charge:'Running', return:'Walking'
    // Jump_with_Arms_Open travels 2.42m — excluded, so 'jump' is unmapped.
    // No death clip in this file; 'ko' falls through and holds the pose.
  };
  CLIPS.enemyPidginChase = CLIPS.enemyPidgin;              // same .glb

  CLIPS.enemyPootoo = {
    idle:'Two_Handed_Parry', fightIdle:'Two_Handed_Parry',
    walk:'Walking', run:'Running',
    jump:'Jump_with_Arms_and_Legs_Open',   // 3mm drift — genuinely in place
    fly:'Jump_with_Arms_and_Legs_Open',    // spread-eagle: reads as gliding
    block:'Two_Handed_Parry',
    punch:'Charged_Upward_Slash', punch2:'Charged_Upward_Slash',
    kick:'Leg_Sweep', lowkick:'Leg_Sweep',      // 19cm lunge — fine for a sweep
    special:'FunnyDancing_01',
    ko:'Electrocuted_Fall', death:'Electrocuted_Fall'
    // FunnyDancing_01 drifts 17cm per 7.8s loop, so it is a one-shot special
    // only — never an idle, or he would creep across the arena.
  };
  CLIPS.enemyPootooFrog = CLIPS.enemyPootoo;               // same .glb

  CLIPS.enemyKakapoo = {
    idle:'Block2', fightIdle:'Block2', walk:'Walking', run:'Running',
    block:'Block2',
    punch:'Punch_Forward_with_Both_Fists', punch2:'Punch_Forward_with_Both_Fists',
    kick:'Sweeping_Kick', lowkick:'Sweeping_Kick',
    special:'Punch_Forward_with_Both_Fists',
    taunt:'Confused_Scratch',          // used only as a ~0.5s beat, see below
    ko:'Knock_Down', death:'Knock_Down'
    // Confused_Scratch drifts 9cm over its full 11.5s, so it is never looped
    // as an idle — only played in short bursts where the drift can't build up.
  };
  CLIPS.enemyKakapooFrog = CLIPS.enemyKakapoo;             // same .glb

  // ── V16.5.0: MicFlex, Durag Dada, Seagle, Oztrich ─────────────────────────
  // Same 24-bone skeleton again. Drift measured as before; several of these
  // files also contain UUID-named clips (019fa185-…) which are unlabelled
  // exporter leftovers — deliberately unmapped, since there is no way to know
  // what they are meant to depict.
  //
  // NOTE ON 'fightIdle'. Its presence is what switches a character to clip
  // mode in Dipe Fighter (see buildGLBRig). Three of these four are given NO
  // fightIdle ON PURPOSE: they simply do not ship a usable attack set, and the
  // procedural posing they already have gives them distinct punches, kicks and
  // blocks driven by the fight engine. Swapping that for one clip replayed for
  // every move would be a downgrade. They still animate fully in the world
  // levels, where idle/walk/run is all that is asked of them.
  CLIPS.characterMicFlex = {
    idle:'Idle_03', walk:'Walking', run:'Running',
    special:'Proud_Strut',
    shoot:'Proud_Strut',      // V16.7.0 — stand-in recoil beat for the shotdipe
    rage:'Proud_Strut'
    // No fightIdle: micflex.glb has no block/punch/kick clips at all.
    // run_fast_7 is excluded — its hips spike to ~13x standing height on one
    // frame, which reads as a glitch rather than a run.
  };

  CLIPS.characterDuragDada = {
    idle:'Block2', fightIdle:'Block2',      // no idle clip; a settled guard reads as "ready"
    walk:'Walking', run:'Running', jump:'Jump_with_Arms_and_Legs_Open',
    block:'Block2',
    punch:'Left_Hook_from_Guard', punch2:'Left_Hook_from_Guard',
    kick:'Sweeping_Kick', lowkick:'Sweeping_Kick',
    special:'Not_Your_Mom',
    calm:'Not_Your_Mom',      // V16.7.0 — the ceremony's talk-him-down gesture
    ko:'Shot_and_Slow_Fall_Backward', death:'Shot_and_Slow_Fall_Backward'
    // The only one of these four with a real fighting set, so the only one
    // switched to clip mode in the arena.
    // run_fast_6 travels 1.84m per play — excluded.
  };
  CLIPS.characterDuragDadaDurag = CLIPS.characterDuragDada;   // same .glb
  CLIPS.characterMicFlexDurag   = CLIPS.characterMicFlex;     // same .glb (V16.6.0)
  CLIPS.characterDRDDFrogTop    = CLIPS.playerDRDD;           // same .glb (V16.6.0)

  CLIPS.enemySeagle = {
    idle:'Look_Around_Dumbfounded', walk:'Walking', run:'Running',
    punch:'Charged_Upward_Slash', special:'Charged_Upward_Slash',
    dive:'Charged_Upward_Slash', return:'Running',   // chase-level states
    ko:'Knock_Down_1', death:'Knock_Down_1'
    // No fightIdle: one attack clip only. Knock_Down_1 travels 0.49m, which is
    // correct for a knockdown but makes it a one-shot only.
  };
  CLIPS.enemySeagleChase = CLIPS.enemySeagle;                 // same .glb

  CLIPS.enemyOztrich = {
    idle:'Mirror_Viewing', walk:'Walking', run:'Running',
    jump:'Regular_Jump',
    charge:'RunFast', return:'Walking',              // chase-level states
    ko:'Shot_and_Fall_Forward', death:'Shot_and_Fall_Forward'
    // No fightIdle: the only attack is Flying_Fist_Kick, which lunges 1.38m.
    // The fight engine does not move the fighter, so the model would slide a
    // metre and a half forward then snap back. Block10 also travels 0.20m.
    // Both excluded; his procedural fighting stays.
  };
  CLIPS.enemyOztrichChase = CLIPS.enemyOztrich;               // same .glb

  CLIPS.enemyDooDoo = {    idle:'Look_Around_Dumbfounded', fightIdle:'Look_Around_Dumbfounded',
    walk:'Walking', run:'Running',
    block:'Block8',
    punch:'Charged_Upward_Slash', punch2:'Charged_Upward_Slash',
    kick:'Boxing_Guard_Right_Straight_Kick', lowkick:'Boxing_Guard_Right_Straight_Kick',
    special:'Charged_Upward_Slash',
    ko:'Shot_and_Fall_Backward', death:'Shot_and_Fall_Backward'
  };

  var PATH = 'assets/';
  var CDN  = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/';

  var A = {};
  var loader = null;
  var skeletonClone = null;   // SkeletonUtils.clone, if the fetch succeeded
  var cache = {};        // key → normalized template Object3D
  var failedBoot = false;
  var booted = false;
  var skinWarned = false;

  function diag(kind, msg) {
    try { if (window.__DIAG) window.__DIAG.push(kind, ['[Assets] ' + msg]); } catch (e) {}
    try { console[kind === 'error' ? 'error' : (kind === 'warn' ? 'warn' : 'log')]('[AssetManager.js] ' + msg); } catch (e) {}
  }

  // ── Bootstrap the OFFICIAL GLTFLoader onto the global THREE ────────────────
  // r148+ ships loaders as ES modules importing from 'three'. We fetch the
  // official sources, generate a shim module that re-exports every property of
  // the already-loaded global THREE, rewrite the loader's import specifiers to
  // point at that shim (blob URLs), and dynamic-import the result. One THREE.
  function bootstrapLoader() {
    var names = Object.keys(window.THREE).filter(function (n) { return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n); });
    var shimSrc = 'var T = window.THREE;\n' + names.map(function (n) { return 'export var ' + n + ' = T.' + n + ';'; }).join('\n');
    var shimUrl = URL.createObjectURL(new Blob([shimSrc], { type: 'text/javascript' }));
    function fetchText(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + u); return r.text(); }); }
    return fetchText(CDN + 'utils/BufferGeometryUtils.js').then(function (bgu) {
      bgu = bgu.replace(/from\s+['"]three['"]/g, "from '" + shimUrl + "'");
      var bguUrl = URL.createObjectURL(new Blob([bgu], { type: 'text/javascript' }));
      return fetchText(CDN + 'loaders/GLTFLoader.js').then(function (src) {
        src = src.replace(/from\s+['"]three['"]/g, "from '" + shimUrl + "'")
                 .replace(/from\s+['"][^'"]*BufferGeometryUtils\.js['"]/g, "from '" + bguUrl + "'");
        var url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        return import(url).then(function (mod) {
          // Also bootstrap SkeletonUtils — a plain Object3D.clone() does NOT
          // correctly re-link a SkinnedMesh to its cloned bones (the mesh
          // keeps rendering from the ORIGINAL cached skeleton's pose, so a
          // rigged model appears in the scene graph but visually never
          // moves/animates, no matter how its wrapper group is transformed).
          // SkeletonUtils.clone() clones bones and mesh together, correctly
          // linked. If this fetch fails for any reason, skinnedClone stays
          // null and get() below falls back to the plain clone (rigged
          // models just keep the pre-existing static-display limitation).
          return fetchText(CDN + 'utils/SkeletonUtils.js').then(function (sk) {
            sk = sk.replace(/from\s+['"]three['"]/g, "from '" + shimUrl + "'");
            var skUrl = URL.createObjectURL(new Blob([sk], { type: 'text/javascript' }));
            return import(skUrl).then(function (skMod) {
              return { GLTFLoader: mod.GLTFLoader, skeletonClone: skMod.clone };
            });
          }).catch(function () {
            return { GLTFLoader: mod.GLTFLoader, skeletonClone: null };
          });
        });
      });
    });
  }

  // ── Normalize a loaded scene to game scale ─────────────────────────────────
  // ── V16.4.0: MATERIAL TUNING ───────────────────────────────────────────────
  // Every delivered .glb carries the same exporter preset, and two settings in
  // it fight this game's renderer badly:
  //   • metallicFactor = 1.0 with NO metallicRoughness texture to vary it, so
  //     the whole character is solid metal. Combined with roughness 0.41 that
  //     is a polished-chrome surface, and Engine.js lights the scene with a
  //     PMREM environment probe, which chrome mirrors straight back.
  //   • emissiveFactor = [1,1,1] with the BASE COLOUR MAP wired in as the
  //     emissive map, so each model also glows its own texture at full
  //     strength — light it does not receive from the scene and which cannot
  //     be shaded, then amplified again by the bloom pass.
  // That second one explains why DRDD looked least affected: emissive output
  // is the model's own texture, and his is by far the darkest (mean luminance
  // 56 of 255, against 162 for Kakapoo and 136 for DooDoo), so he glowed least.
  // He was never "correct", only dimmer.
  //
  // These are characters — cloth, skin, feathers — so the right answer is
  // non-metallic, fairly matte, not self-lit. Tuned on the shared template so
  // every clone inherits it at no per-spawn cost.
  // Escape hatches: window.GLB_MATFIX = false disables the pass entirely; a
  // per-character `material` block in MANIFEST overrides any single value.
  var MATERIAL_DEFAULT = {
    metalness: 0.0,          // was 1.0 — the whole problem
    roughness: 0.75,         // was 0.41 — a soft sheen, not a mirror
    emissiveIntensity: 0.0,  // was full-strength self-glow of the base texture
    envMapIntensity: 0.6,    // slightly under-weight the probe on characters
    // V16.7.0 — multiplies the base colour map. 1.0 leaves the texture as
    // authored; below 1 darkens it. Some models are painted brighter than the
    // rest of the cast and stand out against the levels.
    colorScale: 1.0
  };
  function tuneMaterials(root, key) {
    try {
      if (window.GLB_MATFIX === false) return;
      var spec = MANIFEST[key] || {}, over = spec.material || {};
      var cfg = {};
      for (var p in MATERIAL_DEFAULT) cfg[p] = (p in over) ? over[p] : MATERIAL_DEFAULT[p];
      var touched = 0;
      root.traverse(function (o) {
        if (!o.isMesh || !o.material) return;
        var list = Array.isArray(o.material) ? o.material : [o.material];
        list.forEach(function (m) {
          if (!m || m.__drddTuned) return;
          if (typeof m.metalness === 'number') m.metalness = cfg.metalness;
          // never make a surface glossier than it already was
          if (typeof m.roughness === 'number') m.roughness = Math.max(m.roughness, cfg.roughness);
          // keep emissiveMap attached so the glow can be dialled back up later
          if (m.emissive) m.emissiveIntensity = cfg.emissiveIntensity;
          if (typeof m.envMapIntensity === 'number' || m.isMeshStandardMaterial) m.envMapIntensity = cfg.envMapIntensity;
          if (cfg.colorScale !== 1 && m.color) m.color.multiplyScalar(cfg.colorScale);
          // ── V16.8.0: SEE-THROUGH LIMBS ────────────────────────────────────
          // Several exports mark their one material alphaMode:BLEND. A blended
          // material does not write depth, so when an arm swings in front of
          // the torso the renderer has no record that the torso is behind it —
          // whichever triangles happen to draw later show through, and the
          // body flickers transparent as the pose changes. Two of the files
          // are marked BLEND despite a fully opaque texture (genie,
          // roadstumbler); three genuinely use alpha for hair/feather edges
          // (gobbler, pigeon, pootoo). One fix covers both: switch to CUTOUT —
          // opaque, depth-writing, with alphaTest discarding only the truly
          // transparent texels. Opaque textures are untouched by the test
          // (every texel passes), and the cutout edges keep their shape.
          if (m.transparent) {
            m.transparent = false;
            m.depthWrite = true;
            if (m.map) m.alphaTest = 0.5;
          }
          m.__drddTuned = true; m.needsUpdate = true; touched++;
        });
      });
      if (touched) diag('log', 'materials tuned for ' + key + ' (' + touched +
        '): metalness→' + cfg.metalness + ', roughness≥' + cfg.roughness +
        ', emissive→' + cfg.emissiveIntensity);
    } catch (e) { diag('warn', 'material tune skipped for ' + key + ': ' + (e && e.message)); }
  }

  /** ── V22.9.0 — AUTO-UPRIGHT ────────────────────────────────────────────
   *  A humanoid or bird is always taller than it is deep. If a delivered file
   *  measures deeper than tall it was exported lying down, and the fix is a
   *  quarter turn about X — but WHICH WAY depends on the exporter, and there
   *  is no way to know from the outside without looking at it.
   *
   *  Guessing that by hand has now cost three rounds: this codebase's existing
   *  lying-down models (micflex, oztrich, seagle) all use rotX:90, the six new
   *  characters were given rotX:-90, and they came out on their backs and at
   *  odd angles. So it is measured instead of guessed. Try +90; if that stands
   *  the model up, keep it. Otherwise try -90. If neither helps, leave it flat
   *  and say so — a wrong guess that LOOKS deliberate is worse than an honest
   *  report.
   *
   *  An explicit rotX in the MANIFEST always wins; this only ever runs when
   *  none was given, so it can never override a hand-tuned value.
   *  Exposed as A._autoUpright so it can be tested directly. */
  function autoUpright(sceneRoot, key) {
    // ── 1. THE SKELETON, when there is one ────────────────────────────────
    // A BOUNDING BOX CANNOT TELL "ON ITS BACK" FROM "ON ITS BELLY" — both are
    // flat, both measure deeper than tall, and they need OPPOSITE quarter
    // turns. That is why the v22.9.0 box-only version could not fix Curly and
    // Larry (belly) and Moe (back) at the same time no matter which way it
    // guessed. The rig knows: the vector from the hips to the head is the
    // model's own up-axis, and its SIGN distinguishes the two cases.
    var head = null, hips = null, lowest = null;
    sceneRoot.updateMatrixWorld(true);
    sceneRoot.traverse(function (o) {
      if (!o.isBone) return;
      var n = (o.name || '').toLowerCase();
      if (!head && /head/.test(n) && !/end|_top|nub|tip/.test(n)) head = o;
      if (!hips && /(hips|pelvis|spine01|spine_01|^root$)/.test(n)) hips = o;
      if (!lowest) lowest = o;
    });
    if (!hips) hips = lowest;
    if (head && hips && THREE.Vector3) {
      var hp = new THREE.Vector3(), tp = new THREE.Vector3();
      head.getWorldPosition(tp); hips.getWorldPosition(hp);
      var v = tp.sub(hp);
      var ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
      var report = 'hips→head (' + v.x.toFixed(2) + ', ' + v.y.toFixed(2) + ', ' + v.z.toFixed(2) + ')';
      if (ay >= ax && ay >= az) {
        diag('log', key + ' is upright as delivered — ' + report);
        return 0;                                   // already standing
      }
      if (az >= ax) {
        // Body runs along Z. Rx(-90) maps +Z onto +Y; Rx(+90) maps -Z onto +Y.
        var deg = (v.z > 0) ? -90 : 90;
        sceneRoot.rotation.x = deg * Math.PI / 180;
        diag('log', key + ' was exported lying ' + (v.z > 0 ? 'head-toward +Z' : 'head-toward -Z') +
          ' — stood up with rotX:' + deg + ' (' + report + ')');
        return deg;
      }
      diag('warn', key + ' has its body running along X (' + report + '), which a turn about X ' +
        'cannot fix. It needs rotZ, or re-exporting upright. Left as delivered.');
      return 0;
    }

    // ── 2. NO RIG: fall back to the bounding box ──────────────────────────
    // Without bones there is no way to tell back from belly, so this only
    // guarantees the model is STANDING, not which way it faces. It reports
    // what it did so a wrong facing can be corrected with an explicit rotX.
    function aspect() {
      var b = A.boxOf(sceneRoot);
      if (!b) return null;
      return { h: b.h, d: b.d, upright: b.h > b.d * 1.05 };
    }
    var before = aspect();
    if (!before || before.upright) return 0;
    var tries = [90, -90], i, best = null;
    for (i = 0; i < tries.length; i++) {
      sceneRoot.rotation.x = tries[i] * Math.PI / 180;
      var after = aspect();
      if (after && after.upright) { best = tries[i]; break; }
    }
    if (best === null) {
      sceneRoot.rotation.x = 0;
      diag('warn', key + ' measures deeper (' + before.d.toFixed(2) + ') than tall (' +
        before.h.toFixed(2) + '), has no skeleton to read, and neither turn about X stands it up. ' +
        'Left as delivered — it probably needs re-exporting upright.');
      return 0;
    }
    diag('log', key + ' has no skeleton; stood up by its bounding box with rotX:' + best +
      '. If it now faces the wrong way, set rotX explicitly in the MANIFEST.');
    return best;
  }
  A._autoUpright = autoUpright;

  function normalize(sceneRoot, spec, key) {
    var wrap = new THREE.Group();
    wrap.add(sceneRoot);
    // ── V16.5.0: ORIENTATION ────────────────────────────────────────────────
    // micflex.glb, seagle.glb and oztrich.glb are exported LYING DOWN — their
    // skeletons sit 90 degrees about X from the rest of the set, so head_end
    // is BELOW Hips and the body runs along Z instead of Y. The clips are
    // authored for upright characters, so playing them does not correct it;
    // the figure just animates on its back. Left alone, normalize() treats the
    // body's THICKNESS as its height and scales to match — micflex came out
    // three times wider than tall. Applied before any measurement so height,
    // grounding and the fit-to-placeholder pass all see it standing up.
    // YXZ order matters: the yaw must be applied AFTER the stand-up rotation,
    // or a lying-down model that also needs flipping ends up upside down.
    sceneRoot.rotation.order = 'YXZ';
    // An explicit rotX always wins. Without one, measure and correct.
    // v23.15.0 — PRESENT means explicit, including zero. This used to be a
    // truthiness test, so rotX:0 fell through to autoUpright — but "apply no
    // pitch and DON'T guess" is exactly what a near-spherical model like Joe
    // L's head needs (the ±90 evidence below proves he is delivered upright).
    if (spec.rotX != null) sceneRoot.rotation.x += spec.rotX * Math.PI / 180;
    else autoUpright(sceneRoot, key);
    // ── V16.6.0: FACING ─────────────────────────────────────────────────────
    // Every delivered model faces +Z, which is also the game's own convention
    // (player yaw and most enemies are set with atan2(dx,dz), mapping local +Z
    // onto the travel direction). The CHASE variants are the exception: their
    // procedural builds put the beak at -Z, so the chase code applies a fixed
    // rotation.y = PI to turn them toward the player. A +Z model given that
    // same PI ends up facing AWAY — exactly how the Pigeon appeared.
    // rotY corrects it on the model itself. It must live here rather than on
    // the wrap group, because the chase code assigns wrap.rotation.y directly
    // every frame and would overwrite anything set there.
    if (spec.rotY) sceneRoot.rotation.y += spec.rotY * Math.PI / 180;
    // ── v23.6.0 — rotZ, the axis this loader could never express ───────────
    // autoUpright's own failure message has always said "It needs rotZ, or
    // re-exporting upright" — for a model whose body runs along X, which no
    // turn about X can fix. There was no way to act on that advice: the
    // manifest supported rotX and rotY only. It does now.
    // ROLL, not pitch or yaw. Use it when a model is lying on its SIDE, or when
    // rotX makes a face-down model face UP instead of standing it up (which is
    // the signature of a file whose own axes are not aligned the way rotX
    // assumes). Applied before measuring, like the other two, and on the model
    // rather than the wrap group for the same reason rotY is.
    if (spec.rotZ) sceneRoot.rotation.z += spec.rotZ * Math.PI / 180;
    // V16.3.0: measure via A.boxOf, not Box3.setFromObject — see the note on
    // boxOf. Using the raw Box3 here made every rigged model 1.8×–3.6× larger
    // than its manifest height asked for, by a different factor per file.
    var mb = A.boxOf(sceneRoot);
    var box = mb ? mb.box : new THREE.Box3().setFromObject(sceneRoot);
    var size = new THREE.Vector3(); box.getSize(size);
    var s = (spec.height || 2.0) / Math.max(size.y, 0.0001);
    sceneRoot.scale.setScalar(s);
    mb = A.boxOf(sceneRoot);
    box = mb ? mb.box : box.setFromObject(sceneRoot);
    var center = new THREE.Vector3(); box.getCenter(center);
    sceneRoot.position.x -= center.x;                       // center on origin
    sceneRoot.position.z -= center.z;
    sceneRoot.position.y -= box.min.y;                      // feet on y=0
    sceneRoot.position.y += (spec.y || 0);
    // Flag any FUTURE file that looks like it was exported lying down, so it is
    // caught on delivery rather than by eye in the game.
    try {
      var _ob = A.boxOf(sceneRoot);
      // autoUpright above has already tried to fix this; if it is STILL flat
      // here, neither turn worked and the warning is the honest outcome.
      if (_ob && _ob.d > _ob.h * 1.35) diag('warn', key + ' is still lying down after auto-correction' +
        ' (depth ' + _ob.d.toFixed(2) + ' vs height ' + _ob.h.toFixed(2) + ') — it will be sized by its thickness.');
    } catch (e) {}
    var hasSkin = false;
    wrap.traverse(function (o) {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        if (o.isSkinnedMesh) {
          hasSkin = true;
          if (!skinWarned) { skinWarned = true; diag('log', 'a model contains a skinned rig — using SkeletonUtils for correct per-instance cloning'); }
        }
      }
    });
    wrap.__hasSkin = hasSkin;
    return wrap;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** True once a model for this Factory key is loaded and usable. */
  /** For Factory's auto-swap: loaded AND allowed to swap. */
  A.has = function (key) { return !!cache[key] && !(MANIFEST[key] && MANIFEST[key].swap === false); };
  /** Loaded at all (adapter systems use this + A.get directly). */
  A.loaded = function (key) { return !!cache[key]; };

  /** A fresh, game-scaled clone of the model for this key (or null). */
  A.get = function (key) {
    var t = cache[key];
    if (!t) return null;
    try {
      var c;
      if (t.__hasSkin && skeletonClone) { c = skeletonClone(t); c.__hasSkin = true; }
      else { c = t.clone(true); }
      c.__clips = t.__clips || [];                  // clips retarget by node name — safe to share
      return c;
    }
    catch (e) { diag('warn', 'clone failed for ' + key + ' — using placeholder this spawn'); return null; }
  };

  /** The semantic game-state → clip-name map for a key (or null). */
  A.clipMap = function (key) { return CLIPS[key] || null; };

  // ── V16.3.0: FIT A MODEL TO THE SPACE ITS PLACEHOLDER OCCUPIED ─────────────
  // The MANIFEST `height` normalises a model in isolation, which is not enough:
  //   • Every level's spawn heights, camera framing and collision were tuned
  //     around the PROCEDURAL characters, and those are built centred on the
  //     origin with their feet BELOW y=0 (-0.75 to -2.26 depending on the
  //     character). normalize() grounds a GLB's feet AT y=0, so a swapped model
  //     hangs in the air by exactly that much.
  //   • Some builders take a scale argument (the Frogger villains are built at
  //     2.2×), which wGLB cannot forward to a model — so those came out at
  //     roughly half size.
  //   • The heights themselves were never consistent: measured against their
  //     own placeholders the eight models ranged from 19% to 102% of the size
  //     they were replacing, so characters no longer read correctly against the
  //     environment or each other.
  // Fitting to the placeholder's own box fixes all three at once and preserves
  // every art-direction decision already made. Set window.GLB_FIT = false to
  // fall back to raw manifest heights.

  /** Measure an object's world bounding box → {minY,h,cx,cz}, or null.
   *
   *  IMPORTANT (V16.3.0): a plain THREE.Box3().setFromObject() gives the WRONG
   *  answer for rigged characters, and every model in this game is rigged.
   *  Since r158, Box3 prefers a SkinnedMesh's own `boundingBox` — the POSED
   *  box, derived from the live bone matrices — over the geometry's. Straight
   *  after a load or a SkeletonUtils clone those bone matrices are not current
   *  yet, and the cached result is kept forever, so the measurement is simply
   *  whatever half-built state the skeleton happened to be in.
   *  Measured against the real files that came out 1.8×–3.6× too small,
   *  differently per model — which is exactly why characters were arriving at
   *  inconsistent sizes. Forcing the matrices and skeleton up to date and
   *  dropping the stale cache first returns the true figure (verified against
   *  each .glb's own vertex bounds).
   *  Note the geometry box is NOT a valid substitute here: skinned vertices are
   *  positioned by the bones, not by the mesh's own transform, so on these
   *  files it reports ~1/100th of the real size. */
  A.boxOf = function (obj) {
    try {
      if (!obj || !window.THREE || !THREE.Box3) return null;
      obj.updateMatrixWorld(true);
      obj.traverse(function (o) {
        if (o.isSkinnedMesh) {
          try { if (o.skeleton) o.skeleton.update(); } catch (e) {}
          o.boundingBox = null; o.boundingSphere = null;
        }
      });
      var b = new THREE.Box3().setFromObject(obj);
      var h = b.max.y - b.min.y;
      if (!isFinite(h) || h <= 0.001) return null;
      return { minY: b.min.y, h: h, cx: (b.min.x + b.max.x) / 2, cz: (b.min.z + b.max.z) / 2,
               w: b.max.x - b.min.x, d: b.max.z - b.min.z, box: b };
    } catch (e) { return null; }
  };

  /** Resize + reseat `model` so it fills the same box the placeholder did.
   *  The adjustment is applied to the model's CHILDREN, never to the model's
   *  own scale/position — call sites routinely overwrite those (the genie does
   *  .scale.setScalar(0.88), the Roadstumbler does .scale.set(0.78,…)), and a
   *  fit written there would be silently discarded. */
  A.fitToBox = function (model, box, fitScale) {
    try {
      if (!model || !box || window.GLB_FIT === false) return false;
      var b = A.boxOf(model); if (!b) return false;
      var k = (box.h / b.h) * (fitScale || 1);
      var i, c;
      for (i = 0; i < model.children.length; i++) {
        c = model.children[i]; c.scale.multiplyScalar(k); c.position.multiplyScalar(k);
      }
      model.updateMatrixWorld(true);
      b = A.boxOf(model); if (!b) return false;
      var dy = box.minY - b.minY, dx = box.cx - b.cx, dz = box.cz - b.cz;
      for (i = 0; i < model.children.length; i++) {
        c = model.children[i]; c.position.x += dx; c.position.y += dy; c.position.z += dz;
      }
      model.updateMatrixWorld(true);
      return true;
    } catch (e) { return false; }
  };

  /** Are there real, playable clips on this model?
   *  A single-keyframe clip has duration 0 and animates nothing — treating it
   *  as "animated" is what silently froze the player in the first drdd.glb
   *  export, because it suppressed the step-bob fallback without replacing it. */
  A.hasUsableClips = function (model) {
    var c = (model && model.__clips) || [];
    for (var i = 0; i < c.length; i++) if (c[i] && c[i].duration > 0.001) return true;
    return false;
  };

  /** Build an animation controller for a model instance.
   *  Returns null when the model has no usable clips, so every caller can say
   *  `var an = Assets.animator(m,key); if(an){...} else {/ * old behaviour * /}`
   *  and keep its existing procedural animation untouched.
   *
   *    an.play('walk')                 loop, cross-faded
   *    an.play('punch',{loop:false})   one-shot, holds last frame
   *    an.has('idle')                  is that state mapped AND present?
   *    an.update(dt)                   call once per frame (dt in SECONDS)
   *    an.stop()                       fade everything out (back to rest pose)
   */
  A.animator = function (model, key) {
    try {
      if (!model || !window.THREE || !THREE.AnimationMixer) return null;
      if (!A.hasUsableClips(model)) return null;
      // No semantic map means every play() would miss and the model would sit
      // frozen on its rest pose — worse than the procedural animation it would
      // be replacing. Refuse, and let the caller keep what it already had.
      var map = CLIPS[key];
      if (!map) return null;
      var byName = {};
      (model.__clips || []).forEach(function (c) { if (c && c.duration > 0.001) byName[c.name] = c; });
      // ── V22.6.0 — ON-SCREEN CLIP REPORT ─────────────────────────────────
      // The only way to find out what an exporter actually called the clips has
      // been to open a console, and this project is built on a phone that does
      // not have one. So: the first time a model is animated, if NOT ONE of the
      // names in its CLIPS map exists in the file, say so on screen and list
      // what the file really contains. Reported once per key, never repeated.
      A.clipNames = A.clipNames || {};
      A.clipNames[key] = Object.keys(byName);
      A.__reported = A.__reported || {};
      if (!A.__reported[key]) {
        var wanted = [], hit = 0, st;
        for (st in map) { if (map[st]) { wanted.push(map[st]); if (byName[map[st]]) hit++; } }
        if (wanted.length && hit === 0) {
          A.__reported[key] = true;
          var real = Object.keys(byName);
          if (window.showMessage) {
            window.showMessage('⚠️ ' + key + ': none of the expected clips exist. The file has: ' +
              (real.length ? real.join(', ') : '(no clips at all)'), '#ffae3a');
          }
        }
      }
      var mixer = new THREE.AnimationMixer(model);
      var curClip = null, curState = '';

      function resolve(state) { var n = map[state]; return (n && byName[n]) || null; }

      return {
        mixer: mixer,
        has: function (state) { return !!resolve(state); },
        state: function () { return curState; },
        /** Length of the clip bound to a state, in seconds (0 if unmapped).
         *  Lets a caller stretch a one-shot to fit a game action's duration. */
        duration: function (state) { var c = resolve(state); return c ? c.duration : 0; },
        play: function (state, opt) {
          var c = resolve(state);
          if (!c) return false;                      // unmapped → caller decides
          if (c === curClip) { curState = state; return true; }
          opt = opt || {};
          var loop = (opt.loop !== false);
          var fade = (opt.fade == null) ? 0.18 : opt.fade;
          try {
            if (curClip) mixer.clipAction(curClip).fadeOut(fade);
            var a = mixer.clipAction(c);
            a.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
            a.clampWhenFinished = !loop;
            a.timeScale = opt.speed || 1;
            a.fadeIn(fade).play();
            curClip = c; curState = state;
            return true;
          } catch (e) { return false; }
        },
        stop: function (fade) {
          try { if (curClip) mixer.clipAction(curClip).fadeOut(fade == null ? 0.18 : fade); } catch (e) {}
          curClip = null; curState = '';
        },
        update: function (dt) { try { mixer.update(dt || 0); } catch (e) {} },
        dispose: function () { try { mixer.stopAllAction(); mixer.uncacheRoot(model); } catch (e) {} }
      };
    } catch (e) { return null; }
  };

  // ── v23.3.0 — PROGRESS, SO A LOADING SCREEN CAN ACTUALLY WAIT ─────────────
  // Everything below existed as private counters that nothing outside could
  // see. Both loading screens were therefore pure timers: the startup screen
  // animated a decorative bar and dismissed on a fixed delay, and the level
  // screen held a 4s minimum and hoped. Neither ever asked whether the models
  // had arrived, so on a phone the game routinely started on placeholders.
  //
  // The music already did this properly (_musicReady / MUSIC_WAIT_MS in
  // index.html polls until the track is genuinely decoded). This exposes the
  // same kind of signal for models.
  //
  // STATE is the important part, not the numbers. A screen that waits for
  // 'complete' must know the difference between "still downloading" and "this
  // is never going to finish", or a player on file://, or with a dead CDN, or
  // an old browser, is stuck on a loading screen forever with no way into the
  // game at all. That would be a far worse bug than the one being fixed.
  //   'idle'     boot() has not been called yet
  //   'loading'  files are in flight — a screen may legitimately wait
  //   'complete' every file has resolved, succeeded or failed. Waiting is done.
  //   'off'      the pipeline cannot run at all (file://, no THREE, no fetch,
  //              loader bootstrap failed). Placeholders are permanent for this
  //              session and NOTHING should ever wait on it.
  var _state = 'idle';
  var _prog = { done: 0, total: 0, ok: 0, miss: 0 };
  function setState(s) {
    _state = s;
    try { if (window.__onGLBProgress) window.__onGLBProgress(A.progress()); } catch (e) {}
  }
  function bumpProgress() {
    try { if (window.__onGLBProgress) window.__onGLBProgress(A.progress()); } catch (e) {}
  }
  /** Live view of the preload. Safe to call at any time, including before
   *  boot(). Never throws. */
  A.progress = function () {
    return {
      state: _state,
      done: _prog.done, total: _prog.total, ok: _prog.ok, miss: _prog.miss,
      // v23.11.0 — manifest keys not yet settled, so the loading screens can
      // name the characters still on their way. Empty once everything lands.
      waiting: (function () {
        var w = _prog.wait ? Object.keys(_prog.wait) : [];
        // v24.3.0 — retry-able misses stay on the list: they are still coming
        // as long as a hold is retrying them (owner: the names vanished).
        if (_prog.retryable) {
          var r = Object.keys(_prog.retryable);
          for (var ri = 0; ri < r.length; ri++) if (w.indexOf(r[ri]) < 0) w.push(r[ri]);
        }
        return w;
      })(),
      // Convenience for a progress bar. 0 when nothing is known yet; 1 when
      // there is nothing to wait for, so a bar never sits at 0% forever.
      ratio: _prog.total ? (_prog.done / _prog.total) : (_state === 'loading' ? 0 : 1),
      // THE question a loading screen actually asks. True means "stop waiting",
      // whether that is because everything arrived or because nothing ever will.
      settled: (_state === 'complete' || _state === 'off'),
      // ── v23.20.0 — what the stricter gates ask (owner, Aug 12) ──────────
      // loaded: every manifest key actually ARRIVED (not merely settled).
      // missTransient: settled misses that a retry could still save
      // (connection-class); zero once only server-missing files remain.
      loaded: _prog.total ? (_prog.ok >= _prog.total) : (_state !== 'loading'),
      missTransient: Math.max(0, _prog.miss - (_prog.missPerm || 0))
    };
  };

  /** Fire-and-forget boot: build the loader, then preload the manifest.
   *  Placeholders are used until (and unless) each model arrives. */
  A.boot = function () {
    if (booted) return; booted = true;
    // ── v23.1.0 — check THREE before anything reaches for it ──────────────
    // bootstrapLoader() opens with Object.keys(window.THREE). With THREE absent
    // that is a synchronous TypeError thrown straight out of boot(), BEFORE the
    // promise chain exists — so it escaped this function's own careful
    // catch/diag handling entirely and landed in the caller. Every other failure
    // mode in here degrades to placeholders; this one did not.
    if (typeof window.THREE === 'undefined') {
      diag('warn', 'THREE is not loaded, so the GLB pipeline cannot start — placeholders stay on. This normally means the Three.js download failed.');
      setState('off');
      return;
    }
    if (location.protocol === 'file:') {
      diag('warn', 'running from file:// — browsers block reading local .glb files, so placeholders stay on. To use your GLB models, serve over http (VS Code Live Server / python -m http.server) or upload the folder to a host like itch.io.');
      setState('off');
      return;
    }
    if (!window.fetch || typeof Blob === 'undefined') {
      diag('warn', 'browser lacks fetch/Blob — placeholders stay on');
      setState('off');
      return;
    }
    setState('loading');
    bootstrapLoader().then(function (boot) {
      loader = new boot.GLTFLoader();
      skeletonClone = boot.skeletonClone;
      diag('log', 'official GLTFLoader ready (bootstrapped onto global THREE)' +
        (skeletonClone ? ', SkeletonUtils ready (rigged models will animate correctly per-instance)' : ' — SkeletonUtils unavailable, rigged models will display statically'));
      var all = Object.keys(MANIFEST);
      var deferred = all.filter(function (k) { return MANIFEST[k].swap === false && !MANIFEST[k].load; });
      // ── V22.7.0 — TWO WAVES ────────────────────────────────────────────
      // Every manifest entry used to be fetched at boot, all at once. v22.3.0
      // added six characters AND un-deferred three more, so nine extra
      // multi-megabyte files joined that stampede — which is why the game took
      // so long to start and why models were still missing after a restart.
      // Anything tagged `wave: 2` now waits until the first wave has finished.
      // It still arrives; it just stops competing with the models the first
      // level actually needs.
      var late = all.filter(function (k) { return MANIFEST[k].wave === 2; });
      var keys = all.filter(function (k) {
        return (MANIFEST[k].swap !== false || MANIFEST[k].load) && MANIFEST[k].wave !== 2;
      });
      if (late.length) diag('log', late.length + ' model(s) held back to a second wave so they do not ' +
        'compete with the first-level models: ' + late.join(', '));
      if (deferred.length) diag('log', deferred.length + ' character(s) are contract-bound (their animation code reaches into specific parts) and stay on placeholders until an adapter session wires their GLB: ' + deferred.join(', '));
      var okC = 0, missC = 0, done = 0;
      // ── v23.3.0 — the counts a loading screen waits on ──────────────────
      // TOTAL spans BOTH waves. The old `summary()` fires when wave 1 finishes
      // and is what __onAssetsReady has always meant (the player model is in
      // wave 1), so it is left exactly as it was. This is a separate, wider
      // signal: every file, both waves, settled either way.
      _prog.total = keys.length + late.length;
      _prog.done = 0; _prog.ok = 0; _prog.miss = 0;
      // ── v23.11.0 — WHO IS STILL COMING ─────────────────────────────────
      // The loading screens now SHOW which characters are still on their way
      // (owner request), so a long wait reads as progress rather than a hang.
      // _prog.wait holds every key not yet settled; progress() reports it as
      // `waiting`, and settleOne() removes each key as it lands or fails.
      _prog.wait = {};
      keys.forEach(function (k) { _prog.wait[k] = true; });
      late.forEach(function (k) { _prog.wait[k] = true; });
      bumpProgress();
      var allPending = _prog.total;
      function settleOne(wasOk, key, isPerm) {
        _prog.done++;
        if (wasOk) _prog.ok++;
        else {
          _prog.miss++;
          // v23.20.0 — the gates need to know WHICH kind of miss: a file the
          // server does not have (permanent — waiting helps nobody) against a
          // connection-class failure (a blip or stall — a retry can save it).
          if (isPerm) _prog.missPerm = (_prog.missPerm || 0) + 1;
        }
        if (key && _prog.wait) delete _prog.wait[key];
        if (--allPending <= 0) {
          setState('complete');
          diag('log', 'ALL GLB waves complete: ' + _prog.ok + ' loaded, ' + _prog.miss + ' on placeholders');
          // ── v23.11.0 — RELEASE THE RAW DOWNLOAD BYTES ──────────────────
          // THREE.Cache keeps every fetched .glb's raw ArrayBuffer (~86MB of
          // files) in memory for the whole session, and nothing ever reads it
          // again: loadFile() already guarantees one fetch per file and there
          // is no on-demand load path. On iOS Safari, memory pressure is what
          // gets a tab silently reloaded, so this is pure recovery. The
          // PARSED characters in `cache` are separate objects and untouched.
          try {
            if (window.THREE && window.THREE.Cache && window.THREE.Cache.clear) {
              window.THREE.Cache.clear();
              diag('log', 'raw model download cache released (~all .glb bytes) — parsed characters unaffected');
            }
          } catch (eCache) {}
        } else bumpProgress();
      }
      // v23.3.0 — this used to be `if (!keys.length) return;`, which skipped
      // wave 2 entirely whenever wave 1 happened to be empty, and left the
      // state stuck on 'loading' forever — which would now hold the loading
      // screen until its cap. Only bail when there is genuinely nothing to do.
      if (!_prog.total) { setState('complete'); return; }
      // ── V16.12.0: ONE DOWNLOAD PER FILE, with retries ──────────────────────
      // Nearly every .glb serves TWO manifest keys (drdd is the player AND the
      // frogger player; roadstumbler is the enemy AND the boss; and so on).
      // Loading per KEY fetched and parsed each shared file twice — ~86MB of
      // files became a ~149MB download, minutes on a phone connection. The two
      // characters reported as never loading (genie 13.7MB, roadstumbler
      // 14.3MB x2 = 28.6MB) were simply the two LARGEST downloads, stalling at
      // the back of that queue. Now each distinct file is fetched and parsed
      // exactly once; the second key receives a SkeletonUtils clone of the
      // parsed scene (materials are shared by the clone — tuneMaterials'
      // __drddTuned guard makes that safe, and every pair of sharing keys
      // wants identical material settings anyway). Each file also gets up to
      // TWO retries with backoff, so one flaky mobile fetch no longer costs a
      // character for the whole session.
      var filePromises = {};
      // ── v23.11.0 — A BOUNDED DOWNLOAD QUEUE, CHARACTERS FIRST ──────────
      // Every file used to be requested at the same instant: 14 first-wave
      // files at boot, plus wave 2's six characters joining the same saturated
      // connection 2.5s later. With everything sharing bandwidth at once,
      // nothing finishes until nearly everything finishes — which put the six
      // characters the owner cares most about at the very back of an ~86MB
      // queue, and is why they were still on placeholders when the loading
      // screens gave up. Downloads now go through a queue of at most
      // MAX_CONCURRENT_DL at a time, in manifest order (the player first).
      // Wave 2 keeps its v22.8.0 guarantee AND gains priority: at WAVE2_DELAY
      // its files start IMMEDIATELY, allowed above the limit, so the six
      // characters compete with at most MAX_CONCURRENT_DL first-wave files
      // instead of all fourteen. The limit only ever delays the first-wave
      // TAIL; it can never delay wave 2.
      var MAX_CONCURRENT_DL = 4;
      // ── v23.12.0 — THE WATCHDOG ────────────────────────────────────────
      // Field evidence (owner's diagnostics, Aug 10): a connection blip killed
      // four in-flight downloads; ONE failed through the loader's error
      // callback and retried fine, but THREE died as unhandled promise
      // rejections inside the browser's loader without our error handler ever
      // running — kakapoo, pootoo and gobbler never loaded, never warned, and
      // the progress counter could never reach 'complete' (so no level ever
      // saw settled=true again and the raw-byte cache was never released).
      // The defense: each attempt carries a watchdog fed by the loader's own
      // progress events. A download that produces NO data for DL_WATCHDOG_MS
      // is treated as a failed attempt and goes through the NORMAL retry-or-
      // fail path — so a silently-dead fetch can no longer strand a key. A
      // slow-but-alive download keeps feeding the dog and is never killed.
      var DL_WATCHDOG_MS = 20000;
      var _dlActive = 0, _dlQueue = [];
      function _dlPump() {
        while (_dlActive < MAX_CONCURRENT_DL && _dlQueue.length) _dlLaunch(_dlQueue.shift());
      }
      function _dlLaunch(job) {
        _dlActive++;
        var slotDone = false;
        function freeSlot() { if (slotDone) return; slotDone = true; _dlActive--; _dlPump(); }
        (function attempt(n) {
          // once-guard per attempt: after the watchdog declares an attempt
          // dead, a ghost onLoad/onError from the abandoned fetch is ignored
          // (if the ghost COMPLETES, THREE's cache keeps the bytes and the
          // retry is served from it instantly — no double download).
          var done = false;
          var lastFeed = Date.now();
          var wd = null;
          function armDog() {
            wd = setTimeout(function () {
              if (done) return;
              var idle = Date.now() - lastFeed;
              if (idle < DL_WATCHDOG_MS) { armDog(); return; }   // fed recently — keep watching
              fail({ message: 'stalled: no data for ' + Math.round(idle / 1000) + 's (watchdog)' });
            }, DL_WATCHDOG_MS + 50);
            try { if (window.__protectTimer) window.__protectTimer(wd); } catch (eW) {}
          }
          function ok(gltf) {
            if (done) return; done = true;
            if (wd != null) clearTimeout(wd);
            freeSlot(); job.res(gltf);
          }
          function fail(err) {
            if (done) return; done = true;
            if (wd != null) clearTimeout(wd);
            // ── V22.9.0 — A 404 IS NOT WORTH RETRYING ──────────────────
            // Retries exist for a flaky mobile connection. A file that is
            // not on the server will not be there 900ms later either, and
            // the two missing files (stooge_durag.glb, joel_head.glb) were
            // costing 2.7s of backoff EACH while holding a slot in the
            // download queue that the real models needed. Permanent HTTP
            // failures fail immediately; everything else still gets 3 tries.
            var status = (err && err.target && err.target.status) || 0;
            var msg = (err && (err.message || '')) + '';
            var permanent = status === 404 || status === 403 || status === 410 ||
                            /\b(404|403|410)\b/.test(msg);
            if (permanent) {
              diag('warn', job.file + ' is not on the server (HTTP ' + (status || '404') +
                ') — not retrying, using the placeholder.');
              try { err.__permanent = true; } catch (ePm) {}   // v23.20.0 — the gates never wait on these
              freeSlot(); job.rej(err); return;
            }
            if (n < 2) {
              diag('warn', job.file + ' failed to fetch (attempt ' + (n + 1) + ' of 3: ' +
                (msg || 'network error') + ') — retrying...');
              // v23.11.0 — this retry timer is PROTECTED from the level-start
              // timer purge in resetAllLevelState(). Unprotected, starting a
              // level during the backoff deleted the retry: the file never
              // loaded, was never re-requested, and the progress counter
              // could never reach 'complete' — so every later level paid the
              // full GLB_LEVEL_WAIT_MS and still began on placeholders.
              var tRetry = setTimeout(function () { attempt(n + 1); }, 900 * (n + 1));
              try { if (window.__protectTimer) window.__protectTimer(tRetry); } catch (eProt) {}
            } else { freeSlot(); job.rej(err); }
          }
          armDog();
          loader.load(PATH + job.file, ok, function () { lastFeed = Date.now(); }, fail);
        })(0);
      }
      function loadFile(file, urgent) {
        if (filePromises[file]) return filePromises[file];
        filePromises[file] = new Promise(function (res, rej) {
          var job = { file: file, res: res, rej: rej };
          // ── v23.20.0 — WAVE 1 FIRST, IN FULL (owner, Aug 12) ────────────
          // Wave 2 used to launch ABOVE the concurrency limit at its kickoff,
          // which on a phone meant its six files often FINISHED before wave
          // 1's bigger ones — reading exactly like "wave 2 loads first".
          // Every download now takes its turn in the one bounded queue:
          // wave 1 in manifest order (player first), wave 2 joining the back
          // at its kickoff, retries re-joining the same way. The loading
          // gates hold for both waves regardless, so wave 2 loses nothing —
          // it just stops jumping ahead of the models the first levels need.
          // (`urgent` is kept in the signature so the wave-2 call sites and
          // their test anchors are undisturbed; it no longer bypasses the
          // queue.)
          _dlQueue.push(job); _dlPump();
        });
        return filePromises[file];
      }
      // ── V22.8.0 — WAVE 2 IS ON A BOUNDED TIMER, NOT GATED ON WAVE 1 ────────
      // The v22.7.0 version started wave 2 only from wave 1's completion
      // callback — which fires after every wave-1 file has either succeeded or
      // exhausted its 3 retries. One slow or flaky file (a real possibility on
      // a phone connection) could delay wave 2 far past when the player has
      // already reached a level that needs it, or effectively never in a bad
      // session. A per-wave pending counter, decoupled by a fixed delay,
      // guarantees wave 2 begins within WAVE2_DELAY regardless of wave 1's fate.
      var WAVE2_DELAY = 2500;
      function loadWave(list, isLate) {
        var localPending = list.length;
        if (!localPending) { if (!isLate) summary(); return; }
        list.forEach(function (key) {
          var spec = MANIFEST[key];
          loadFile(spec.file, isLate).then(function (gltf) {
            try {
              if (!gltf.__pristine) {
                tuneMaterials(gltf.scene, key);
                gltf.__pristine = gltf.scene;
              }
              var root = skeletonClone ? skeletonClone(gltf.__pristine) : gltf.__pristine.clone(true);
              var t = normalize(root, spec, key);
              t.__clips = gltf.animations || [];
              cache[key] = t;
              var clipNames = t.__clips.map(function (c) { return c.name; }).join(', ');
              okC++; diag('log', 'GLB ready: ' + key + ' ← ' + spec.file +
                (clipNames ? ' | clips: ' + clipNames : ' | no animation clips'));
              // ── PER-KEY READY HOOK ─────────────────────────────────────
              // Fires the instant THIS key lands in cache, in either wave —
              // separate from __onAssetsReady, which only ever fires once,
              // after wave 1, and only for the player model. Anything that
              // needs to react to a LATE model (a Stooge spawned before its
              // file arrived, for instance) hooks this instead of polling.
              try { if (window.__onGLBReady) window.__onGLBReady(key); } catch (e2) {}
              settleOne(true, key);
            } catch (e) {
              missC++; diag('warn', 'GLB normalize failed for ' + key + ': ' + (e && e.message));
              settleOne(false, key, true);   // v23.20.0 — a code failure; re-downloading cannot fix it
            }
            done++; if (--localPending === 0 && !isLate) summary();
            if (isLate && localPending === 0) diag('log', 'second-wave GLB loading complete');
          }, function (err) {
            missC++;
            var msg = (err && (err.message || err.type)) || 'unknown error';
            diag('warn', 'GLB not loaded for ' + key + ' (' + PATH + spec.file + ') after 3 attempts: ' + msg +
              ' — using placeholder. If you uploaded this file, check the exact path/filename ' +
              'case, and that it is not Draco-compressed (unsupported; re-export without ' +
              'compression, e.g. `gltf-transform copy in.glb out.glb`).');
            if (!(err && err.__permanent)) missedTransient[key] = true;   // v23.20.0 — retryable
            settleOne(false, key, !!(err && err.__permanent));
            done++; if (--localPending === 0 && !isLate) summary();
            if (isLate && localPending === 0) diag('log', 'second-wave GLB loading complete (with failures)');
          });
        });
      }
      // ── v23.20.0 — A SECOND CHANCE FOR CONNECTION-CLASS MISSES ─────────
      // Owner, Aug 12: no level should start on placeholders while a model
      // could still arrive. A key that failed for NETWORK reasons (a blip, a
      // stall, exhausted retries) can be re-queued by the loading screens
      // while they hold. Server-missing files (404-class, v22.9.0) and
      // normalize failures are never retried — nothing new can come of them.
      // Counters are wound back per key so progress() stays truthful, and
      // the state returns to 'loading' until the retry round settles.
      var missedTransient = {};
      // v24.3.0 — mirrored into _prog (live reference) so progress() can keep
      // NAMING the characters a hold is still trying to rescue. The owner's
      // field report: the loading screen went blank between retry rounds,
      // because settled keys leave _prog.wait — retryable ones now count as
      // still-coming for display purposes.
      _prog.retryable = missedTransient;
      window.__glbRetryMissed = function () {
        // v24.3.0 — offline is not a retry: with no connection every round
        // fails identically and costs main-thread time for nothing.
        try { if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0; } catch (eN) {}
        var mk = Object.keys(missedTransient);
        if (!mk.length) return 0;
        diag('log', 'second chance: re-requesting ' + mk.length + ' missed character(s): ' + mk.join(', '));
        mk.forEach(function (k) {
          delete missedTransient[k];
          try { delete filePromises[MANIFEST[k].file]; } catch (eF) {}
          _prog.done--; _prog.miss--;
          if (_prog.wait) _prog.wait[k] = true;
          allPending++;
        });
        setState('loading');
        bumpProgress();
        loadWave(mk, true);
        return mk.length;
      };
      loadWave(keys, false);
      if (late.length) {
        var tWave2 = setTimeout(function () { loadWave(late, true); }, WAVE2_DELAY);
        // v23.11.0 — protected for the same reason as the retry timers above:
        // a level started inside this 2.5s window would delete the kickoff and
        // wave 2 would simply never begin for the whole session.
        try { if (window.__protectTimer) window.__protectTimer(tWave2); } catch (eProt2) {}
      }
      function summary() {
        try { if (window.__onAssetsReady) window.__onAssetsReady(); } catch (e) {}
        diag('log', 'GLB preload complete: ' + okC + ' model(s) loaded, ' + missC + ' using placeholders' +
          (window.USE_PLACEHOLDERS ? ' — NOTE: USE_PLACEHOLDERS is true, so loaded models are NOT shown; set it false in Factory.js to use them' : ''));
      }
    }).catch(function (e) {
      failedBoot = true;
      // v23.3.0 — 'off', not 'complete': the pipeline never ran, so nothing is
      // coming and no screen should wait even one frame on it.
      setState('off');
      diag('warn', 'GLB loader unavailable (' + (e && e.message) + ') — placeholders stay on. Game unaffected.');
    });
  };

  A.diag = diag;            // so the game can log into the same diagnostics feed
  A._manifest = MANIFEST;   // exposed for inspection/tuning from the console
  A.__drddLoaded = true;    // v23.1.0 — what the double-load guard at the top reads
  window.Assets = A;
  try { console.log('[AssetManager.js] Loaded — call Assets.boot() once (game does this automatically).'); } catch (e) {}
})();

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED AUDIO CONTEXT (V19.0.0)  —  window.__AC()

   WHY THIS EXISTS. Before V19 the game built FOUR separate AudioContexts (the
   hip-hop beat, the general SFX bank, the chase hit sound, the frogger SFX) and
   Music was about to make a fifth. iOS Safari caps how many a page may hold and
   quietly refuses to create more; each one also has to be unlocked separately
   by its own user gesture. That is the single biggest reason a music track on
   a phone would sometimes start at once, sometimes start late, and sometimes
   never start at all — the context it needed was either refused or still
   locked. Everything now shares this one context, unlocked once.

   It is created on first use and resumed on EVERY tap/click/key for the whole
   session, not once — a single "unlock on first touch" listener is spent on
   the menu tap that happens before any sound is ever requested.

   navigator.audioSession: on iOS 16.4+ this tells Safari the page is playing
   music rather than UI blips, so the ringer/silent switch no longer silences
   it. Without it, a phone on silent plays NO music at all, which looks exactly
   like a broken track. Harmless everywhere else.
   ═══════════════════════════════════════════════════════════════════════════ */
// v23.1.0 — `window.__AC = window.__AC || (...)`, not a bare assignment.
// This block sits OUTSIDE the IIFE above, so the double-load guard up there does
// not protect it. A second copy of this file used to replace __AC with a fresh
// closure holding `ctx = null`, and the next __AC() call would then build a
// SECOND AudioContext — the exact iOS failure the comment above this describes
// and that V19.0.0 was written to end. iOS caps how many a page may hold and
// silently refuses the extras, and each needs unlocking by its own gesture, so
// the symptom is simply that sound stops working with no error anywhere.
window.__AC = window.__AC || (function () {
  var ctx = null, unlockBound = false;
  function poke() {
    if (!ctx) return;
    try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) {}
    // iOS also wants one silent buffer played from inside a gesture before it
    // considers the context genuinely unlocked.
    try {
      var b = ctx.createBuffer(1, 1, 22050);
      var s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
    } catch (e) {}
  }
  function bind() {
    if (unlockBound) return; unlockBound = true;
    ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'keydown'].forEach(function (ev) {
      try { window.addEventListener(ev, poke, { capture: true, passive: true }); } catch (e) {}
    });
  }
  return function () {
    if (ctx) { bind(); return ctx; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    bind(); poke();
    return ctx;
  };
})();

/* ═══════════════════════════════════════════════════════════════════════════
   MUSIC (V16.9.0 · rewritten on Web Audio in V19.0.0)

   Looping background tracks from assets/music/. A missing file is silently
   skipped — the game never depends on a track existing, so tracks can be added
   one at a time as they are finished.

   HOW TO ADD A TRACK: drop an .mp3 into assets/music/ with EXACTLY the
   filename listed in TRACKS below (case-sensitive on GitHub Pages), commit,
   done. No code changes. To add a brand-new slot, add one line to TRACKS.

   ── WHY THIS WAS REWRITTEN (the mobile problem) ──────────────────────────
   Up to V16.14 each track was an <audio> element and "preloading" meant
   setting preload="auto" and waiting for canplaythrough. On desktop that
   works. On a phone it does essentially nothing:

     · iOS Safari IGNORES preload on media elements. It will not download a
       byte until play() is called from a gesture. So every "preload" simply
       burned its timeout, and the real download started at the moment the
       level appeared — hence music arriving seconds late, or not at all.
     · Each <audio> element is unlocked separately by iOS. An element built
       outside a gesture may never be allowed to play, which is the "sometimes
       it never starts" case.
     · 22 elements plus 4 AudioContexts is far past what a phone will hold.

   V19 uses Web Audio instead, which changes the physics of the problem:

     · fetch() downloads an .mp3 with no gesture and no autoplay policy in the
       way — so prefetching is now REAL prefetching on mobile too.
     · decodeAudioData turns it into an AudioBuffer up front, during the
       loading screen, where waiting is free and expected.
     · Starting an AudioBufferSourceNode is instant and deterministic. There is
       no buffering race left at the moment the level appears.
     · One shared, always-resumed AudioContext (window.__AC) replaces the pile.
     · Exactly ONE source node can exist at a time (see stopNow), so tracks
       physically cannot stack on top of each other the way they used to.

   MEMORY. Decoded audio is raw PCM and large (~10MB per minute of stereo), so
   only MAX_DECODED tracks are kept decoded at once — the one playing plus the
   one being prepared. Compressed downloads are kept in a small RAW_MAX cache,
   and past that the browser's own HTTP cache makes a repeat fetch instant, so
   re-entering a level never re-downloads.
   ═══════════════════════════════════════════════════════════════════════════ */
// v23.1.0 — `|| (...)` for the same reason as __AC directly above: this block is
// outside the IIFE, so a second load would replace Music while a track was
// playing, orphaning the running source node and its decoded PCM (roughly 10MB
// per minute of stereo) with no way to stop or free it.
window.Music = window.Music || (function () {
  var TRACKS = {
    // ── levels ──
    level1:          'assets/music/level1.mp3',
    level2:          'assets/music/level2.mp3',
    level3:          'assets/music/level3.mp3',
    level4:          'assets/music/level4.mp3',
    boss2:           'assets/music/roadstumbler.mp3',
    boss:            'assets/music/stoogejoel.mp3',
    durag:           'assets/music/duragceremony.mp3',
    chase:           'assets/music/dipemobile.mp3',
    frogger:         'assets/music/dipecitycrossing.mp3',
    pkmn:            'assets/music/dipemon.mp3',
    // ── Dipe Fighter: one theme per playable character, played from the
    //    moment the match starts. Key is fight_ + the fighter id. ──
    fight_drdd:         'assets/music/fight_drdd.mp3',
    fight_genie:        'assets/music/fight_genie.mp3',
    fight_micflex:      'assets/music/fight_micflex.mp3',
    fight_duragdada:    'assets/music/fight_duragdada.mp3',
    fight_pigeon:       'assets/music/fight_pigeon.mp3',
    fight_roadstumbler: 'assets/music/fight_roadstumbler.mp3',
    fight_gobbler:      'assets/music/fight_gobbler.mp3',
    fight_doodoo:       'assets/music/fight_doodoo.mp3',
    fight_pootoo:       'assets/music/fight_pootoo.mp3',
    fight_kakapoo:      'assets/music/fight_kakapoo.mp3',
    fight_oztrich:      'assets/music/fight_oztrich.mp3',
    fight_seagle:       'assets/music/fight_seagle.mp3'
  };
  // startLevel(which) ids → track keys. NUMERIC ids need no entry here at all
  // — level() below falls back to 'level'+which automatically, so a brand-new
  // level5/6/... just needs assets/music/level5.mp3 etc, no code change. NAMED
  // ids need a line, since their track name doesn't match their id. This
  // includes the two levels added later via registerLevel() (frogger, pkmn) —
  // they dispatch through a separate LEVEL_REGISTRY, but still arrive here
  // first since Music.level() is called on startLevel's raw `which`.
  // Deliberately absent: 'fight' (Dipe Fighter World). That level's music is
  // per-CHARACTER (fight_<id>, chosen at match start — see startMatch below),
  // not a single level theme, so it has no entry here.
  var LEVEL_KEY = { 'boss2':'boss2', 'boss':'boss', 'durag':'durag',
                    'chase':'chase', 'frogger':'frogger', 'pkmn':'pkmn',
                    // Log Jam Rapids is the Crossing world's second stage and
                    // shares its soundtrack, so it maps onto the same file
                    // rather than asking for a levelrapids.mp3 that does not
                    // exist (a missing key would silently play nothing).
                    'rapids':'frogger',
                    // v27.0.0 — The Dipe Roll is a runner; the chase
                    // soundtrack is the right pulse and the only one that
                    // exists for it (owner's call: no new file this release).
                    'roller':'chase' };

  // ── Tuning dials ──────────────────────────────────────────────────────────
  var VOL        = 0.55;   // music volume, 0–1
  var FADE_IN_MS = 350;    // V19.0.0 — quick fade as the level appears
  var FADE_OUT_MS= 260;    // fade when a track is replaced or the menu returns
  var MAX_DECODED= 2;      // decoded (PCM) tracks held at once — see MEMORY above
  var RAW_MAX    = 6;      // compressed downloads held at once

  var raw = {}, rawOrder = [];      // key → ArrayBuffer
  var dec = {}, decOrder = [];      // key → AudioBuffer
  var fetching = {}, decoding = {}; // key → in-flight Promise
  var missing = {}, attempts = {};
  var src = null, gain = null, curKey = null, wanted = null;
  var musicOut = null;

  /** V19.1.0 — music's own master node, and the reason the Sound FX toggle and
   *  the Music toggle stay independent.
   *
   *  index.html wraps AudioNode.connect so that ANYTHING connecting to the
   *  context's destination is rerouted through an SFX master gain — that is how
   *  one flag mutes every effect in the game without editing dozens of sound
   *  functions. Since V19.0.0 music is Web Audio in the SAME context, so it
   *  would be caught by that net too and "Sound FX: OFF" would silence the
   *  soundtrack as well. The __drddBypass flag is the escape hatch the wrapper
   *  checks. Per-track gains connect to THIS node rather than the destination,
   *  so they are never intercepted either. */
  function outNode(ctx) {
    if (musicOut && musicOut.context === ctx) return musicOut;
    musicOut = ctx.createGain();
    musicOut.gain.value = 1;
    musicOut.__drddBypass = true;     // ← skipped by the SFX-mute interceptor
    musicOut.__isSfxMaster = true;    //   (belt and braces: older flag name)
    musicOut.connect(ctx.destination);
    return musicOut;
  }
  var muted = false;
  try { muted = localStorage.getItem('drdd_music_muted') === '1'; } catch (e) {}

  function pathFor(key) {
    if (TRACKS[key]) return TRACKS[key];
    // Any key shaped like 'level<number>' resolves to assets/music/level<n>.mp3
    // even with NO entry in TRACKS above — this is what lets a brand-new
    // level5, level6, ... work by adding only the .mp3 file, forever.
    var m = /^level(\d+)$/.exec(key);
    return m ? ('assets/music/level' + m[1] + '.mp3') : null;
  }
  /** Mark `key` as most-recently-used and evict down to `max`.
   *  The currently-playing track is never evicted — its AudioBuffer is what the
   *  live source node is reading from. NOTE the loop shape: an earlier draft
   *  shifted the oldest key and unshifted it back when it was the playing one,
   *  which left the list the same length and spun forever. It now scans for the
   *  oldest EVICTABLE entry and gives up if there is none. */
  function touch(list, store, key, max) {
    var i = list.indexOf(key); if (i > -1) list.splice(i, 1);
    list.push(key);
    while (list.length > max) {
      var victim = -1;
      for (var j = 0; j < list.length; j++) {
        if (list[j] !== curKey && list[j] !== key) { victim = j; break; }
      }
      if (victim < 0) break;                 // nothing safe to drop — keep it
      delete store[list[victim]];
      list.splice(victim, 1);
    }
  }

  /** Download the compressed file. Works on iOS with no gesture and no
   *  autoplay policy involved — this is what makes prefetch real on mobile. */
  function fetchRaw(key) {
    if (raw[key]) { touch(rawOrder, raw, key, RAW_MAX); return Promise.resolve(raw[key]); }
    if (fetching[key]) return fetching[key];
    var path = pathFor(key);
    if (!path || missing[key]) return Promise.resolve(null);
    var p = fetch(path, { cache: 'force-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(function (ab) {
        raw[key] = ab; touch(rawOrder, raw, key, RAW_MAX);
        delete fetching[key]; return ab;
      })
      .catch(function () {
        delete fetching[key];
        // A stalled download during the heavy model preload should not blacklist
        // a track for the whole session — retry on the next request, up to 4.
        attempts[key] = (attempts[key] || 0) + 1;
        if (attempts[key] >= 4) missing[key] = true;
        return null;
      });
    fetching[key] = p; return p;
  }

  /** Turn the download into playable PCM. decodeAudioData DETACHES the buffer
   *  it is handed, so it always gets a copy — otherwise the cached download is
   *  destroyed and re-entering the level silently fails. */
  function decodeKey(key) {
    if (dec[key]) { touch(decOrder, dec, key, MAX_DECODED); return Promise.resolve(dec[key]); }
    if (decoding[key]) return decoding[key];
    var ctx = window.__AC && window.__AC();
    if (!ctx) return Promise.resolve(null);
    var p = fetchRaw(key).then(function (ab) {
      if (!ab) return null;
      return new Promise(function (res) {
        var copy = ab.slice(0);
        var done = false;
        function ok(b) { if (done) return; done = true; dec[key] = b; touch(decOrder, dec, key, MAX_DECODED); res(b); }
        function bad() { if (done) return; done = true; res(null); }
        try {
          var r = ctx.decodeAudioData(copy, ok, bad);
          if (r && r.then) r.then(ok, bad);          // promise-form browsers
        } catch (e) { bad(); }
      });
    }).then(function (b) { delete decoding[key]; return b; },
            function ()  { delete decoding[key]; return null; });
    decoding[key] = p; return p;
  }

  /** Stop whatever is sounding. There is only ever one source node, so this is
   *  the whole of it — the old "tracks stacked on top of each other" bug is
   *  structurally impossible now rather than being patched over. */
  function stopNow(fadeMs) {
    var s = src, g = gain;
    src = null; gain = null; curKey = null;
    if (!s) return;
    var ctx = window.__AC && window.__AC();
    try {
      if (g && ctx && fadeMs > 0) {
        var t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0.0001, t + fadeMs / 1000);
        setTimeout(function () { try { s.stop(); s.disconnect(); g.disconnect(); } catch (e) {} }, fadeMs + 60);
      } else {
        s.stop(); s.disconnect(); if (g) g.disconnect();
      }
    } catch (e) {}
  }

  /** Start a decoded track immediately, with the quick fade-in. */
  function startNow(key) {
    var b = dec[key]; if (!b) return false;
    var ctx = window.__AC && window.__AC(); if (!ctx) return false;
    stopNow(0);
    try {
      var s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = b; s.loop = true;
      s.connect(g); g.connect(outNode(ctx));
      var t = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(muted ? 0.0001 : VOL, t + FADE_IN_MS / 1000);
      s.start(0);
      src = s; gain = g; curKey = key;
      // If the page has not been touched yet the context is suspended; the
      // source is already running against a frozen clock, so it will begin at
      // the start the instant __AC's listener resumes it on the next tap.
      try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) {}
      return true;
    } catch (e) { return false; }
  }

  /** Buffer then start. `wanted` guards a fast level change: if the player has
   *  moved on by the time this resolves, the stale track is dropped instead of
   *  starting over the new one. */
  function playWhenReady(key, timeoutMs) {
    if (!pathFor(key) || missing[key]) { stopNow(FADE_OUT_MS); wanted = null; return Promise.resolve(false); }
    wanted = key;
    var raced = false;
    return new Promise(function (res) {
      var t = setTimeout(function () { raced = true; res(false); }, timeoutMs == null ? 15000 : timeoutMs);
      decodeKey(key).then(function (b) {
        clearTimeout(t);
        if (raced) { if (b && wanted === key && curKey !== key) startNow(key); return; }
        if (wanted !== key) { res(false); return; }
        res(b ? startNow(key) : false);
      });
    });
  }

  return {
    /** Called by startLevel with the level id. A named id (boss2, durag,
     *  chase, ...) is looked up in LEVEL_KEY. Any other id — including every
     *  future numeric level — resolves straight to 'assets/music/level'+id+
     *  '.mp3' with NO entry needed anywhere in this file: level5, level6, ...
     *  work the moment that file exists. Still-missing files fade to silence
     *  like any other missing track. */
    level: function (which) { return playWhenReady(LEVEL_KEY[which] || ('level' + which)); },
    /** Buffer AND DECODE a level's track without starting it — used by the
     *  level-load overlay so the music is genuinely ready, not merely
     *  requested, at the instant the level appears. */
    prepareLevel: function (which, timeoutMs) {
      var k = LEVEL_KEY[which] || ('level' + which);
      stopNow(FADE_OUT_MS);
      wanted = k;
      if (missing[k] || !pathFor(k)) { wanted = null; return Promise.resolve(false); }
      try { if (window.__AC) window.__AC(); } catch (e) {}
      var settled = false;
      return new Promise(function (res) {
        var t = setTimeout(function () { if (!settled) { settled = true; res(false); } },
                           timeoutMs == null ? 15000 : timeoutMs);
        decodeKey(k).then(function (b) {
          clearTimeout(t);
          if (!settled) { settled = true; res(!!b); }
        });
      });
    },
    /** Start whatever prepareLevel() staged, if the level hasn't changed.
     *  If the decode is somehow still running this attaches to it rather than
     *  giving up, so a slow phone gets its music a moment late instead of not
     *  at all. */
    startPrepared: function () {
      var k = wanted; if (!k) return;
      if (dec[k]) { startNow(k); return; }
      decodeKey(k).then(function (b) { if (b && wanted === k) startNow(k); });
    },
    /** Called at Dipe Fighter match start with the chosen character's id. */
    fighter: function (id) { return playWhenReady('fight_' + id); },
    /** V16.14.0 / rebuilt V19.0.0 — download every track in the background,
     *  ONE AT A TIME, from page load. Sequential on purpose: 22 parallel
     *  downloads would fight the model preload and each other and make the
     *  first level slower, which is the opposite of the point. Level themes go
     *  first since those are reached soonest; per-fighter themes follow.
     *  Downloads only — decoding is deferred to prepareLevel so nothing is
     *  holding 22 tracks' worth of raw PCM. */
    prefetchAll: function () {
      // v23.1.0 — Assets.boot() has guarded against file:// since V13.8.0; this
      // did not. Opened straight off the disk, it fired one doomed fetch per
      // track and retried each up to four times, filling the diagnostics report
      // with failures that say nothing about the game. Same guard, same reason.
      if (location.protocol === 'file:') {
        try { console.warn('[AssetManager.js] running from file:// — music downloads are blocked by the browser, so the prefetch is skipped. Serve over http to hear the soundtrack.'); } catch (e) {}
        return;
      }
      var order = [], k;
      for (k in TRACKS) if (k.indexOf('fight_') !== 0) order.push(k);
      for (k in TRACKS) if (k.indexOf('fight_') === 0) order.push(k);
      var i = 0;
      (function next() {
        if (i >= order.length) return;
        var key = order[i++];
        if (raw[key] || missing[key]) { next(); return; }
        fetchRaw(key).then(next, next);
      })();
    },
    play: function (key) { return playWhenReady(key); },
    preload: function (key, timeoutMs) {
      return new Promise(function (res) {
        var t = setTimeout(function () { res(false); }, timeoutMs == null ? 15000 : timeoutMs);
        decodeKey(key).then(function (b) { clearTimeout(t); res(!!b); });
      });
    },
    stop: function (ms) { wanted = null; stopNow(ms == null ? FADE_OUT_MS : ms); },
    hardStop: function () { wanted = null; stopNow(0); },
    setVolume: function (v) {
      VOL = Math.max(0, Math.min(1, v));
      var ctx = window.__AC && window.__AC();
      if (gain && ctx && !muted) {
        try { gain.gain.linearRampToValueAtTime(VOL, ctx.currentTime + 0.2); } catch (e) {}
      }
    },
    toggleMute: function () {
      muted = !muted;
      try { localStorage.setItem('drdd_music_muted', muted ? '1' : '0'); } catch (e) {}
      var ctx = window.__AC && window.__AC();
      if (gain && ctx) {
        try {
          var t = ctx.currentTime;
          gain.gain.cancelScheduledValues(t);
          gain.gain.setValueAtTime(gain.gain.value, t);
          gain.gain.linearRampToValueAtTime(muted ? 0.0001 : VOL, t + 0.25);
        } catch (e) {}
      } else if (!muted && wanted) {
        // Unmuted with nothing sounding (e.g. muted through a level change) —
        // bring the level's own track back rather than staying silent.
        var k = wanted;
        decodeKey(k).then(function (b) { if (b && wanted === k) startNow(k); });
      }
      return muted;
    },
    isMuted: function () { return muted; },
    /** V19.1.0 — explicit set, so a combined "mute everything" control can put
     *  music into a known state instead of blind-toggling it. */
    setMuted: function (on) {
      on = !!on;
      if (on === muted) return muted;
      return this.toggleMute();
    },
    /** Diagnostics helper — Music.status() in the console. */
    status: function () {
      var ctx = window.__AC && window.__AC();
      return { playing: curKey, wanted: wanted, ctx: ctx ? ctx.state : 'none',
               downloaded: Object.keys(raw), decoded: Object.keys(dec),
               missing: Object.keys(missing), muted: muted };
    }
  };
})();
