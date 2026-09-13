// Honest witness + adversarial fixtures for the aggregate-sufficiency proof
// (Step 4). N=3 sellers, matching main_wedge_aggregate_sufficiency.circom.
//   node scripts/gen_input_wedge_aggregate.mjs
import { buildBabyjub } from "circomlibjs";
import { writeFileSync, mkdirSync } from "fs";

const bj = await buildBabyjub();
const F = bj.F;
const G = bj.Base8;
const H = [F.e("2671756056509184035029146175565761955751135805354291559563293617232983272177"),
           F.e("2663205510731142763556352975002641716101654201788071096152948830924149045094")];

mkdirSync("build", { recursive: true });

function commit(v, r) {
  const p1 = bj.mulPointEscalar(G, v);
  const p2 = bj.mulPointEscalar(H, r);
  const p = bj.addPoint(p1, p2);
  return [F.toObject(p[0]), F.toObject(p[1])];
}

// --- honest scenario: 3 sellers, demand V = 900, Sum(q) = 1000 >= 900 ---
const qs = [300n, 400n, 300n];
const rs = [111n, 222n, 333n];
const V = 900n;
const rV = 999n;

const Cs = qs.map((q, i) => commit(q, rs[i]));
const CV = commit(V, rV);

function toObj({ qs, rs, V, rV, Cs, CV }) {
  return {
    Cx: Cs.map((c) => c[0].toString()),
    Cy: Cs.map((c) => c[1].toString()),
    CVx: CV[0].toString(), CVy: CV[1].toString(),
    q: qs.map(String), r: rs.map(String),
    V: V.toString(), rV: rV.toString(),
  };
}

const honest = toObj({ qs, rs, V, rV, Cs, CV });
writeFileSync("build/input_wedge_aggregate.json", JSON.stringify(honest, null, 2));
console.log("wrote build/input_wedge_aggregate.json (honest: Sum(q)=1000, V=900, sufficient)");

// --- adversarial 1: insufficient -- Sum(q) < V (honestly committed smaller q's) ---
{
  const qs2 = [300n, 300n, 298n]; // sums to 898 < 900
  const Cs2 = qs2.map((q, i) => commit(q, rs[i]));
  const bad = toObj({ qs: qs2, rs, V, rV, Cs: Cs2, CV });
  writeFileSync("build/input_wedge_aggregate_insufficient.json", JSON.stringify(bad, null, 2));
  console.log("wrote build/input_wedge_aggregate_insufficient.json (Sum(q)=898 < V=900)");
}

// --- adversarial 2: a seller's opening doesn't match their published Cx/Cy
// (claims a q_i different from what their commitment actually opens to) ---
{
  const bad = toObj({ qs, rs, V, rV, Cs, CV });
  bad.q[1] = (BigInt(bad.q[1]) + 500n).toString(); // inflate seller 1's claimed q without updating C[1]
  writeFileSync("build/input_wedge_aggregate_bad_opening.json", JSON.stringify(bad, null, 2));
  console.log("wrote build/input_wedge_aggregate_bad_opening.json (q[1] inflated, C[1] left honest)");
}

// --- adversarial 3: "negative" liquidity -- a seller commits to q_i encoded
// as a field-modular negative value (p - 1), i.e. claims q_i = -1. The
// commitment is honestly computed for the actual scalar circomlibjs's
// mulPointEscalar uses (which reduces mod curve order, not mod p -- this
// fixture exercises what happens when the CIRCUIT is handed p-1 as `v`: it
// must be rejected by Num2Bits(64) regardless of what point mulPointEscalar
// would have produced for that scalar, since p-1 vastly exceeds 2^64).
{
  const negQ = F.p - 1n; // "-1" as a raw field element
  // NOTE: mulPointEscalar's scalar-reduction semantics differ from the
  // field; we do NOT need a matching valid commitment for this fixture --
  // the point is that q[0] itself, as a WITNESS VALUE fed to Num2Bits(64),
  // must be rejected regardless of what Cx[0]/Cy[0] claim.
  const bad = toObj({ qs, rs, V, rV, Cs, CV });
  bad.q[0] = negQ.toString();
  writeFileSync("build/input_wedge_aggregate_negative_q.json", JSON.stringify(bad, null, 2));
  console.log("wrote build/input_wedge_aggregate_negative_q.json (q[0] = p-1, i.e. 'negative' liquidity)");
}

// --- fixture for the leakage check: SAME sufficiency outcome (sufficient),
// very different Sum(q) -- Sum(q)=5000 vs Sum(q)=1000, both >= their
// respective V. Public transcript should look structurally identical
// (three commitment points + a demand commitment point + implicit boolean
// via proof validity) with no signal distinguishing "barely sufficient" from
// "wildly over-supplied". ---
{
  const qsBig = [2000n, 2000n, 1000n]; // sums to 5000
  const rsBig = [444n, 555n, 666n];
  const Vbig = 4800n;
  const rVbig = 777n;
  const CsBig = qsBig.map((q, i) => commit(q, rsBig[i]));
  const CVbig = commit(Vbig, rVbig);
  const big = toObj({ qs: qsBig, rs: rsBig, V: Vbig, rV: rVbig, Cs: CsBig, CV: CVbig });
  writeFileSync("build/input_wedge_aggregate_bigsum.json", JSON.stringify(big, null, 2));
  console.log("wrote build/input_wedge_aggregate_bigsum.json (Sum(q)=5000, V=4800, also sufficient)");
}
