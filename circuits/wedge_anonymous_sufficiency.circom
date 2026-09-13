pragma circom 2.1.0;

// ---------------------------------------------------------------------------
// Step 1 (constructive-anonymous-sufficiency.md): the difference-commitment
// range proof, CORE ONLY -- no MPC (that's explicitly Step 4, not built; see
// docs/open-anonymous-sufficiency.md). A SPIKE, not production.
//
// *** READ THIS BEFORE TRUSTING ANY SECURITY NUMBER FROM THIS CIRCUIT. ***
// The theory note's Result 3 claims a public offset Delta inflates a
// colluding committee's discrete-log search to 2^kappa, priced at 2^(kappa/2)
// (Pollard-rho / BSGS). THIS IS FALSE AS STATED, confirmed empirically before
// this circuit was written (see docs/open-anonymous-sufficiency.md Step 2/3):
// a PUBLIC Delta only shifts a known search interval, it does not widen it.
// BSGS against a public Delta costs O(sqrt(n*2^ell)) regardless of Delta's
// magnitude -- measured 50x (and growing without bound as Delta grows)
// cheaper than the claimed cost, because an attacker who knows Delta (it IS
// public) searches the narrow KNOWN window [Delta, Delta+n*2^ell), not the
// full range up to Delta. This circuit still IMPLEMENTS the protocol exactly
// as specified (so the claim can be tested against a real construction, not
// a paper argument) -- it does NOT achieve the security level the theory
// note claims. See the doc for the corrected bound.
//
// DISCLOSURE (stated here, first, per instruction -- not buried):
//   - the MARKET (public-transcript-only view: Cx,Cy,CVx,CVy,Delta,Dx,Dy,
//     sufficient) learns exactly one bit: sufficient / not.
//   - each SELLER learns only its own (q_i, r_i).
//   - the BUYER learns only its own (V, s) -- same as the aggregate-
//     sufficiency spike.
//   - the SINGLE PROVER who runs this circuit (there is no MPC here, per
//     Step 4's explicit scope) must hold every q_i, r_i, V, s to compute
//     sumQ, sumR and the range check -- IDENTICAL disclosure to the plain
//     aggregate-sufficiency spike's prover. This circuit changes NOTHING
//     about who learns the sum in the single-prover setting; the entire
//     point of the theory note's protocol is the MPC step (2.3) that would
//     let the committee jointly produce this proof without any one party
//     holding sumQ/sumR -- and that MPC is exactly what is NOT built here.
//   - a colluding party who obtains R (e.g. a committee that reconstructs
//     secret-shared r_i's, in the un-built MPC version) can recover Q via a
//     BOUNDED discrete-log search -- see the corrected cost, not the
//     theory note's claimed cost, in the accompanying doc.
//
// Public: Cx[N], Cy[N] (seller commitments), CVx, CVy (buyer's demand
// commitment), Delta (the public offset -- see the falsified-claim note
// above for what it does and does not buy).
// Private, never output: q[N], r[N] (seller openings), V, s (buyer's
// opening).
// ---------------------------------------------------------------------------

include "pedersen_ec.circom";
include "ltfield.circom";
include "babyjub.circom";
include "bitify.circom";
include "escalarmulfix.circom";

function QBITS() { return 64; }       // seller/buyer amount width, matches the aggregate-sufficiency spike
function DELTA_BITS() { return 100; } // width for the public offset Delta's own bit-decomposition;
                                        // Delta must be >= 2^QBITS() for soundness (see PROTOCOL
                                        // REQUIREMENT below) -- 100 bits gives ample room to choose one.

