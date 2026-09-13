pragma circom 2.1.0;
include "bitify.circom";

// ---------------------------------------------------------------------------
// LtField: out = 1 iff a < b, for ANY a, b in [0, p). Sound for the full
// field, unlike circomlib's LessThan(n) which is sound only for inputs
// already < 2^n (see docs/filings/circomlib-lessthan-issue.md in the public
// repo). This is fix option 2 from that finding: bit-decompose both operands
// to 254 bits (Num2Bits itself range-checks each -- every field element has
// a unique 254-bit representation since 2^254 > p) and compare MSB-first.
//
// USE THIS, NOT circomlib LessThan(n), wherever an operand can be a value
// the circuit does not itself bound below 2^n -- e.g. a collateral amount,
// a price product, or anything else that could in principle be as large as
// a field element. ~1.5k constraints vs ~n for the unsafe shortcut; the
// escrow-sufficiency check in wedge_escrow.circom is exactly that case.
// ---------------------------------------------------------------------------
template LtField() {
    signal input a;
    signal input b;
    signal output out;

    component ab = Num2Bits(254);
    ab.in <== a;
    component bb = Num2Bits(254);
    bb.in <== b;

    signal lt[255];
    signal eqPrefix[255];
    lt[254] <== 0;
    eqPrefix[254] <== 1;
    signal dd[254];
    signal dlt[254];
    for (var i = 253; i >= 0; i--) {
        dd[i]  <== (ab.out[i] - bb.out[i]) * (ab.out[i] - bb.out[i]); // 1 iff bits differ
        dlt[i] <== (1 - ab.out[i]) * bb.out[i];                       // 1 iff a_i=0, b_i=1
        lt[i]  <== lt[i + 1] + eqPrefix[i + 1] * dlt[i];
        eqPrefix[i] <== eqPrefix[i + 1] * (1 - dd[i]);
    }
    out <== lt[0];
}
