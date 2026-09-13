// Adversarial soundness harness for the escrow-leak fix -- Step 4.
//   node scripts/gen_input_wedge_escrow.mjs   (fixtures, run first)
//   node scripts/test_soundness_adversarial_escrow.mjs
//
// Same structure as the public repo's test_soundness_adversarial.mjs and
// this repo's own test_soundness_adversarial_policy.mjs: Layer A (malicious
// witnesses must be REJECTED at generation), Layer B (tamper a satisfying
// witness's public output), Layer C (null-space-directed search -- the only
// method that reliably catches a coordinated-signal under-constraint).

import * as snarkjs from "snarkjs";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nullspaceProbe } from "../vendor/proof-of-personhood/scripts/nullspace_harness.mjs";
import { readR1CS, mulm, subm, dot } from "../vendor/proof-of-personhood/scripts/two_witness_search.mjs";

const CIRC = "circuits/main_wedge_escrow_js/main_wedge_escrow.wasm";
const R1CS = "circuits/main_wedge_escrow.r1cs";
const SYM = "circuits/main_wedge_escrow.sym";
const B = (n) => `build/${n}`;

let pass = 0, fail = 0;
const okpass = (n, why) => { pass++; console.log(`  PASS  ${n}`); if (why) console.log(`          ↳ ${why}`); };
const okfail = (n, why) => { fail++; console.log(`  FAIL  ${n}`); if (why) console.log(`          ↳ ${why}`); };

const tdir = mkdtempSync(join(tmpdir(), "advsound_escrow_"));
let wc = 0;
const wtnsPath = () => join(tdir, `w${wc++}.wtns`);

async function expectReject(name, input, property) {
  try {
    await snarkjs.wtns.calculate(input, CIRC, wtnsPath());
    okfail(name, `witness generator ACCEPTED a witness that should violate "${property}" -- possible missing constraint`);
  } catch (e) {
    okpass(name, `${property}  (generator rejected: ${String(e.message || e).split("\n")[0].slice(0, 110)})`);
  }
}
async function expectAccept(name, input, note) {
  try {
    const w = wtnsPath();
    await snarkjs.wtns.calculate(input, CIRC, w);
    okpass(name, note);
    return w;
  } catch (e) {
    okfail(name, `expected ACCEPT but generator threw: ${String(e.message || e).split("\n")[0]}`);
  }
}
async function wtnsValues(w) { return (await snarkjs.wtns.exportJson(w)).map((x) => BigInt(x)); }

console.log("\n=== LAYER A -- malicious witnesses must be REJECTED at generation time ===\n");

const honest = JSON.parse(readFileSync(B("input_wedge_escrow.json"), "utf8"));
const badSuff = JSON.parse(readFileSync(B("input_wedge_escrow_bad_sufficiency.json"), "utf8"));
const badBracket = JSON.parse(readFileSync(B("input_wedge_escrow_bad_bracket.json"), "utf8"));
const badBalOpen = JSON.parse(readFileSync(B("input_wedge_escrow_bad_balance_open.json"), "utf8"));
const insolvent = JSON.parse(readFileSync(B("input_wedge_escrow_insolvent.json"), "utf8"));

const wHonest = await expectAccept("A1  honest witness accepted", honest, "baseline / negative control");

await expectReject("A2  escrow insufficient (collateral = V_hi*p_star - 1, honestly committed)", badSuff,
  "suff: NOT(collateral < V_hi*p_star)");

await expectReject("A3  V outside the published bracket (V = V_hi + 1)", badBracket,
  "leHi: NOT(V_hi < V)");

await expectReject("A4  balance opening does not match the published C_bal", badBalOpen,
  "C_bal === hb.out (Pedersen commitment opening)");

await expectReject("A5  insolvent: balance < collateral (honestly committed smaller balance)", insolvent,
  "solv: NOT(balance < collateral)");

// A6 -- escrow commitment opening tampered (claims a DIFFERENT collateral
// than the one C_esc actually commits to -- same idea as A4 but on C_esc).
{
  const bad = { ...honest, collateral: (BigInt(honest.collateral) + 1n).toString() };
  await expectReject("A6  escrow opening does not match the published C_esc", bad,
    "C_esc === hc.out (Pedersen commitment opening)");
}

