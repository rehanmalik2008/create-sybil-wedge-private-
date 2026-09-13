pragma circom 2.1.0;
include "wedge_anonymous_sufficiency.circom";

// Spike sizing: 3 sellers, matching the aggregate-sufficiency spike.
component main {public [Cx, Cy, CVx, CVy, Delta]} = WedgeAnonymousSufficiency(3);
