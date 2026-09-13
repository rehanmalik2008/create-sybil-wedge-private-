pragma circom 2.1.0;

// ---------------------------------------------------------------------------
// Open A1 (private spending policy) -- a SPIKE, not production.
// See three-payment-frontiers.md §A.3 (Open A1) and bounded-delegation.md.
//
// Extends the frozen Phase-2 membership circuit (wedge_membership.circom,
// MerkleWide + ResidualSplit -- REUSED VERBATIM, not rebuilt) with a
// human-committed spending policy P = (C_allow, R, D_allow):
//
//   commit_P = Poseidon(root_C_allow, R, root_D_allow, salt)     -- published
//              by the human at delegation time, alongside root_deleg.
//
// Proves, all private except the listed public signals:
//   (a) s_agent = Poseidon(s, agent_id, epoch_start, epoch_end) derives from
//       a leaf Poseidon(s_agent, commit_P) that is a member of root_deleg
//       (the human's published delegation set) -- REUSES MerkleWide, the
//       frozen circuit's own tree-walk gadget, at the SAME (W=8, depth=9)
//       size class as the frozen circuit, so this sub-proof costs the same
//       as the existing 4,309-constraint baseline's membership check.
//   (a') epoch_start <= epoch <= epoch_end (the delegation's validity window).
//   (b) ctx (the spend's category) is a member of root_C_allow -- NEW,
//       small tree (policy-sized, not identity-set-sized).
//   (c) destination is a member of root_D_allow -- NEW, small tree.
//   (d) the RLN share for the per-epoch rate cap R -- REUSES ResidualSplit
//       verbatim, keyed to s_agent instead of the human's root s (this is
//       bounded-delegation.md's Layer A). R itself is NOT compared against
//       anything in-circuit: the cap is enforced by the existing RLN burn
//       mechanism (Q+1 collisions reveal s_agent), which is already-audited
//       machinery -- "reuse it, don't rebuild" (three-payment-frontiers.md
//       A.2, bounded-delegation.md §2). Generalizing Layer A from Q=1 (this
//       circuit's ResidualSplit reuse) to bounded-delegation's degree-(Q-1)
//       polynomial is EXPLICITLY deferred: bounded-delegation.md §5.2/5.3
//       and its Falsification §2 flag the shared-evaluation-point joint-
//       reveal path as unverified. Building that here would be exactly the
//       "rebuild what's not proven safe yet" this spike is told to avoid.
//       Step 6 (Q-economics) is documented, not implemented, for the same
//       reason.
//
// Public outputs: N, y (the RLN pair), commit_P (echoed back so a verifier
// can index by policy without seeing its contents), and `authorized` (a
// constant 1 -- see docs/self-audit/open-a1-policy.md for why this bit is
// only meaningful bound into a valid proof, not as a free-standing flag).
//
// PRIVATE and NEVER a circuit output: root_C_allow, R, root_D_allow, salt,
// s, s_agent, agent_id, epoch_start, epoch_end, and every Merkle path. The
// recipient's entire view is {commit_P, ctx, epoch, destination, root_deleg,
// signalHash, N, y, authorized} -- all of which the recipient already knew
// or was told out of band, except N/y/authorized, which reveal nothing about
// P's contents (see docs/self-audit/open-a1-policy.md §5).
// ---------------------------------------------------------------------------

include "poseidon.circom";
include "bitify.circom";
include "comparators.circom";
include "wedge_membership.circom";   // MerkleWide, ResidualSplit -- REUSED, not rebuilt

// ---------------------------------------------------------------------------
// SafeLessThan(n): the fix from the circomlib LessThan finding
// (docs/filings/circomlib-lessthan-issue.md, fix option 1). circomlib's own
// LessThan(n) is sound ONLY if both inputs are already < 2^n; it does not
// check this. Range-checking the operands to n bits FIRST (Num2Bits reverts
// if the value doesn't fit) closes exactly the gap that filing demonstrated
// with `p-1 < 1`. This is the cheap fix (+2n constraints), correct here
// because epoch/epoch_start/epoch_end are small application-bounded integers
// (Unix-epoch-scale timestamps), NOT hash outputs -- the ~1.5k-constraint
// full-field comparator (fix option 2, sound for ALL of [0,p)) would be the
// wrong tool for this operand class and would blow the constraint budget for
// no security benefit; it is the right tool only when an operand can
// genuinely be an un-range-checked field element (e.g. a raw Poseidon
// output), which none of these three values are.
// ---------------------------------------------------------------------------
template SafeLessThan(n) {
    signal input in[2];
    signal output out;

    component rc0 = Num2Bits(n);
    rc0.in <== in[0];
    component rc1 = Num2Bits(n);
    rc1.in <== in[1];

    component lt = LessThan(n);
    lt.in[0] <== in[0];
    lt.in[1] <== in[1];
    out <== lt.out;
}

