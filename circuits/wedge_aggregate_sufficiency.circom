pragma circom 2.1.0;

// ---------------------------------------------------------------------------
// The aggregate-sufficiency proof (who-sees-the-bracket.md Falsification #3)
// -- a SPIKE, not production. Read atomic-sourcing.md and
// who-sees-the-bracket.md: this is "the one genuinely open lever left" --
// if a ZK proof can show Sum(q_i) >= V while revealing only the boolean,
// the market-impact leak collapses from log2(Sum(q_max)/D) bits to one bit.
//
// PUBLIC: each seller's individual commitment C_i = q_i*G + r_i*H (i=1..N),
// and the buyer's demand commitment C_V = V*G + r_V*H. These commitments
// are what gets posted on-chain as sellers/buyer commit; per Step 1, ANYONE
// can compute the aggregate C_agg = Sum(C_i) from the public C_i's alone,
// via ordinary elliptic-curve point addition, with no cryptography beyond
// arithmetic and no need to open any commitment. This circuit performs that
// same addition in-circuit (aggX, aggY, public outputs) purely so a THIRD
// PARTY can verify the aggregate this proof relies on matches the
// individually-published C_i's without trusting the prover's arithmetic --
// it is NOT load-bearing for this proof's own soundness (see below).
//
// PRIVATE, NEVER a circuit output: every q_i, r_i, V, r_V.
//
// Proves:
//   (a) each C_i opens to (q_i, r_i)              -- binds every seller's
//       published commitment to a definite, non-negative q_i (Num2Bits(n)
//       inside PedersenCommitEC rejects anything that doesn't fit in n bits,
//       which is exactly what a "negative liquidity" encoding would need to
//       be -- a value near the field's p-1, vastly wider than n bits);
//   (b) C_V opens to (V, r_V)                     -- binds the buyer's claim;
//   (c) Sum(q_i) >= V                             -- sufficiency, via LtField
//       (the full-field-safe comparator; q_i/r_i/V are exactly the
//       unbounded-operand case the circomlib LessThan finding warns about --
//       see docs/open-c1-escrow.md for the same reasoning applied there).
//
// sumQ is wired as sumQ <== q[0] + q[1] + ... + q[N-1] -- a DETERMINISTIC
// linear combination of the already-bound q_i signals, not an independently
// supplied private witness. This is deliberate and is the entire answer to
// Step 4's "inconsistent openings between C_agg and the claimed sum" test:
// there is no free "claimed sum" signal to be inconsistent WITH. A prover
// cannot substitute a larger sumQ than the true sum of the individually-
// committed q_i's, because sumQ is not a value the prover chooses -- it is
// computed by the circuit from values already pinned to public commitments.
// (Contrast this with a design that took Sum(q_i) as a free private input
// and merely asserted it reopens C_agg -- that design also works, but this
// one has strictly less surface: there is nothing to "claim" at all.)
//
// *** WHO LEARNS THE SUM -- read this before treating this as the one-bit
// result. *** To compute sumQ, the prover must hold every individual
// (q_i, r_i) opening -- not just their sum. There is a SINGLE prover in this
// construction (whoever runs snarkjs.groth16.prove), and that party
// necessarily learns every seller's individual q_i, not merely the
// aggregate. This is a STRONGER disclosure than "the buyer learns Sum(q_i)"
// -- it is "the aggregator learns every q_i". See docs/open-c1-aggregate.md
// Section headed "who learns what" for the full analysis and why Step 3
// (removing this) requires infrastructure out of scope for this spike.
// ---------------------------------------------------------------------------

include "pedersen_ec.circom";
include "ltfield.circom";
include "babyjub.circom";

function QBITS() { return 64; } // headroom for realistic liquidity/demand amounts

template WedgeAggregateSufficiency(N) {
    // ---- public ----
    signal input Cx[N];
    signal input Cy[N];
    signal input CVx;
    signal input CVy;

    // ---- private ----
    signal input q[N];
    signal input r[N];
    signal input V;
    signal input rV;

    // ---- outputs ----
    signal output aggX;
    signal output aggY;
    signal output sufficient;

    // (a) each seller's commitment opens to (q_i, r_i)
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

    // aggregate the PUBLIC commitments via EC point addition -- verifiable
    // by anyone from Cx/Cy alone; belt-and-suspenders, see header note.
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
    aggX <== accX[N - 1];
    aggY <== accY[N - 1];

    // (b) buyer's demand commitment opens to (V, r_V)
    component pcV = PedersenCommitEC(QBITS());
    pcV.v <== V;
    pcV.r <== rV;
    CVx === pcV.x;
    CVy === pcV.y;

    // (c) sufficiency: Sum(q_i) >= V
    component suff = LtField();
    suff.a <== sumQ;
    suff.b <== V;
    suff.out === 0; // NOT(sumQ < V)

    sufficient <== 1;
}
