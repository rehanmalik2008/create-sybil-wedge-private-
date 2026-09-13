pragma circom 2.1.0;
include "wedge_masked_sufficiency.circom";

// Spike sizing: 3 sellers, matching the prior two spikes in this repo.
component main {public [Cx, Cy, CVx, CVy]} = WedgeMaskedSufficiency(3);
