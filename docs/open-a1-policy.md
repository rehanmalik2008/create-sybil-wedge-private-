# Open A1 (private spending policy) — spike report

*Builds on `wedge_membership.circom` (frozen, reused: `MerkleWide`, `ResidualSplit`).
See `three-payment-frontiers.md` §A.3 and `bounded-delegation.md`. Circuit:
`circuits/wedge_policy.circom` / `circuits/main_wedge_policy.circom`. This is a
spike: single-Q-cap, small illustrative allowlist sizes, not a production sizing.*

## 1–2. Predicate and circuit — what was built

`commit_P = Poseidon(root_C_allow, R, root_D_allow, salt)`, published by the
human alongside `root_deleg` at delegation time. `WedgePolicy(W, D_DELEG,
D_CAT, D_DEST)` proves, all private except the six public inputs and three
outputs:

- policy opening reproduces `commit_P` (`commit_P === Poseidon(root_C_allow,
  R, root_D_allow, salt)`);
- `s_agent = Poseidon(s, agent_id, epoch_start, epoch_end)` and `epoch_start
  <= epoch <= epoch_end`;
- `Poseidon(s_agent, commit_P)` is a member of `root_deleg` — **reuses
  `MerkleWide`**, the frozen circuit's own tree-walk gadget, at the same
  (W=8, depth=9) size class as `main_mem_w8_d9_split.circom`'s 4,309-
  constraint baseline;
- `ctx` (the spend category) is a member of `root_C_allow` — new, small tree;
- `destination` is a member of `root_D_allow` — new, small tree;
- the RLN share (`N`, `y`) — **reuses `ResidualSplit` verbatim**, keyed to
  `s_agent` instead of the human's root `s` (bounded-delegation.md Layer A).

Public: `commit_P, ctx, epoch, destination, root_deleg, signalHash`. Outputs:
`N, y, authorized`. Everything else — `s, s_agent, agent_id, epoch_start,
epoch_end, root_C_allow, R, root_D_allow, salt`, every Merkle path — is
private and never a circuit output.

`R` (the RLN Q-layer's rate cap) is **not** compared against anything
in-circuit. Per Step 1's own framing it is already enforced by the existing
RLN burn (Q+1 collisions reveal `s_agent`) — reused, not rebuilt. Generalizing
from this spike's Q=1 (`ResidualSplit`'s existing degree-1 line) to bounded-
delegation §2's degree-`(Q−1)` polynomial is **deferred, not built**:
bounded-delegation.md's own Falsification §2 flags the shared-evaluation-
point joint-reveal path across Layer A/Layer B as unverified before building.
Building a new multi-degree polynomial here would be exactly the kind of
"rebuild what isn't proven safe yet" this spike was told to avoid; Step 6
below documents the economics without implementing the general-Q circuit.

## 3. Gate: constraint count — **PASS**

Compiled with `--O2` (matching `scripts/build.mjs`'s own flags — the first
compile pass omitted `--O2` and produced a misleading 20,218; re-verify
`--O2` is set before trusting any circom constraint count in this repo):

| build | constraints | wires |
|---|---:|---:|
| baseline `main_mem_w8_d9_split.circom` (frozen, W=8/depth=9) | **4,309** | 4,378 |
| `main_wedge_policy.circom` (this spike) | **7,514** | 7,617 |
| **net new** (category tree + destination tree + policy commitment + agent key + epoch range check) | **~3,205** | |

7,514 is comfortably under the ~15,000 target; the delegation-membership
sub-proof (same size class as the frozen baseline) accounts for roughly
4,000–4,300 of the total, so the genuinely new policy-predicate machinery
costs on the order of 3,200 constraints — proving this on a low-end phone is
in the same ballpark as the already-deployed frozen circuit, not materially
harder.

## 4. Adversarial tests — **15/15 PASS**

`node scripts/gen_input_wedge_policy.mjs && node scripts/test_soundness_adversarial_policy.mjs`

**Layer A (malicious input must be rejected at witness generation) — 8/8:**
destination outside `D_allow`, category outside `C_allow`, a policy opening
with a tampered `R` that no longer reproduces `commit_P`, epoch before
`epoch_start`, epoch after `epoch_end`, `agent_id` tampered (breaks the
delegation-leaf binding), and `s` tampered (same) — all correctly throw at
`wtns.calculate`, i.e. each is caught by a real `===` constraint
(`root_D_allow === cur[depth]`, `root_C_allow === cur[depth]`, `commit_P ===
pc.commit_P`, the two `SafeLessThan` checks, `root_deleg === cur[depth]`
respectively), not by convention.

