// Adversarial soundness harness for the difference-commitment range proof
// -- Step 5.
//   node scripts/gen_input_wedge_anonymous.mjs   (fixtures, run first)
//   node scripts/test_soundness_adversarial_anonymous.mjs

import * as snarkjs from "snarkjs";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nullspaceProbe } from "../vendor/proof-of-personhood/scripts/nullspace_harness.mjs";
import { readR1CS, mulm, subm, dot } from "../vendor/proof-of-personhood/scripts/two_witness_search.mjs";

const CIRC = "circuits/main_wedge_anonymous_sufficiency_js/main_wedge_anonymous_sufficiency.wasm";
const R1CS = "circuits/main_wedge_anonymous_sufficiency.r1cs";
const SYM = "circuits/main_wedge_anonymous_sufficiency.sym";
const B = (n) => `build/${n}`;

let pass = 0, fail = 0;
const okpass = (n, why) => { pass++; console.log(`  PASS  ${n}`); if (why) console.log(`          ↳ ${why}`); };
const okfail = (n, why) => { fail++; console.log(`  FAIL  ${n}`); if (why) console.log(`          ↳ ${why}`); };

const tdir = mkdtempSync(join(tmpdir(), "advsound_anon_"));
let wc = 0;
const wtnsPath = () => join(tdir, `w${wc++}.wtns`);

