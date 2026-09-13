pragma circom 2.1.0;
include "wedge_policy.circom";

// Open A1 spike. Delegation tree at the SAME size class as the frozen
// membership circuit (W=8, depth=9 -- main_mem_w8_d9_split.circom's 4,309-
// constraint baseline), so part (a) costs the same as already-shipped
// machinery. Category allowlist: W=8, depth=2 (up to 64 categories).
// Destination allowlist: W=8, depth=3 (up to 512 destinations).
component main {public [commit_P, ctx, epoch, destination, root_deleg, signalHash]}
    = WedgePolicy(8, 9, 2, 3);