// commit_P = Poseidon(root_C_allow, R, root_D_allow, salt)
template PolicyCommit() {
    signal input root_C_allow;
    signal input R;
    signal input root_D_allow;
    signal input salt;
    signal output commit_P;

    component h = Poseidon(4);
    h.inputs[0] <== root_C_allow;
    h.inputs[1] <== R;
    h.inputs[2] <== root_D_allow;
    h.inputs[3] <== salt;
    commit_P <== h.out;
}

// s_agent = Poseidon(s, agent_id, epoch_start, epoch_end)
template AgentKey() {
    signal input s;
    signal input agent_id;
    signal input epoch_start;
    signal input epoch_end;
    signal output s_agent;

    component h = Poseidon(4);
    h.inputs[0] <== s;
    h.inputs[1] <== agent_id;
    h.inputs[2] <== epoch_start;
    h.inputs[3] <== epoch_end;
    s_agent <== h.out;
}

// EPOCH_BITS: epoch/epoch_start/epoch_end are Unix-epoch-second-scale values.
// 40 bits covers seconds through year ~36812; plenty of headroom, far under
// the 252-bit ceiling where the LessThan precondition actually starts to bite.
function EPOCH_BITS() { return 40; }

template WedgePolicy(W, D_DELEG, D_CAT, D_DEST) {
    // ---- public ----
    signal input commit_P;
    signal input ctx;
    signal input epoch;
    signal input destination;
    signal input root_deleg;
    signal input signalHash;

    // ---- private: agent key ----
    signal input s;
    signal input agent_id;
    signal input epoch_start;
    signal input epoch_end;

    // ---- private: (a) delegation opening ----
    signal input deleg_node[D_DELEG][W];
    signal input deleg_pathIndex[D_DELEG];

    // ---- private: policy opening (must reproduce commit_P) ----
    signal input root_C_allow;
    signal input R;
    signal input root_D_allow;
    signal input salt;

    // ---- private: (b) category opening, (c) destination opening ----
    signal input cat_node[D_CAT][W];
    signal input cat_pathIndex[D_CAT];
    signal input dest_node[D_DEST][W];
    signal input dest_pathIndex[D_DEST];

    // ---- outputs ----
    signal output N;
    signal output y;
    signal output authorized;

    // --- policy opening must match the human's published commitment ---
    component pc = PolicyCommit();
    pc.root_C_allow <== root_C_allow;
    pc.R <== R;
    pc.root_D_allow <== root_D_allow;
    pc.salt <== salt;
    commit_P === pc.commit_P;

    // --- agent sub-key ---
    component ak = AgentKey();
    ak.s <== s;
    ak.agent_id <== agent_id;
    ak.epoch_start <== epoch_start;
    ak.epoch_end <== epoch_end;

    // --- (a') epoch must fall inside the delegated validity window ---
    // epoch_start <= epoch  <=>  NOT(epoch < epoch_start)
    component geStart = SafeLessThan(EPOCH_BITS());
    geStart.in[0] <== epoch;
    geStart.in[1] <== epoch_start;
    geStart.out === 0;
    // epoch <= epoch_end    <=>  NOT(epoch_end < epoch)
    component leEnd = SafeLessThan(EPOCH_BITS());
    leEnd.in[0] <== epoch_end;
    leEnd.in[1] <== epoch;
    leEnd.out === 0;

    // --- (a) s_agent derives from a valid delegated root ---
    component hDelegLeaf = Poseidon(2);
    hDelegLeaf.inputs[0] <== ak.s_agent;
    hDelegLeaf.inputs[1] <== commit_P;
    component mkDeleg = MerkleWide(W, D_DELEG);
    mkDeleg.leaf <== hDelegLeaf.out;
    mkDeleg.root <== root_deleg;
    for (var i = 0; i < D_DELEG; i++) {
        mkDeleg.pathIndex[i] <== deleg_pathIndex[i];
        for (var j = 0; j < W; j++) mkDeleg.node[i][j] <== deleg_node[i][j];
    }

    // --- (b) category membership: ctx is a leaf of root_C_allow ---
    component mkCat = MerkleWide(W, D_CAT);
    mkCat.leaf <== ctx;
    mkCat.root <== root_C_allow;
    for (var i = 0; i < D_CAT; i++) {
        mkCat.pathIndex[i] <== cat_pathIndex[i];
        for (var j = 0; j < W; j++) mkCat.node[i][j] <== cat_node[i][j];
    }

    // --- (c) destination membership: destination is a leaf of root_D_allow ---
    component mkDest = MerkleWide(W, D_DEST);
    mkDest.leaf <== destination;
    mkDest.root <== root_D_allow;
    for (var i = 0; i < D_DEST; i++) {
        mkDest.pathIndex[i] <== dest_pathIndex[i];
        for (var j = 0; j < W; j++) mkDest.node[i][j] <== dest_node[i][j];
    }

    // --- (d) RLN share for the Q-cap -- REUSED, not rebuilt ---
    component res = ResidualSplit();
    res.s <== ak.s_agent;
    res.ctx <== ctx;
    res.epochAction <== epoch;
    res.signalHash <== signalHash;
    N <== res.N;
    y <== res.y;

    authorized <== 1;
}
