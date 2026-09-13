pragma circom 2.1.0;
include "escalarmulfix.circom";
include "babyjub.circom";
include "bitify.circom";

// ---------------------------------------------------------------------------
// A genuine, additively-homomorphic Pedersen commitment: C = v*G + r*H, via
// honest scalar multiplication (circomlib's EscalarMulFix, which decomposes
// the scalar as a literal binary number and double-and-adds it -- see
// escalarmulfix.circom's own header comment: "the scalar is
// s = a0 + a1*2^3 + ...") plus point addition (BabyAdd).
//
// THIS IS NOT circomlib's Pedersen() hash gadget (pedersen.circom), and that
// distinction matters here specifically. Pedersen() is a windowed hash
// construction over the raw BITS of its input with per-window weights chosen
// for fast fixed-base multiplication; it is a fine hiding+binding commitment
// (used for exactly that in wedge_escrow.circom, the prior spike in this
// repo), but nothing in its definition guarantees
// Pedersen(bits(a)) + Pedersen(bits(b)) [as curve points] == Pedersen(bits(a+b)).
// The aggregate-sufficiency proof's entire premise -- "the aggregate
// commitment is computable by anyone from the individual commitments without
// opening any" (atomic-sourcing.md / who-sees-the-bracket.md) -- REQUIRES
// that additive homomorphism. EscalarMulFix(n, BASE) computes the literal
// scalar multiple v*BASE, so v1*G+v2*G = (v1+v2)*G follows from ordinary
// group-law distributivity, verified empirically against circomlibjs before
// this circuit was built (Commit(v1,r1)+Commit(v2,r2) == Commit(v1+v2,r1+r2)
// as EC points, confirmed bit-for-bit).
//
// G is circomlib's standard prime-order-subgroup generator (Base8, used
// throughout the ecosystem for EdDSA and elsewhere). H is BASE[1] from
// circomlib's own pedersen.circom generator table -- an independently
// nothing-up-my-sleeve-derived point (see pedersen_hash.js's getBasePoint /
// pedersen_printbases.js), reused rather than hand-picked, so there is no
// known discrete-log relationship between G and H introduced by this spike.
// ---------------------------------------------------------------------------

function GX() { return 5299619240641551281634865583518297030282874472190772894086521144482721001553; }
function GY() { return 16950150798460657717958625567821834550301663161624707787222815936182638968203; }
function HX() { return 2671756056509184035029146175565761955751135805354291559563293617232983272177; }
function HY() { return 2663205510731142763556352975002641716101654201788071096152948830924149045094; }

// n: bit-width of v and r. Also the mechanism that makes q_i >= 0 free:
// Num2Bits(n) rejects any witness value that does not fit in n bits (its
// binary-recomposition constraint sum(bit_i * 2^i) === in has no solution
// otherwise), so a "negative liquidity" commitment -- q_i encoded as its
// field-modular negative, i.e. a value near p-1 -- is rejected at this step
// for any realistic n, long before it would reach the sufficiency compare.
template PedersenCommitEC(n) {
    signal input v;
    signal input r;
    signal output x;
    signal output y;

    component vb = Num2Bits(n);
    vb.in <== v;
    component rb = Num2Bits(n);
    rb.in <== r;

    component mG = EscalarMulFix(n, [GX(), GY()]);
    component mH = EscalarMulFix(n, [HX(), HY()]);
    for (var i = 0; i < n; i++) { mG.e[i] <== vb.out[i]; mH.e[i] <== rb.out[i]; }

    component add = BabyAdd();
    add.x1 <== mG.out[0]; add.y1 <== mG.out[1];
    add.x2 <== mH.out[0]; add.y2 <== mH.out[1];
    x <== add.xout;
    y <== add.yout;
}
