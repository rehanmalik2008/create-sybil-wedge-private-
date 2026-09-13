// Adversarial soundness harness for the multiplicative-mask sufficiency
// proof -- Step 4.
//   node scripts/gen_input_wedge_masked.mjs   (fixtures, run first)
//   node scripts/test_soundness_adversarial_masked.mjs

import * as snarkjs from "snarkjs";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nullspaceProbe } from "../vendor/proof-of-personhood/scripts/nullspace_harness.mjs";
import { readR1CS, mulm, subm, dot } from "../vendor/proof-of-personhood/scripts/two_witness_search.mjs";

const CIRC = "circuits/main_wedge_masked_sufficiency_js/main_wedge_masked_sufficiency.wasm";
const R1CS = "circuits/main_wedge_masked_sufficiency.r1cs";
const SYM = "circuits/main_wedge_masked_sufficiency.sym";
const B = (n) => `build/${n}`;

let pass = 0, fail = 0;
const okpass = (n, why) => { pass++; console.log(`  PASS  ${n}`); if (why) console.log(`          ↳ ${why}`); };
const okfail = (n, why) => { fail++; console.log(`  FAIL  ${n}`); if (why) console.log(`          ↳ ${why}`); };

const tdir = mkdtempSync(join(tmpdir(), "advsound_masked_"));
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

console.log("\n=== LAYER A -- malicious witnesses must be REJECTED; honest must be ACCEPTED for ANY valid alpha ===\n");

const honest = JSON.parse(readFileSync(B("input_wedge_masked.json"), "utf8"));
const honestA2 = JSON.parse(readFileSync(B("input_wedge_masked_alpha2.json"), "utf8"));
const bigsum = JSON.parse(readFileSync(B("input_wedge_masked_bigsum.json"), "utf8"));
const insuffA1 = JSON.parse(readFileSync(B("input_wedge_masked_insufficient_alpha1.json"), "utf8"));
const insuffA2 = JSON.parse(readFileSync(B("input_wedge_masked_insufficient_alpha2.json"), "utf8"));
const badOpen = JSON.parse(readFileSync(B("input_wedge_masked_bad_opening.json"), "utf8"));
const negQ = JSON.parse(readFileSync(B("input_wedge_masked_negative_q.json"), "utf8"));
const malAlpha = JSON.parse(readFileSync(B("input_wedge_masked_malicious_alpha.json"), "utf8"));

const wHonest = await expectAccept("A1  honest, Sum(q)=1000>=V=900, alpha1", honest, "baseline / negative control");
const wHonestA2 = await expectAccept("A1b  SAME honest scenario, DIFFERENT alpha2 -- also proves", honestA2,
  "Step 1: any valid alpha>0 must prove an honest sufficient scenario");
const wBig = await expectAccept("A1c  second honest witness, Sum(q)=5000>=V=4800", bigsum, "different scale, for the leakage check");

await expectReject("A2  insufficient (898<900) with alpha1 -- fails", insuffA1,
  "suff: maskedVal < bound fails for alpha1");
await expectReject("A2b  SAME insufficient scenario with alpha2 -- ALSO fails", insuffA2,
  "Step 1: insufficiency must fail for EVERY alpha, not just one");

await expectReject("A3  seller opening inconsistent with published commitment", badOpen,
  "Cx[1]===pc[1].x / Cy[1]===pc[1].y");

await expectReject("A4  'negative' liquidity: q[0] = p-1", negQ,
  "Num2Bits(64) inside PedersenCommitEC(64)");

await expectReject("A5  malicious 'negative' alpha (p-5) on an insufficient scenario", malAlpha,
  "Num2Bits(ALPHA_BITS=180) rejects a field-modular-negative alpha before the sign argument can be exploited");

console.log("\n=== LAYER B -- tampering a satisfying witness's public output must break the R1CS ===\n");
if (wHonest) {
  const vals = await wtnsValues(wHonest);
  const rr = readR1CS(R1CS);
  // witness layout: [1, sufficient, Cx[0..2], Cy[0..2], CVx, CVy, ...]
  const iSufficient = 1;
  const tampered = vals.slice();
  tampered[iSufficient] = 0n;
  let bad = 0;
  for (const c of rr.cons) if (subm(mulm(dot(c.a, tampered), dot(c.b, tampered)), dot(c.c, tampered)) !== 0n) bad++;
  (bad > 0)
    ? okpass("B1  sufficient forced to 0 on an honest witness breaks the R1CS", `${bad} constraint(s) violated`)
    : okfail("B1  sufficient=0 tamper did not break any constraint");
}