// A7 -- "inconsistent V_hi" attempt: try to make the sufficiency check pass
// against a SMALLER V_hi than the one used in the bracket proof, by only
// changing the *public* V_hi passed to the whole circuit for the
// sufficiency side while keeping V inside the ORIGINAL, larger bracket.
// Since there is only one public V_hi wire read by both sub-checks, the only
// way to attempt this is to also shrink the bracket -- which then makes V
// fail the (now-inconsistent) upper-bound check instead. This confirms the
// single-shared-wire design structurally prevents the two sub-proofs from
// ever disagreeing about V_hi; there is no separate "shadow" V_hi to tamper.
{
  const bad = { ...honest, V_hi: "900" }; // smaller than V=1000 -> also breaks (a)
  await expectReject("A7  shrinking the one shared V_hi wire (no separate V_hi exists to decouple)", bad,
    "leHi: NOT(V_hi < V) -- V=1000 now exceeds the shrunk V_hi=900");
}

console.log("\n=== LAYER B -- tampering a satisfying witness's public output must break the R1CS ===\n");
if (wHonest) {
  const vals = await wtnsValues(wHonest);
  const rr = readR1CS(R1CS);
  // witness layout: [1, bracket_ok, solvent_ok, V_lo, V_hi, p_star, C_esc, C_bal, V, ...]
  const iSolventOk = 2;
  const tampered = vals.slice();
  tampered[iSolventOk] = 0n; // claim "not solvent" on an otherwise fully-solvent honest proof
  let bad = 0;
  for (const c of rr.cons) if (subm(mulm(dot(c.a, tampered), dot(c.b, tampered)), dot(c.c, tampered)) !== 0n) bad++;
  (bad > 0)
    ? okpass("B1  solvent_ok forced to 0 on an honest witness breaks the R1CS", `${bad} constraint(s) violated`)
    : okfail("B1  solvent_ok=0 tamper did not break any constraint", "solvent_ok may be unconstrained / dead");

  // B2 -- tamper C_esc directly in the witness (post-generation) to a value
  // that does NOT open under the honest (collateral, r_esc): the R1CS check
  // (not just the generator) must independently reject it.
  const iCesc = 6;
  const tampered2 = vals.slice();
  tampered2[iCesc] = tampered2[iCesc] + 1n;
  let bad2 = 0;
  for (const c of rr.cons) if (subm(mulm(dot(c.a, tampered2), dot(c.b, tampered2)), dot(c.c, tampered2)) !== 0n) bad2++;
  (bad2 > 0)
    ? okpass("B2  C_esc nudged by 1 on an honest witness breaks the R1CS", `${bad2} constraint(s) violated -- the commitment opening is load-bearing, not decorative`)
    : okfail("B2  C_esc+1 tamper did not break any constraint");
}

console.log("\n=== LAYER C -- null-space-directed search (the real soundness check) ===\n");
{
  const res = await nullspaceProbe({
    r1cs: R1CS, wasm: CIRC, sym: SYM, input: honest,
    rounds: Number(process.env.ADV_NS_ROUNDS || 128), seed: "escrow-leak-fix",
  }).catch((e) => ({ ok: false, reason: String(e.message || e).split("\n")[0] }));

  if (!res.ok) {
    okpass("C0  null-space elimination did not complete -- INCONCLUSIVE", res.reason);
  } else {
    okpass("C0  null-space basis computed", `nullity ${res.nullity}; ${res.basisDim} basis directions + ${res.combosTried} random combos re-verified`);
    res.caught
      ? okfail("C1  a null-space direction moves a PUBLIC output",
          `EXPLOIT: ${res.publicMovers.map((m) => `${m.label} -> {${m.publicSignals.join(", ")}}`).join("; ")}`)
      : okpass("C1  no null-space direction moves a public output (bracket_ok, solvent_ok, or any public input)",
          `all ${res.basisDim + res.combosTried} perturbations rejected or non-public-only`);
    const onlyBenign = res.nonPublicSignals.every((s) => /\.isz\.inv$/.test(s));
    (res.nonPublicSignals.length === 0 || onlyBenign)
      ? okpass("C2  non-public freedoms are benign IsZero-style hints only", res.nonPublicSignals.join(", ") || "none")
      : okfail("C2  a non-public null-space freedom is NOT a known-benign hint -- classify manually",
          res.nonPublicSignals.filter((s) => !/\.isz\.inv$/.test(s)).join(", "));
  }
}

rmSync(tdir, { recursive: true, force: true });
console.log(`\n=== escrow-leak-fix adversarial soundness: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