template WedgeAnonymousSufficiency(N) {
    // ---- public ----
    signal input Cx[N];
    signal input Cy[N];
    signal input CVx;
    signal input CVy;
    signal input Delta;

    // ---- private ----
    signal input q[N];
    signal input r[N];
    signal input V;
    signal input s;

    // ---- outputs ----
    signal output Dx;
    signal output Dy;
    signal output sufficient;

    // --- bind each seller commitment, accumulate sumQ (linear, deterministic
    // -- same "no free claimed-sum" architecture as the aggregate-sufficiency
    // spike: there is nothing for a prover to claim inconsistently) ---
    component pc[N];
    signal sumQpartial[N + 1];
    sumQpartial[0] <== 0;
    for (var i = 0; i < N; i++) {
        pc[i] = PedersenCommitEC(QBITS());
        pc[i].v <== q[i];
        pc[i].r <== r[i];
        Cx[i] === pc[i].x;
        Cy[i] === pc[i].y;
        sumQpartial[i + 1] <== sumQpartial[i] + q[i];
    }
    signal sumQ;
    sumQ <== sumQpartial[N];

    // --- buyer's demand commitment opening ---
    component pcV = PedersenCommitEC(QBITS());
    pcV.v <== V;
    pcV.r <== s;
    CVx === pcV.x;
    CVy === pcV.y;

    // --- aggregate C_Sigma via EC point addition of the PUBLIC C_i --
    // third-party verifiable from Cx/Cy alone, same pattern as the
    // aggregate-sufficiency spike's aggX/aggY. ---
    component agg[N - 1];
    signal accX[N];
    signal accY[N];
    accX[0] <== Cx[0];
    accY[0] <== Cy[0];
    for (var i = 0; i < N - 1; i++) {
        agg[i] = BabyAdd();
        agg[i].x1 <== accX[i];
        agg[i].y1 <== accY[i];
        agg[i].x2 <== Cx[i + 1];
        agg[i].y2 <== Cy[i + 1];
        accX[i + 1] <== agg[i].xout;
        accY[i + 1] <== agg[i].yout;
    }

    // --- D = C_Sigma . C_V^{-1} . G^Delta, via EC point ops ---
    // twisted-Edwards point negation: -(x,y) = (-x, y).
    component subCV = BabyAdd();
    subCV.x1 <== accX[N - 1];
    subCV.y1 <== accY[N - 1];
    subCV.x2 <== -CVx;
    subCV.y2 <== CVy;

    component deltaBits = Num2Bits(DELTA_BITS());
    deltaBits.in <== Delta;
    component deltaG = EscalarMulFix(DELTA_BITS(), [GX(), GY()]);
    for (var i = 0; i < DELTA_BITS(); i++) deltaG.e[i] <== deltaBits.out[i];

    component addDelta = BabyAdd();
    addDelta.x1 <== subCV.xout;
    addDelta.y1 <== subCV.yout;
    addDelta.x2 <== deltaG.out[0];
    addDelta.y2 <== deltaG.out[1];
    Dx <== addDelta.xout;
    Dy <== addDelta.yout;

    // --- Delta_v = sumQ - V + Delta, computed as FIELD arithmetic on
    // already-bound witnesses (sumQ tied to the Cx/Cy checks above, V tied
    // to CVx/CVy) -- this is NOT re-derived from D's point coordinates via a
    // fresh commitment opening. That would need EscalarMulFix at the full
    // width of Delta_r = sumR - s, which -- because r_i/s are blinding
    // factors, not amounts -- has no natural bound short of the full field
    // (254 bits), making that re-derivation far more expensive than this
    // circuit's actual soundness requires. Delta_v's correctness follows
    // from (a)+(b) above plus the homomorphism verified empirically for
    // pedersen_ec.circom (open-c1-aggregate.md), NOT from re-opening D. ---
    signal deltaV;
    deltaV <== sumQ - V + Delta;

    // --- the sufficiency check: sumQ >= V  <=>  deltaV >= Delta. ---
    // CORRECTED from an earlier draft of this circuit, which compared deltaV
    // against a fixed 2^ELL_PRIME width instead of against Delta itself --
    // that version was WRONG and adversarial test A2 (Sum(q)=898 < V=900)
    // caught it: with Delta chosen large enough to avoid
    // wraparound (as the protocol requires, see PROTOCOL REQUIREMENT below),
    // BOTH the sufficient case (deltaV = Delta+(sumQ-V), near Delta) and the
    // insufficient case (deltaV = Delta-(V-sumQ), ALSO near Delta, just
    // smaller) land in the same width -- a bare range/width check cannot
    // distinguish them. The actual test is the direct inequality:
    //   sumQ >= V  <=>  (sumQ-V)+Delta >= Delta  <=>  deltaV >= Delta.
    // PROTOCOL REQUIREMENT (not circuit-enforced -- Delta is a public input,
    // this is a precondition on how it's chosen, documented here because
    // getting it wrong is a genuine soundness failure, not just a
    // completeness one): Delta MUST be >= 2^QBITS() (the maximum possible
    // V). If Delta is smaller than the maximum possible shortfall (V-sumQ),
    // deltaV can wrap past 0 in the OTHER direction (V-sumQ > Delta),
    // landing deltaV near p -- LtField(deltaV, Delta) then reports "not
    // less", i.e. FALSELY sufficient, for a genuinely-insufficient scenario.
    // This is exactly why Delta needs headroom over the amount width, not a
    // free security-parameter choice independent of it -- see the
    // discrete-log analysis in docs/open-anonymous-sufficiency.md for why
    // that headroom does NOT, contrary to the theory note, buy hardness
    // against a colluding committee (it only buys correctness here).
    //
    // LtField is REQUIRED, not circomlib LessThan(n): deltaV can genuinely
    // be either a small value (near Delta) or a near-p field element
    // (wrapped, in the malformed-Delta case above) -- exactly the unbounded-
    // operand case the circomlib LessThan finding demonstrates is unsound
    // for LessThan(n).
    component suff = LtField();
    suff.a <== deltaV;
    suff.b <== Delta;
    suff.out === 0; // NOT(deltaV < Delta)  <=>  sumQ >= V  <=>  sufficient

    sufficient <== 1;
}
