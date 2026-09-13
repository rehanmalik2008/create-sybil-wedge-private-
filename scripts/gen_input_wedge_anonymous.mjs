// Honest witness + adversarial fixtures for the difference-commitment range
// proof (Step 1/5). N=3 sellers, matching main_wedge_anonymous_sufficiency.circom.
//   node scripts/gen_input_wedge_anonymous.mjs
import { buildBabyjub } from "circomlibjs";
import { writeFileSync, mkdirSync } from "fs";

const bj = await buildBabyjub();
const F = bj.F;
const G = bj.Base8;
const H = [F.e("2671756056509184035029146175565761955751135805354291559563293617232983272177"),
           F.e("2663205510731142763556352975002641716101654201788071096152948830924149045094")];

mkdirSync("build", { recursive: true });

function commit(v, r) {
  const p = bj.addPoint(bj.mulPointEscalar(G, v), bj.mulPointEscalar(H, r));
  return [F.toObject(p[0]), F.toObject(p[1])];
}
function negate(pt) { return [(F.p - pt[0]) % F.p, pt[1]]; }
function addPts(pts) {
  let acc = pts[0];
  for (let i = 1; i < pts.length; i++) acc = [F.toObject(bj.addPoint([F.e(acc[0]), F.e(acc[1])], [F.e(pts[i][0]), F.e(pts[i][1])])[0]), F.toObject(bj.addPoint([F.e(acc[0]), F.e(acc[1])], [F.e(pts[i][0]), F.e(pts[i][1])])[1])];
  return acc;
}

// PROTOCOL REQUIREMENT: Delta >= 2^QBITS() (=2^64) or the sufficiency check
// is unsound in the other direction (see wedge_anonymous_sufficiency.circom).
// 2^80 satisfies that with headroom and matches the theory note's own
// kappa=80 framing -- though, per the discrete-log analysis in this repo's
// doc, that framing does not buy the hardness claimed.
const Delta = 1n << 80n;

function scenario(qs, rs, V, s) {
  const Cs = qs.map((q, i) => commit(q, rs[i]));
  const CV = commit(V, s);
  return {
    Cx: Cs.map((c) => c[0].toString()), Cy: Cs.map((c) => c[1].toString()),
    CVx: CV[0].toString(), CVy: CV[1].toString(),
    Delta: Delta.toString(),
    q: qs.map(String), r: rs.map(String), V: V.toString(), s: s.toString(),
  };
}

// --- honest: Sum(q)=1000, V=900, sufficient ---
const honest = scenario([300n, 400n, 300n], [111n, 222n, 333n], 900n, 999n);
writeFileSync("build/input_wedge_anonymous.json", JSON.stringify(honest, null, 2));
console.log("wrote build/input_wedge_anonymous.json (honest: Sum(q)=1000, V=900, sufficient)");

// second honest, different scale, for the leakage check (same as aggregate spike's pattern)
const bigsum = scenario([2000n, 2000n, 1000n], [444n, 555n, 666n], 4800n, 777n);
writeFileSync("build/input_wedge_anonymous_bigsum.json", JSON.stringify(bigsum, null, 2));
console.log("wrote build/input_wedge_anonymous_bigsum.json (Sum(q)=5000, V=4800, also sufficient)");

// --- adversarial 1: insufficient (honestly committed smaller q's) ---
const insufficient = scenario([300n, 300n, 298n], [111n, 222n, 333n], 900n, 999n); // sums to 898 < 900
writeFileSync("build/input_wedge_anonymous_insufficient.json", JSON.stringify(insufficient, null, 2));
console.log("wrote build/input_wedge_anonymous_insufficient.json (Sum(q)=898 < V=900)");

// --- adversarial 2: seller opening inconsistent with published Cx/Cy ---
{
  const bad = JSON.parse(JSON.stringify(honest));
  bad.q[1] = (BigInt(bad.q[1]) + 500n).toString();
  writeFileSync("build/input_wedge_anonymous_bad_opening.json", JSON.stringify(bad, null, 2));
  console.log("wrote build/input_wedge_anonymous_bad_opening.json (q[1] inflated, C[1] left honest)");
}

// --- adversarial 3: negative liquidity (q[0] = p-1) ---
{
  const bad = JSON.parse(JSON.stringify(honest));
  bad.q[0] = (F.p - 1n).toString();
  writeFileSync("build/input_wedge_anonymous_negative_q.json", JSON.stringify(bad, null, 2));
  console.log("wrote build/input_wedge_anonymous_negative_q.json (q[0] = p-1)");
}

// --- adversarial 4: inconsistent Delta -- claim sufficiency by supplying a
// DIFFERENT (larger) Delta at proof time than the one the market/verifier
// actually uses to recompute D. Since Delta is a single public input read
// directly into both the D-computation and the deltaV computation, there is
// no "second" Delta to be inconsistent with FROM INSIDE the circuit -- the
// only way to test this is to confirm that changing Delta changes Dx/Dy
// (i.e. Delta is not a dead input), which the honest generator accepting a
// different Delta (fixture below) and producing a DIFFERENT Dx/Dy confirms.
{
  const altDelta = scenario([300n, 400n, 300n], [111n, 222n, 333n], 900n, 999n);
  altDelta.Delta = (Delta + 12345n).toString();
  writeFileSync("build/input_wedge_anonymous_alt_delta.json", JSON.stringify(altDelta, null, 2));
  console.log("wrote build/input_wedge_anonymous_alt_delta.json (same q/V, different Delta -- for the D-changes-with-Delta check)");
}

console.log(`\n  Delta = 2^80 = ${Delta}`);
