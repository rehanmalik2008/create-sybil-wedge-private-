pragma circom 2.1.0;

// ---------------------------------------------------------------------------
// The escrow-leak fix (atomic-sourcing.md Falsification #2) -- a SPIKE, not
// production. Read atomic-sourcing.md and sealed-execution.md for the
// mechanism this closes: the bracket construction (Result 2 of
// atomic-sourcing.md) leaks exactly log2(V_hi/V_lo) bits about the buyer's
// true demand V ONLY IF the escrow that backs the bracket's upper bound does
// not independently reveal V_hi through the collateral amount. A naive
// escrow of `V_hi * p*` published in the clear does exactly that -- this
// circuit replaces it with a hiding commitment plus an in-circuit proof of
// sufficiency and control.
//
// PUBLIC (the bracket's own published bounds -- see the note on scope below):
//   V_lo, V_hi, p_star   -- the bracket and limit price, already public per
//                           atomic-sourcing.md §3.1 ("sellers price against
//                           [V_lo, V_hi]"): the bracket itself is meant to be
//                           seen. This circuit's job is NOT to hide V_hi a
//                           second time -- it is to guarantee the ESCROW SIDE
//                           adds no leakage beyond what the bracket already
//                           discloses.
//   C_esc                -- hiding commitment to the escrowed collateral
//   C_bal                -- hiding commitment to the buyer's total balance
//                           (assumed already published/known, e.g. from a
//                           prior custody deposit -- out of scope to build
//                           here, taken as a given public commitment)
//
// PRIVATE, NEVER a circuit output:
//   V             -- the buyer's true demand
//   collateral    -- the amount actually escrowed
//   r_esc         -- C_esc's blinding factor
//   balance       -- the buyer's total controlled balance
//   r_bal         -- C_bal's blinding factor
//
// Proves, all private except the above:
//   (a) V_lo <= V <= V_hi                          (the bracket itself)
//   (b) C_esc opens to (collateral, r_esc)          (commitment consistency)
//   (c) collateral >= V_hi * p_star                 (escrow sufficiency --
//       THIS is the check atomic-sourcing.md's Falsification #2 requires;
//       V_hi is read from the SAME public wire as (a), so there is no way to
//       satisfy sufficiency against a different, larger V_hi than the one
//       the bracket proof and every seller sees -- see Step 4's adversarial
//       test for the direct check of this)
//   (d) C_bal opens to (balance, r_bal)             (control: this really is
//       the buyer's committed balance, not an arbitrary claim)
//   (e) balance >= collateral                        (solvency: the buyer
//       actually controls at least the escrowed amount)
//
// Every comparison uses LtField (ltfield.circom), the full-field-safe
// comparator from the circomlib LessThan finding -- NOT circomlib
// LessThan(n). V, collateral, balance, and V_hi*p_star are all values this
// circuit does not itself bound below any 2^n headroom (V is buyer-chosen
// demand, collateral/balance are amounts, and their product with a price is
// exactly the kind of width-unbounded value the finding warns about); using
// the unsafe shortcut here would be the textbook instance of the bug this
// project filed against circomlib.
//
// NOT built here (explicitly out of scope, per the task): Open C1'' (minimax
// premium pricing -- still open theory) and the batch-clearing MPC (separate,
// larger). The balance commitment C_bal's own provenance (how a buyer
// establishes it in the first place) is also assumed given, not built.
// ---------------------------------------------------------------------------

include "poseidon.circom";
include "pedersen.circom";
include "bitify.circom";
include "ltfield.circom";

// HidingCommit(nBits): a Pedersen-hash commitment C = Pedersen(value || r),
// value and r each range-checked to nBits (Num2Bits reverts if either
// exceeds nBits, which is required for the Pedersen call to be well-formed
// and for the commitment opening to be unambiguous). Reuses circomlib's own
// audited Pedersen hash (the same nothing-up-my-sleeve generator table
// used throughout the ecosystem for exactly this pattern -- e.g. Tornado
// Cash's note commitments) rather than hand-deriving two independent
// baby-jubjub generators for a literal g^v * h^r construction, which would
// be new, unaudited cryptography for a spike. Same commitment properties
// (hiding, binding) either way.
template HidingCommit(nBits) {
    signal input value;
    signal input r;
    signal output out;

    component vb = Num2Bits(nBits);
    vb.in <== value;
    component rb = Num2Bits(nBits);
    rb.in <== r;

    component ped = Pedersen(2 * nBits);
    for (var i = 0; i < nBits; i++) ped.in[i] <== vb.out[i];
    for (var i = 0; i < nBits; i++) ped.in[nBits + i] <== rb.out[i];

    out <== ped.out[0];
}

// COLLATERAL_BITS: 128 bits of headroom for collateral/balance amounts --
// generous for any realistic value, and the actual reason this is safe is
// that HidingCommit's Num2Bits(128) reverts witness generation for anything
// wider, not that 128 bits is "big enough in practice" the way the LessThan
// bug's authors apparently assumed 252 bits was.
function COLLATERAL_BITS() { return 128; }

template WedgeEscrow() {
    // ---- public ----
    signal input V_lo;
    signal input V_hi;
    signal input p_star;
    signal input C_esc;
    signal input C_bal;

    // ---- private ----
    signal input V;
    signal input collateral;
    signal input r_esc;
    signal input balance;
    signal input r_bal;

    // ---- outputs ----
    signal output bracket_ok;
    signal output solvent_ok;

    // (a) V_lo <= V <= V_hi
    component geLo = LtField();
    geLo.a <== V;
    geLo.b <== V_lo;
    geLo.out === 0; // NOT(V < V_lo)
    component leHi = LtField();
    leHi.a <== V_hi;
    leHi.b <== V;
    leHi.out === 0; // NOT(V_hi < V)

    // (b) escrow commitment opens to (collateral, r_esc)
    component hc = HidingCommit(COLLATERAL_BITS());
    hc.value <== collateral;
    hc.r <== r_esc;
    C_esc === hc.out;

    // (c) escrow sufficiency: collateral >= V_hi * p_star -- V_hi is the
    // SAME public wire used in (a); required is therefore pinned to the one
    // bracket every seller sees, not a private "shadow" value.
    signal required;
    required <== V_hi * p_star;
    component suff = LtField();
    suff.a <== collateral;
    suff.b <== required;
    suff.out === 0; // NOT(collateral < required)

    // (d) balance commitment opens to (balance, r_bal)
    component hb = HidingCommit(COLLATERAL_BITS());
    hb.value <== balance;
    hb.r <== r_bal;
    C_bal === hb.out;

    // (e) solvency: balance >= collateral
    component solv = LtField();
    solv.a <== balance;
    solv.b <== collateral;
    solv.out === 0; // NOT(balance < collateral)

    bracket_ok <== 1;
    solvent_ok <== 1;
}
