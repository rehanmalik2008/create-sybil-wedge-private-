pragma circom 2.1.0;
include "wedge_escrow.circom";

// Escrow-leak-fix spike (atomic-sourcing.md Falsification #2). V_lo, V_hi,
// p_star are public per the bracket construction (see wedge_escrow.circom's
// header note on why); C_esc, C_bal are public hiding commitments.
component main {public [V_lo, V_hi, p_star, C_esc, C_bal]} = WedgeEscrow();
