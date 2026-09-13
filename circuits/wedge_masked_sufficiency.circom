pragma circom 2.1.0;

// ---------------------------------------------------------------------------
// Part 1 (partial-collusion-collapse.md): the multiplicative-mask sufficiency
// proof, Result 2/5. A SPIKE, not production. Single-holder alpha only --
// the committee t-of-m sharing of alpha is MPC, explicitly out of scope,
// same boundary as the previous two spikes in this repo.
//
// DISCLOSURE AND THE HONEST BOUNDARY -- READ THIS FIRST, per instruction.
// This construction is NOT a strict improvement over the offset construction
// (docs/open-anonymous-sufficiency.md) -- it trades one weakness for another,
// exactly as the theory note's Result 3/4 derive:
//
//   - Against a SELLER coalition controlling c<n sellers (however large c
//     is, short of n): the mask defeats them COMPLETELY. Knowing every
//     {q_i, r_i} they control gives them no way to strip alpha from
//     alpha*(Q-V), because stripping requires DIVIDING by alpha, and
//     subtracting their own contribution -- the operation that broke the
//     additive offset -- does not apply to a multiplicative factor they do
//     not know. Verified concretely in Step 3 (see docs/
//     open-masked-sufficiency.md), not just argued.
//   - Against a FULL COMMITTEE that reconstructs alpha (t-of-m, in the
//     un-built MPC): this offers ZERO protection -- once alpha is known,
//     Q-V = alpha^{-1} * [alpha*(Q-V)] EXACTLY, no search, no cost at all.
//     This is WORSE than the offset construction against a full committee
//     (which at least imposed a real, if smaller-than-claimed, BSGS cost --
//     see the prior spike's corrected Theta(sqrt(n*2^ell)) bound).
//   - Result 4 (proved in the theory note, not re-derived here): NO
//     construction over a masked homomorphic aggregate gives BOTH
//     threshold-hardness against sellers AND search-hardness against the
//     mask-holding committee, because the key that provides one IS the key
//     whose reconstruction eliminates the other. This circuit does not
//     evade that; nothing built here could.
//   - The trust anchor is therefore the COMMITTEE, not the sellers --
//     justified (Result 5) because a committee is SELECTABLE for
//     disjointness from trade beneficiaries, while sellers are the
//     beneficiaries by definition and cannot be made disjoint from
//     themselves.
//
// Public: Cx[N], Cy[N] (seller commitments, unchanged from the aggregate-
// sufficiency spike), CVx, CVy (buyer's demand commitment).
// Private, never output: q[N], r[N] (seller openings), V, s (buyer's
// opening), alpha (the mask -- single-holder here; MPC-shared in the
// un-built full construction).
//
// Note what is DIFFERENT from the offset construction: no public offset, no
// EC point arithmetic for the mask itself (alpha scales the FIELD VALUE
// Q-V, not any curve point), so this circuit needs no BabyAdd chain, no
// EscalarMulFix for a G^Delta term, and no D output. It is a strictly
// SIMPLER circuit than wedge_anonymous_sufficiency.circom -- see the
// constraint-count comparison in the doc.
// ---------------------------------------------------------------------------

include "pedersen_ec.circom";
include "ltfield.circom";
include "bitify.circom";

function QBITS() { return 64; }     // seller/buyer amount width, matches prior spikes
function ALPHA_BITS() { return 180; } // mask width; see PROTOCOL REQUIREMENT below and
                                        // the field-wrap table in docs/open-masked-sufficiency.md

template WedgeMaskedSufficiency(N) {
    // ---- public ----
    signal input Cx[N];
    signal input Cy[N];
    signal input CVx;
    signal input CVy;

    // ---- private ----
    signal input q[N];
    signal input r[N];
    signal input V;
    signal input s;
    signal input alpha;

    // ---- outputs ----
    signal output sufficient;

    // --- bind each seller commitment, accumulate sumQ (deterministic linear
    // combination -- same "no free claimed-sum" architecture as every prior
    // spike in this repo) ---
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

    // --- PROTOCOL REQUIREMENT (circuit-enforced this time, unlike Delta in
    // the offset construction, because alpha is PRIVATE -- there is no
    // deployment-level cross-check possible, so the range check must live
    // here): alpha must be a genuine positive value < 2^ALPHA_BITS(), not a
    // field-modular "negative" (alpha = p-k for small k), or the sign
    // argument in the comparison below breaks. Num2Bits(ALPHA_BITS())
    // rejects any alpha that does not fit -- this IS the field-wrap-safety
    // enforcement, not merely a width convention. ---
    component alphaCheck = Num2Bits(ALPHA_BITS());
    alphaCheck.in <== alpha;

    // --- the masked quantity: alpha*(sumQ - V), field arithmetic on
    // already-bound witnesses. If sumQ>=V, this is alpha*(small nonneg
    // integer) -- an ordinary value, no wraparound. If sumQ<V, sumQ-V wraps
    // to p-(V-sumQ) BEFORE multiplication, so alpha*(sumQ-V) mod p =
    // p - alpha*(V-sumQ) mod p, wrapping again to a value within
    // alpha*(V-sumQ) of p -- i.e. STILL close to p provided
    // alpha*(V-sumQ) << p, which the field-wrap bound (ALPHA_BITS chosen
    // against n*2^QBITS()) guarantees. No offset needed, unlike the prior
    // construction: the comparison below distinguishes the two cases
    // directly by their magnitude. ---
    signal maskedVal;
    maskedVal <== alpha * (sumQ - V);

    // bound B = alpha * (n * 2^QBITS()), the maximum possible alpha*(Q-V)
    // when sufficient. n*2^QBITS() is a compile-time constant (N, QBITS()).
    signal bound;
    bound <== alpha * (N * (1 << QBITS()));

    // --- the sufficiency check: sumQ >= V  <=>  maskedVal < bound. ---
    // LtField is REQUIRED, not circomlib LessThan(n): maskedVal is exactly
    // the unbounded-operand case (a near-p field element in the insufficient
    // case) the circomlib LessThan finding demonstrates LessThan(n) gets
    // wrong.
    component suff = LtField();
    suff.a <== maskedVal;
    suff.b <== bound;
    suff.out === 1; // maskedVal < bound  <=>  sumQ >= V  <=>  sufficient

    sufficient <== 1;
}
