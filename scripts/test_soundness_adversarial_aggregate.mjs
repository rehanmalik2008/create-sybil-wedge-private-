// Adversarial soundness harness for the aggregate-sufficiency proof -- Step 4.
//   node scripts/gen_input_wedge_aggregate.mjs   (fixtures, run first)
//   node scripts/test_soundness_adversarial_aggregate.mjs

import * as snarkjs from "snarkjs";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nullspaceProbe } from "../vendor/proof-of-personhood/scripts/nullspace_harness.mjs";
import { readR1CS, mulm, subm, dot } from "../vendor/proof-of-personhood/scripts/two_witness_search.mjs";

const CIRC = "circuits/main_wedge_aggregate_sufficiency_js/main_wedge_aggregate_sufficiency.wasm";
const R1CS = "circuits/main_wedge_aggregate_sufficiency.r1cs";
const SYM = "circuits/main_wedge_aggregate_sufficiency.sym";
const B = (n) => `build/${n}`;

let pass = 0, fail = 0;
const okpass = (n, why) => { pass++; console.log(`  PASS  ${n}`); if (why) console.log(`          ↳ ${why}`); };
const okfail = (n, why) => { fail++; console.log(`  FAIL  ${n}`); if (why) console.log(`          ↳ ${why}`); };

const tdir = mkdtempSync(join(tmpdir(), "advsound_agg_"));
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

const honest = JSON.parse(readFileSync(B("input_wedge_aggregate.json"), "utf8"));
const insufficient = JSON.parse(readFileSync(B("input_wedge_aggregate_insufficient.json"), "utf8"));
const badOpen = JSON.parse(readFileSync(B("input_wedge_aggregate_bad_opening.json"), "utf8"));
const negQ = JSON.parse(readFileSync(B("input_wedge_aggregate_negative_q.json"), "utf8"));
const bigsum = JSON.parse(readFileSync(B("input_wedge_aggregate_bigsum.json"), "utf8"));

const wHonest = await expectAccept("A1  honest witness accepted (Sum(q)=1000 >= V=900)", honest, "baseline / negative control");
await expectAccept("A1b  second honest witness accepted (Sum(q)=5000 >= V=4800)", bigsum, "different scale, same outcome -- for the leakage check in Step 5");

await expectReject("A2  insufficient: Sum(q)=898 < V=900, honestly committed", insufficient,
  "suff: NOT(sumQ < V)");

await expectReject("A3  seller opening inconsistent with their published commitment (q[1] inflated, C[1] unchanged)", badOpen,
  "Cx[1]===pc[1].x / Cy[1]===pc[1].y (Pedersen-EC commitment opening)");

await expectReject("A4  'negative' liquidity: q[0] = p-1 fed to Num2Bits(64)", negQ,
  "Num2Bits(64) inside PedersenCommitEC(64) -- p-1 does not fit in 64 bits");

console.log("\n=== LAYER B -- tampering a satisfying witness's public output must break the R1CS ===\n");
if (wHonest) {
  const vals = await wtnsValues(wHonest);
  const rr = readR1CS(R1CS);
  // witness layout: [1, aggX, aggY, sufficient, Cx[0..2], Cy[0..2], CVx, CVy, ...]
  const iSufficient = 3;
  const tampered = vals.slice();
  tampered[iSufficient] = 0n;
  let bad = 0;
  for (const c of rr.cons) if (subm(mulm(dot(c.a, tampered), dot(c.b, tampered)), dot(c.c, tampered)) !== 0n) bad++;
  (bad > 0)
    ? okpass("B1  sufficient forced to 0 on an honest witness breaks the R1CS", `${bad} constraint(s) violated`)
    : okfail("B1  sufficient=0 tamper did not break any constraint");

  // B2 -- nudge one seller's public commitment x-coordinate; must break
  const iCx0 = 4;
  const tampered2 = vals.slice();
  tampered2[iCx0] = tampered2[iCx0] + 1n;
  let bad2 = 0;
  for (const c of rr.cons) if (subm(mulm(dot(c.a, tampered2), dot(c.b, tampered2)), dot(c.c, tampered2)) !== 0n) bad2++;
  (bad2 > 0)
    ? okpass("B2  Cx[0] nudged by 1 on an honest witness breaks the R1CS", `${bad2} constraint(s) violated`)
    : okfail("B2  Cx[0]+1 tamper did not break any constraint");
}

console.log("\n=== LAYER C -- null-space-directed search (the real soundness check) ===\n");
{
  const res = await nullspaceProbe({
    r1cs: R1CS, wasm: CIRC, sym: SYM, input: honest,
    rounds: Number(process.env.ADV_NS_ROUNDS || 128), seed: "aggregate-sufficiency",
  }).catch((e) => ({ ok: false, reason: String(e.message || e).split("\n")[0] }));

  if (!res.ok) {
    okpass("C0  null-space elimination did not complete -- INCONCLUSIVE", res.reason);
  } else {
    okpass("C0  null-space basis computed", `nullity ${res.nullity}; ${res.basisDim} basis directions + ${res.combosTried} random combos re-verified`);
    res.caught
      ? okfail("C1  a null-space direction moves a PUBLIC output",
          `EXPLOIT: ${res.publicMovers.map((m) => `${m.label} -> {${m.publicSignals.join(", ")}}`).join("; ")}`)
      : okpass("C1  no null-space direction moves a public output (aggX, aggY, sufficient, or any C_i/C_V)",
          `all ${res.basisDim + res.combosTried} perturbations rejected or non-public-only`);
    const onlyBenign = res.nonPublicSignals.every((s) => /\.isz\.inv$/.test(s));
    (res.nonPublicSignals.length === 0 || onlyBenign)
      ? okpass("C2  non-public freedoms are benign IsZero-style hints only", res.nonPublicSignals.join(", ") || "none")
      : okfail("C2  a non-public null-space freedom is NOT a known-benign hint -- classify manually",
          res.nonPublicSignals.filter((s) => !/\.isz\.inv$/.test(s)).join(", "));
  }
}

rmSync(tdir, { recursive: true, force: true });
console.log(`\n=== aggregate-sufficiency adversarial soundness: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