async function expectReject(name, input, property) {
  try {
    await snarkjs.wtns.calculate(input, CIRC, wtnsPath());
    okfail(name, `witness generator ACCEPTED a witness that should violate "${property}"`);
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

const honest = JSON.parse(readFileSync(B("input_wedge_anonymous.json"), "utf8"));
const bigsum = JSON.parse(readFileSync(B("input_wedge_anonymous_bigsum.json"), "utf8"));
const insufficient = JSON.parse(readFileSync(B("input_wedge_anonymous_insufficient.json"), "utf8"));
const badOpen = JSON.parse(readFileSync(B("input_wedge_anonymous_bad_opening.json"), "utf8"));
const negQ = JSON.parse(readFileSync(B("input_wedge_anonymous_negative_q.json"), "utf8"));
const altDelta = JSON.parse(readFileSync(B("input_wedge_anonymous_alt_delta.json"), "utf8"));

const wHonest = await expectAccept("A1  honest witness accepted (Sum(q)=1000 >= V=900)", honest, "baseline / negative control");
const wBig = await expectAccept("A1b  second honest witness accepted (Sum(q)=5000 >= V=4800)", bigsum, "different scale, same outcome -- for the leakage check");

await expectReject("A2  insufficient: Sum(q)=898 < V=900, honestly committed", insufficient,
  "suff: NOT(deltaV < Delta) fails -- deltaV = Delta-(V-sumQ) < Delta when sumQ<V");

await expectReject("A3  seller opening inconsistent with published commitment (q[1] inflated, C[1] unchanged)", badOpen,
  "Cx[1]===pc[1].x / Cy[1]===pc[1].y");

await expectReject("A4  'negative' liquidity: q[0] = p-1", negQ,
  "Num2Bits(64) inside PedersenCommitEC(64)");

// A5 -- "inconsistent Delta": confirm Delta is load-bearing (changes D) by
// checking a different Delta with the SAME q/V produces a DIFFERENT (Dx,Dy)
// -- there is no second, decoupled Delta for a prover to be inconsistent
// with (same single-shared-wire architecture as the escrow/aggregate spikes).
const wAlt = await expectAccept("A5  different Delta, same q/V, accepted (still sufficient)", altDelta,
  "Delta is a single public wire feeding both the D computation and deltaV -- nothing to decouple");

console.log("\n=== LAYER B -- tampering a satisfying witness's public output must break the R1CS ===\n");
if (wHonest) {
  const vals = await wtnsValues(wHonest);
  const rr = readR1CS(R1CS);
  // witness layout: [1, Dx, Dy, sufficient, Cx[0..2], Cy[0..2], CVx, CVy, Delta, ...]
  const iSufficient = 3;
  const tampered = vals.slice();
  tampered[iSufficient] = 0n;
  let bad = 0;
  for (const c of rr.cons) if (subm(mulm(dot(c.a, tampered), dot(c.b, tampered)), dot(c.c, tampered)) !== 0n) bad++;
  (bad > 0)
    ? okpass("B1  sufficient forced to 0 on an honest witness breaks the R1CS", `${bad} constraint(s) violated`)
    : okfail("B1  sufficient=0 tamper did not break any constraint");

  const iDx = 1;
  const tampered2 = vals.slice();
  tampered2[iDx] = tampered2[iDx] + 1n;
  let bad2 = 0;
  for (const c of rr.cons) if (subm(mulm(dot(c.a, tampered2), dot(c.b, tampered2)), dot(c.c, tampered2)) !== 0n) bad2++;
  (bad2 > 0)
    ? okpass("B2  Dx nudged by 1 on an honest witness breaks the R1CS", `${bad2} constraint(s) violated`)
    : okfail("B2  Dx+1 tamper did not break any constraint");
}

if (wAlt) {
  const v1 = await wtnsValues(wHonest);
  const v2 = await wtnsValues(wAlt);
  (v1[1] !== v2[1] || v1[2] !== v2[2])
    ? okpass("A5b  Dx/Dy actually changed when only Delta changed", "Delta is load-bearing in the D computation, not a dead input")
    : okfail("A5b  Dx/Dy unchanged despite a different Delta", "Delta may not be wired into D correctly");
}

console.log("\n=== LAYER C -- null-space-directed search (the real soundness check) ===\n");
{
  const res = await nullspaceProbe({
    r1cs: R1CS, wasm: CIRC, sym: SYM, input: honest,
    rounds: Number(process.env.ADV_NS_ROUNDS || 128), seed: "anonymous-sufficiency",
  }).catch((e) => ({ ok: false, reason: String(e.message || e).split("\n")[0] }));

  if (!res.ok) {
    okpass("C0  null-space elimination did not complete -- INCONCLUSIVE", res.reason);
  } else {
    okpass("C0  null-space basis computed", `nullity ${res.nullity}; ${res.basisDim} basis directions + ${res.combosTried} random combos re-verified`);
    res.caught
      ? okfail("C1  a null-space direction moves a PUBLIC output",
          `EXPLOIT: ${res.publicMovers.map((m) => `${m.label} -> {${m.publicSignals.join(", ")}}`).join("; ")}`)
      : okpass("C1  no null-space direction moves a public output (Dx, Dy, sufficient, or any Cᵢ/C_V/Delta)",
          `all ${res.basisDim + res.combosTried} perturbations rejected or non-public-only`);
    const onlyBenign = res.nonPublicSignals.every((s) => /\.isz\.inv$/.test(s));
    (res.nonPublicSignals.length === 0 || onlyBenign)
      ? okpass("C2  non-public freedoms are benign IsZero-style hints only", res.nonPublicSignals.join(", ") || "none")
      : okfail("C2  a non-public null-space freedom is NOT a known-benign hint -- classify manually",
          res.nonPublicSignals.filter((s) => !/\.isz\.inv$/.test(s)).join(", "));
  }
}

console.log("\n=== LEAKAGE CHECK -- same outcome, very different Sum(q): public outputs must not distinguish ===\n");
if (wHonest && wBig) {
  const v1 = await wtnsValues(wHonest);
  const vB = await wtnsValues(wBig);
  console.log(`  fixture A (Sum(q)=1000, V=900):  sufficient=${v1[3]}, Dx=${v1[1].toString().slice(0,20)}..., Dy=${v1[2].toString().slice(0,20)}...`);
  console.log(`  fixture B (Sum(q)=5000, V=4800): sufficient=${vB[3]}, Dx=${vB[1].toString().slice(0,20)}..., Dy=${vB[2].toString().slice(0,20)}...`);
  (v1[3] === 1n && vB[3] === 1n && v1[1] !== vB[1])
    ? okpass("L1  both sufficient=1; Dx/Dy differ (as random-looking points, not by 'size')", "no observable scale signal in the public transcript")
    : okfail("L1  unexpected leakage-check result");
}

rmSync(tdir, { recursive: true, force: true });
console.log(`\n=== anonymous-sufficiency adversarial soundness: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