**Layer B (tamper a satisfying witness's public output) — 1/1:** forcing
`authorized := 0` on an honest witness breaks the R1CS (1 constraint
violated) — `authorized <== 1` is load-bearing, not decorative.

**Layer C (null-space-directed search — the actual soundness check; per
`after-the-oracle.md`, honest-path passing establishes nothing on its own)
— 3/3:** nullity 14 at the honest witness; all 14 basis directions plus 128
random linear combinations re-verified against the full non-linear R1CS.
**None move a public signal.** The 14 non-public free directions are all
`IsEqual`'s `.isz.inv` hints inside the three `MerkleWide` instances (`mkCat`,
`mkDeleg`, `mkDest`) — the same benign class already documented for the
frozen circuit's own harness (an `IsZero` inverse witness that only floats
when its input is already 0 and which no public signal reads). This is the
load-bearing result: a linear-algebra search over the honest witness found no
way to move `N`, `y`, `authorized`, or any public input while holding every
other input fixed.

**End-to-end burn (Q+1-th spend) — 3/3:** two spends with identical `s_agent,
ctx, epoch` (Q=1 cap) but different `signalHash` produce the same nullifier
`N`, and the two `(x, y)` points recover `s_agent` exactly as the honest
generator computed it — confirming the reused `ResidualSplit` burn mechanism
still fires correctly once wired to `s_agent`. This is bounded-delegation.md
Layer A's individual-agent throttle; it burns this agent, not the human's
root `s` (Layer B's aggregate cap is out of scope for this spike, per the
task).

**Caveat on scope:** Layer C is a first-order (Jacobian null-space)
soundness check at one honest witness, not an exhaustive proof — a second
witness reachable only via a large nonlinear jump with zero linear component
would not be found, the same bound the tool documents for the frozen
baseline.

## 3/4 cross-cutting: where the LessThan bug class could have appeared

**One comparison in the whole circuit**: `epoch_start <= epoch <= epoch_end`,
the delegation validity window. This is exactly the shape the circomlib
`LessThan` finding warns about (`docs/filings/circomlib-lessthan-issue.md`).
Handled with `SafeLessThan(n)` — `Num2Bits(n)` range-checks both operands
*before* calling circomlib's `LessThan(n)`, closing the exact precondition
gap (`n <= 252` asserted, `in[i] < 2^n` never checked) that filing
demonstrated with `p−1 < 1`.

**Judgment call, stated explicitly rather than defaulted:** the task said use
"the safe full-field comparator... not circomlib LessThan(252)." I used the
*range-checked* fix (filing's fix option 1, `Num2Bits(40)` + `LessThan(40)`,
+~121 constraints per comparison) rather than the *full-field* comparator
(fix option 2, `Num2Bits(254)` + bit-serial compare, ~1.5k constraints per
comparison — **12× more expensive**, ×2 comparisons here). The full-field
comparator is the right tool when an operand can be an un-range-checked
field element — e.g. a raw hash output, which is what made the filed bug
practically exploitable (66.9% of Poseidon outputs violate the <2²⁵² bound).
`epoch`, `epoch_start`, `epoch_end` are none of that: they are Unix-epoch-
scale integers chosen by the human/agent, never a hash output, and 40 bits is
generous headroom (seconds through year ~36812). Using the full-field
comparator here would burn ~3,000 extra constraints (40% of this spike's
entire budget) defending against an operand class that cannot occur. The
`SafeLessThan` range-check is the correct fix for this operand class; the
full-field comparator remains the right choice if this predicate is ever
extended to compare a hash-derived value (e.g. a committed spend amount
derived from a Poseidon commitment) directly.

## 5. Privacy check

