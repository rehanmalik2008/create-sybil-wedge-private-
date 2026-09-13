pragma circom 2.1.0;
include "wedge_aggregate_sufficiency.circom";

// Spike sizing: 3 sellers (illustrative -- the design is N-generic; cost
// scales linearly in N, see docs/open-c1-aggregate.md for the per-seller
// marginal cost measured directly).
component main {public [Cx, Cy, CVx, CVy]} = WedgeAggregateSufficiency(3);
