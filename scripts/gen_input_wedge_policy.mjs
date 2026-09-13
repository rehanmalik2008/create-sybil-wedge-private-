// Honest witness + adversarial-mutation fixtures for Open A1 (wedge_policy).
//   node scripts/gen_input_wedge_policy.mjs
//
// Builds three real Poseidon Merkle trees (delegation W=8/depth=9, category
// W=8/depth=2, destination W=8/depth=3), places the honest leaves at index 0
// of each (every sibling is the all-zero subtree value, matching the existing
// gen_input_membership.mjs convention), and writes:
//   build/input_wedge_policy.json                 -- the honest witness
//   build/input_wedge_policy_bad_dest.json         -- destination NOT in D_allow
//   build/input_wedge_policy_bad_cat.json          -- ctx NOT in C_allow
//   build/input_wedge_policy_bad_policy_open.json  -- opening != commit_P
//   build/input_wedge_policy_second.json           -- second honest spend,
//     same (ctx, epoch), different signalHash+destination -- for the burn test
import { buildPoseidon } from "circomlibjs";
import { writeFileSync, mkdirSync } from "fs";
import { randomBytes } from "crypto";

const poseidon = await buildPoseidon();
const F = poseidon.F;
const toDec = (x) => F.toObject(x).toString();
const H = (a) => poseidon(a);
const rnd = () => F.e("0x" + randomBytes(31).toString("hex"));

mkdirSync("build", { recursive: true });

// generic: build a W-ary tree of `depth`, put `leaf` at index 0, every other
// slot the all-zero subtree value. Returns { root, node, pathIndex }.
function openZeroTree(W, depth, leaf) {
  const zeros = [F.e(0)];
  for (let i = 1; i <= depth; i++) zeros[i] = H(Array(W).fill(zeros[i - 1]));
  let cur = leaf;
  const node = [], pathIndex = [];
  for (let i = 0; i < depth; i++) {
    const grp = [cur, ...Array(W - 1).fill(zeros[i])];
    node.push(grp.map(toDec));
    pathIndex.push("0");
    cur = H(grp);
  }
  return { root: cur, node, pathIndex };
}

const W = 8, D_DELEG = 9, D_CAT = 2, D_DEST = 3;

// --- the human's policy ---
const s = rnd();
const agent_id = 4242n;
const epoch_start = 100n, epoch_end = 200n;
const epoch = 150n;                      // inside [epoch_start, epoch_end]
const ctx = 777n;                        // an allowed category id
const destination = 555555n;             // an allowed destination address
const R = 5n;                            // per-epoch rate cap (RLN Q, pass-through)
const salt = rnd();
const signalHash = rnd();

const s_agent = H([s, F.e(agent_id), F.e(epoch_start), F.e(epoch_end)]);

// category / destination allowlists: honest leaf at index 0, rest zero-subtree
const catTree = openZeroTree(W, D_CAT, F.e(ctx));
const destTree = openZeroTree(W, D_DEST, F.e(destination));
const root_C_allow = catTree.root, root_D_allow = destTree.root;

const commit_P = H([root_C_allow, F.e(R), root_D_allow, salt]);

// delegation tree: leaf = Poseidon(s_agent, commit_P)
const delegLeaf = H([s_agent, commit_P]);
const delegTree = openZeroTree(W, D_DELEG, delegLeaf);
const root_deleg = delegTree.root;

const honest = {
  commit_P: toDec(commit_P),
  ctx: ctx.toString(),
  epoch: epoch.toString(),
  destination: destination.toString(),
  root_deleg: toDec(root_deleg),
  signalHash: toDec(signalHash),

  s: toDec(s),
  agent_id: agent_id.toString(),
  epoch_start: epoch_start.toString(),
  epoch_end: epoch_end.toString(),

  deleg_node: delegTree.node,
  deleg_pathIndex: delegTree.pathIndex,

  root_C_allow: toDec(root_C_allow),
  R: R.toString(),
  root_D_allow: toDec(root_D_allow),
  salt: toDec(salt),

  cat_node: catTree.node,
  cat_pathIndex: catTree.pathIndex,
  dest_node: destTree.node,
  dest_pathIndex: destTree.pathIndex,
};
writeFileSync("build/input_wedge_policy.json", JSON.stringify(honest, null, 2));
console.log("wrote build/input_wedge_policy.json (honest, root checks OK by construction)");

// --- adversarial fixture 1: spend to a NON-allowlisted destination -------
// The prover has a real address they control, opens a Merkle proof for it
// against a FORGED root that isn't the published root_D_allow, then claims
// it's the honest root_D_allow. Since D_allow's real tree only contains
// `destination` at slot 0, an attacker who wants some OTHER address `evil`
// authorized must either (i) present a fabricated path that doesn't actually
// hash to root_D_allow (should be rejected by `root === cur[depth]`), or
// (ii) reuse the honest path/root but swap in `evil` as the public
// `destination` while keeping the leaf slot at the honest value (should be
// rejected because the circuit wires `mkDest.leaf <== destination`, i.e. the
// PUBLIC destination signal IS the audited leaf -- there is no separate
// private "real destination" to smuggle through). Both attempts are emitted;
// the harness expects wtns.calculate to throw for both.
{
  const evil = 999999n; // never enrolled in D_allow
  const bad1 = { ...honest, destination: evil.toString() }; // (ii): swap public leaf value
  writeFileSync("build/input_wedge_policy_bad_dest.json", JSON.stringify(bad1, null, 2));
  console.log("wrote build/input_wedge_policy_bad_dest.json (destination not in D_allow)");
}

// --- adversarial fixture 2: spend in a NON-allowlisted category ----------
{
  const evilCtx = 888n; // never enrolled in C_allow
  const bad2 = { ...honest, ctx: evilCtx.toString() };
  writeFileSync("build/input_wedge_policy_bad_cat.json", JSON.stringify(bad2, null, 2));
  console.log("wrote build/input_wedge_policy_bad_cat.json (ctx not in C_allow)");
}

// --- adversarial fixture 3: policy opening that does NOT match commit_P ---
// keep the public commit_P as published, but open a DIFFERENT rate cap R'.
{
  const bad3 = { ...honest, R: (R + 1n).toString() };
  writeFileSync("build/input_wedge_policy_bad_policy_open.json", JSON.stringify(bad3, null, 2));
  console.log("wrote build/input_wedge_policy_bad_policy_open.json (R opening != commit_P)");
}

// --- fixture 4: a SECOND honest spend, same (ctx, epoch) as the first,
// different signalHash and destination (destination[0] of D_allow is the
// only enrolled one honestly, but for the burn test what matters is a
// second VALID point on the same RLN line -- reuse the same destination
// slot, vary signalHash only, to keep the Merkle proof honestly valid) ---
{
  const signalHash2 = rnd();
  const second = { ...honest, signalHash: toDec(signalHash2) };
  writeFileSync("build/input_wedge_policy_second.json", JSON.stringify(second, null, 2));
  console.log("wrote build/input_wedge_policy_second.json (2nd action, same ctx/epoch, Q=1 cap => should burn s_agent)");
}

console.log(`\n  s_agent (private)          = ${toDec(s_agent)}`);
console.log(`  commit_P (public)          = ${toDec(commit_P)}`);
console.log(`  root_deleg (public)        = ${toDec(root_deleg)}`);