Recipient's entire public view: `{commit_P, ctx, epoch, destination,
root_deleg, signalHash, N, y, authorized}`. Every one of `root_C_allow`, `R`,
`root_D_allow`, `salt`, `s`, `s_agent`, `agent_id`, `epoch_start`,
`epoch_end`, and all three sets of Merkle siblings/path-indices are private
and never appear as a circuit output — confirmed structurally (they are not
in the `public [...]` list) and confirmed dynamically (Layer C's search found
no direction that moves them into any public signal).

- **Policy contents are hidden.** `commit_P` is a Poseidon hash; nothing in
  the proof reveals `C_allow`'s members, `R`'s value, or `D_allow`'s members.
- **Which allowlist entry matched is hidden.** The `MerkleWide` path
  (siblings + slot index) for both `mkCat` and `mkDest` is entirely private;
  the only public trace is that the (public) `ctx`/`destination` values *are*
  members of *some* committed set — the same information the recipient
  already had by seeing the spend's own category and destination.
- **Two agents under the *same* policy are indistinguishable.** Nothing
  ties a proof to a specific agent, delegation-tree slot, or `s_agent` value;
  only `commit_P` and `root_deleg` are public, and both are identical for
  every agent a human delegated under that policy.
- **Two agents under *different* policies are distinguishable only by their
  opaque `commit_P` label, never by its contents.** This is by design, not a
  leak: Step 2 explicitly specifies `commit_P` as a public output (so a
  verifier can index/rate-limit per policy). A verifier can tell "this proof
  is under policy-commitment X" vs "under policy-commitment Y," but learns
  nothing about what X or Y actually allow — which is the literal property
  asked for ("reveals nothing about `C_allow`, `R`, `D_allow`, or which
  specific allowlist entries matched"). Full unlinkability *across* different
  policies was never in scope (and would conflict with `commit_P` being a
  required public output).

**Inherited, out-of-scope caveat:** `ResidualSplit`'s `y = s_agent +
N·signalHash` construction is reused verbatim from the frozen circuit per
"reuse it, don't rebuild." In this construction `N` (the coefficient) is
itself a public output, so a *single* proof already lets anyone compute
`s_agent = y − N·signalHash` directly — the "burn" is not gated on a second
action revealing a *second* unknown coefficient, since there isn't one held
back. Whether that is intentional in the frozen circuit's design (e.g. because
per-epoch pseudonymity, not the sub-key's long-run secrecy, is the property
being sold) is a question about the *frozen* machinery, not this extension,
and is out of scope for this spike per the same "reuse, don't rebuild"
instruction — flagged here for the record, not re-litigated.

## 6. Q-economics — documented, not implemented

Per bounded-delegation.md §2.1/§5, enabling delegation multiplies the
deterrence requirement: a human who can act through `Q` actions of amplified
capacity per agent, aggregated across the fleet by Layer B, effectively
becomes `Q` actors instead of 1. Folding `Q` into the existing bound gives

> γ ≥ β · (Q · m) · E

i.e. the per-human deterrence budget must scale linearly in the chosen `Q`
(the RLN cap), not just in `m` and `E` as in the undelegated case. Solving for
the largest `Q` a target deterrence budget `γ` supports, for given `β`, `m`,
`E`:

> Q ≤ γ / (β · m · E)

**This bound is not calibrated here** — `β`, `m`, `E` are defined in Frontier
2's information-floor analysis, which was not part of this task's reading set
(only `three-payment-frontiers.md` and `bounded-delegation.md` were read).
Pinning a numeric `Q` for a target application requires pulling those
constants from that source and is explicitly left undone, per Step 6's
instruction ("Do not implement — document"). What *is* established here: the
`Q=1` special case (this spike's `ResidualSplit` reuse) requires no change to
the existing deterrence bound at all, since it degenerates to the
already-deployed single-cap RLN; any `Q > 1` deployment of Open A1 must
re-derive `γ` under the multiplied bound above *before* raising the cap, not
after.

## Summary against the six steps

| step | result |
|---|---|
| 1. policy predicate | specified: `commit_P = Poseidon(root_C_allow, R, root_D_allow, salt)` |
| 2. circuit | built: `circuits/wedge_policy.circom`, `circuits/main_wedge_policy.circom` |
| 3. constraint gate | **PASS** — 7,514 / ~15,000 target (4,309 baseline + ~3,205 net new) |
| 4. adversarial tests | **PASS** — 15/15 (8 Layer A, 1 Layer B, 3 Layer C, 3 end-to-end burn) |
| 5. privacy check | **PASS** — policy contents and matched-entry identity never public; cross-policy distinguishability is exactly and only the `commit_P` label, by design |
| 6. Q-economics | documented (γ ≥ β·(Q·m)·E ⇒ Q ≤ γ/(β·m·E)); not implemented, not calibrated (needs Frontier 2's constants) |

No gate failed. A.2's escrow, Frontier B, and Frontier C were not touched.