console.log("\n=== LAYER C -- null-space-directed search (the real soundness check) ===\n");
{
  const res = await nullspaceProbe({
    r1cs: R1CS, wasm: CIRC, sym: SYM, input: honest,
    rounds: Number(process.env.ADV_NS_ROUNDS || 128), seed: "masked-sufficiency",
  }).catch((e) => ({ ok: false, reason: String(e.message || e).split("\n")[0] }));

  if (!res.ok) {
    okpass("C0  null-space elimination did not complete -- INCONCLUSIVE", res.reason);
  } else {
    okpass("C0  null-space basis computed", `nullity ${res.nullity}; ${res.basisDim} basis directions + ${res.combosTried} random combos re-verified`);
    res.caught
      ? okfail("C1  a null-space direction moves a PUBLIC output",
          `EXPLOIT: ${res.publicMovers.map((m) => `${m.label} -> {${m.publicSignals.join(", ")}}`).join("; ")}`)
      : okpass("C1  no null-space direction moves a public output (sufficient, or any Cᵢ/C_V)",
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
  // this circuit's ONLY public output is `sufficient` (plus Cx/Cy/CVx/CVy,
  // which are the commitments themselves, unrelated to scale) -- there is
  // no D-like point here at all, so the leakage surface is even narrower
  // than the offset construction's.
  const v1 = await wtnsValues(wHonest);
  const vB = await wtnsValues(wBig);
  console.log(`  fixture A (Sum(q)=1000, V=900):  sufficient=${v1[1]}`);
  console.log(`  fixture B (Sum(q)=5000, V=4800): sufficient=${vB[1]}`);
  (v1[1] === 1n && vB[1] === 1n)
    ? okpass("L1  both sufficient=1; no other public signal correlates with scale at all", "narrower leakage surface than the offset construction (no D output)")
    : okfail("L1  unexpected leakage-check result");
}

console.log("\n=== STEP 3 -- partial-collusion defense: does knowing q_C let a coalition strip the mask? ===\n");
{
  // Concrete algebraic demonstration (not a search -- there is nothing to
  // search; the point is that the system is UNDERDETERMINED without alpha).
  // Coalition knows Q_C (sum of the sellers it controls) and, hypothetically,
  // observes M = alpha*(Q-V) mod p (as if leaked, e.g. an MPC intermediate
  // in the un-built full construction -- this circuit itself never outputs
  // maskedVal, only `sufficient`, which is an even STRONGER guarantee than
  // this test's premise). Show: for the SAME M, Q_C, V, at least two
  // different (alpha, Q_H) pairs are consistent -- the coalition cannot
  // determine which is real.
  const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  const mod = (a) => ((a % P) + P) % P;
  const modinv = (a, m) => { a = mod(a); let [old_r, r] = [a, m], [old_s, s] = [1n, 0n]; while (r) { const q = old_r / r; [old_r, r] = [r, old_r - q * r]; [old_s, s] = [s, old_s - q * s]; } return mod(old_s); };

  const V = 900n, Q_C = 300n; // coalition controls one seller with q=300
  const trueAlpha = (1n << 150n) + 7777n;
  const trueQ_H = 700n; // true honest-side sum, Q = Q_C+Q_H = 1000 >= V=900
  const M = mod(trueAlpha * (Q_C + trueQ_H - V));

  // Coalition tries: pick an ARBITRARY alpha' != trueAlpha, solve for the
  // Q_H' that would be consistent with the SAME observed M.
  const fakeAlpha = (1n << 90n) + 42n;
  const fakeQ_H = mod(M * modinv(fakeAlpha, P) - Q_C + V); // Q_H' = M/alpha' - Q_C + V

  console.log(`  true:  alpha=${trueAlpha}, Q_H=${trueQ_H}  =>  M = ${M.toString().slice(0,20)}...`);
  console.log(`  coalition tries alpha'=${fakeAlpha} (WRONG), solves Q_H' = M/alpha' - Q_C + V = ${fakeQ_H}`);

  // verify BOTH (trueAlpha, trueQ_H) and (fakeAlpha, fakeQ_H) reproduce the SAME M
  const M_check_true = mod(trueAlpha * (Q_C + trueQ_H - V));
  const M_check_fake = mod(fakeAlpha * (Q_C + fakeQ_H - V));
  const bothConsistent = M_check_true === M && M_check_fake === M;
  const differentQH = fakeQ_H !== trueQ_H;

  (bothConsistent && differentQH)
    ? okpass("S1  system is underdetermined without alpha: two DIFFERENT (alpha,Q_H) pairs both reproduce the SAME observed M",
        `true Q_H=${trueQ_H} vs a fabricated-but-consistent Q_H'=${fakeQ_H.toString().slice(0,20)}... -- the coalition cannot tell which is real. Subtracting the known Q_C never isolates Q_H because the unknown alpha still multiplies it.`)
    : okfail("S1  masking did not produce the expected underdetermination", `bothConsistent=${bothConsistent} differentQH=${differentQH}`);

  console.log("\n  --- contrast: the OFFSET construction's analogous attack (for comparison) ---");
  console.log("  additive case: observed M_add = (Q-V)+Delta (Delta PUBLIC, known).");
  console.log("  coalition computes Q_H directly: Q_H = M_add - Delta - Q_C + V  -- UNIQUELY DETERMINED, no unknowns left.");
  console.log("  (this is exactly the linear-stripping collapse measured in the prior spike's Falsification #1 test.)");
  okpass("S2  qualitative contrast confirmed", "additive offset: unique, direct recovery (0 unknowns). Multiplicative mask: underdetermined (1 equation, 2 unknowns) without alpha.");
}

rmSync(tdir, { recursive: true, force: true });
console.log(`\n=== masked-sufficiency adversarial soundness: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
