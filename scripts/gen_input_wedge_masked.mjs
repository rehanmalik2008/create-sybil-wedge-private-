// Honest witness + adversarial fixtures for the multiplicative-mask
// sufficiency proof (Step 1/4). N=3 sellers, matching
// main_wedge_masked_sufficiency.circom.
//   node scripts/gen_input_wedge_masked.mjs
import { buildBabyjub } from "circomlibjs";
import { writeFileSync, mkdirSync } from "fs";

const bj = await buildBabyjub();
const F = bj.F;
const G = bj.Base8;
const H = [F.e("2671756056509184035029146175565761955751135805354291559563293617232983272177"),
           F.e("2663205510731142763556352975002641716101654201788071096152948830924149045094")];
const P = F.p;

mkdirSync("build", { recursive: true });

function commit(v, r) {
  const p = bj.addPoint(bj.mulPointEscalar(G, v), bj.mulPointEscalar(H, r));
  return [F.toObject(p[0]), F.toObject(p[1])];
}

function scenario(qs, rs, V, s, alpha) {
  const Cs = qs.map((q, i) => commit(q, rs[i]));
  const CV = commit(V, s);
  return {
    Cx: Cs.map((c) => c[0].toString()), Cy: Cs.map((c) => c[1].toString()),
    CVx: CV[0].toString(), CVy: CV[1].toString(),
    q: qs.map(String), r: rs.map(String), V: V.toString(), s: s.toString(),
    alpha: alpha.toString(),
  };
}

// alpha: any value < 2^180 works (huge margin under the field-wrap bound
// for n=3, ell=64: safe up to ~2^188 -- see docs/open-masked-sufficiency.md).
const alpha1 = (1n << 150n) + 7777n;
const alpha2 = (1n << 90n) + 42n; // a DIFFERENT valid alpha -- Step 1 asks:
                                   // honest Q>=V proves for ANY valid alpha>0

// --- honest: Sum(q)=1000, V=900, sufficient, with alpha1 ---
const honest = scenario([300n, 400n, 300n], [111n, 222n, 333n], 900n, 999n, alpha1);
writeFileSync("build/input_wedge_masked.json", JSON.stringify(honest, null, 2));
console.log("wrote build/input_wedge_masked.json (honest: Sum(q)=1000, V=900, sufficient, alpha1)");

// same honest scenario with a DIFFERENT valid alpha -- must ALSO prove
const honestAlpha2 = scenario([300n, 400n, 300n], [111n, 222n, 333n], 900n, 999n, alpha2);
writeFileSync("build/input_wedge_masked_alpha2.json", JSON.stringify(honestAlpha2, null, 2));
console.log("wrote build/input_wedge_masked_alpha2.json (same honest scenario, DIFFERENT alpha -- must also prove)");

// second honest, different scale, for the leakage check
const bigsum = scenario([2000n, 2000n, 1000n], [444n, 555n, 666n], 4800n, 777n, alpha1);
writeFileSync("build/input_wedge_masked_bigsum.json", JSON.stringify(bigsum, null, 2));
console.log("wrote build/input_wedge_masked_bigsum.json (Sum(q)=5000, V=4800, also sufficient)");

// --- adversarial 1: insufficient, for EVERY alpha (Step 1: "Q<V fails for
// all alpha") -- test with alpha1 AND alpha2 ---
const insuff1 = scenario([300n, 300n, 298n], [111n, 222n, 333n], 900n, 999n, alpha1); // 898 < 900
writeFileSync("build/input_wedge_masked_insufficient_alpha1.json", JSON.stringify(insuff1, null, 2));
const insuff2 = scenario([300n, 300n, 298n], [111n, 222n, 333n], 900n, 999n, alpha2);
writeFileSync("build/input_wedge_masked_insufficient_alpha2.json", JSON.stringify(insuff2, null, 2));
console.log("wrote build/input_wedge_masked_insufficient_alpha{1,2}.json (Sum(q)=898 < V=900, two different alphas)");

// --- adversarial 2: seller opening inconsistent with published commitment ---
{
  const bad = JSON.parse(JSON.stringify(honest));
  bad.q[1] = (BigInt(bad.q[1]) + 500n).toString();
  writeFileSync("build/input_wedge_masked_bad_opening.json", JSON.stringify(bad, null, 2));
  console.log("wrote build/input_wedge_masked_bad_opening.json (q[1] inflated, C[1] left honest)");
}

// --- adversarial 3: negative liquidity (q[0] = p-1) ---
{
  const bad = JSON.parse(JSON.stringify(honest));
  bad.q[0] = (P - 1n).toString();
  writeFileSync("build/input_wedge_masked_negative_q.json", JSON.stringify(bad, null, 2));
  console.log("wrote build/input_wedge_masked_negative_q.json (q[0] = p-1)");
}

// --- adversarial 4: malicious alpha -- a field-modular "negative" alpha
// (alpha = p-k for small k), attempting to flip the sign test on a
// genuinely INSUFFICIENT scenario. Tests the ALPHA_BITS() range check. ---
{
  const bad = scenario([300n, 300n, 298n], [111n, 222n, 333n], 900n, 999n, P - 5n); // insufficient + malicious alpha
  writeFileSync("build/input_wedge_masked_malicious_alpha.json", JSON.stringify(bad, null, 2));
  console.log("wrote build/input_wedge_masked_malicious_alpha.json (insufficient scenario, alpha = p-5)");
}

console.log(`\n  alpha1 = 2^150+7777, alpha2 = 2^90+42 (both < 2^180 = ALPHA_BITS())`);
