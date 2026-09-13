# The aggregate-sufficiency proof (who-sees-the-bracket.md Falsification #3)

*Reads `who-sees-the-bracket.md`, `atomic-sourcing.md` (private-theory/).
Circuits: `pedersen_ec.circom`, `wedge_aggregate_sufficiency.circom`,
`main_wedge_aggregate_sufficiency.circom`. Spike, not production.*

## Read this section first: exactly who learns Σqᵢ

**The single prover who runs `snarkjs.groth16.prove` for this circuit must
hold every individual `(qᵢ, rᵢ)` opening, not merely their sum.** To wire
`sumQ <== q[0] + q[1] + ... + q[N-1]` as a witness value, the party
generating the witness needs each `qᵢ` in the clear. This is **stronger
disclosure than "the buyer learns Σqᵢ"** — it is "the party who aggregates
learns every seller's individual liquidity," full stop. If that party is the
buyer, the buyer sees each seller's `qᵢ`, not just the total. If it's a
neutral aggregator, that aggregator sees every seller's `qᵢ`. There is no
configuration of this circuit, as built, in which the aggregate is computed
without someone seeing every addend.

**What the *market* (anyone who only sees the public transcript) learns is
different and is the actual one-bit result:** the public transcript is
`{Cx[], Cy[], CVx, CVy, aggX, aggY, sufficient}` — three seller commitment
points, one demand commitment point, the in-circuit-recomputed aggregate
point, and a boolean. None of these vary in any observable way with the
*scale* of `Σqᵢ` or `V` — a Pedersen-EC commitment point looks the same
(a uniformly-random-looking curve point) whether it commits to 3 units or 3
million. Confirmed empirically in the adversarial suite (fixtures A1 and
A1b: `Σq=1000, V=900` and `Σq=5000, V=4800`, both `sufficient=1`, both
produce structurally identical-shaped public outputs — see §5).

**These are two different results and the task's own warning stands: do not
conflate them.** What's built and verified here is: *the market gets one
bit; the prover/aggregator gets every seller's amount.* That is a real,
useful reduction from the `log2(Σq_max/D)`-bit leak who-sees-the-bracket.md
quantifies — but it is not "nobody learns the sum," which would require
Step 3.

## 1. Commitment scheme — and a correction from the escrow spike

Each seller publishes `Cᵢ = qᵢ·G + rᵢ·H`; the buyer publishes `C_V = V·G +
r_V·H`. **This is genuinely, not just abstractly, additively homomorphic:**
`Cᵢ + Cⱼ` (ordinary elliptic-curve point addition) equals `Commit(qᵢ+qⱼ,
rᵢ+rⱼ)` exactly, because `qᵢ·G` is computed as an honest scalar
multiplication (circomlib's `EscalarMulFix`, which decomposes the scalar as
a literal binary number — confirmed from its own header comment: "the
scalar is `s = a0 + a1·2³ + a2·2⁶ + ...`"), so `q1·G + q2·G = (q1+q2)·G`
follows from ordinary group-law distributivity. **Verified empirically
before building the full circuit**, not assumed: I compiled an isolated
two-scalar commitment, computed `C1`, `C2` via both the compiled circuit and
`circomlibjs`'s `mulPointEscalar`/`addPoint`, and confirmed `C1 + C2`
(point addition) equals `Commit(q1+q2, r1+r2)` (direct computation) bit for
bit.

**This is a deliberate departure from `wedge_escrow.circom`'s commitment
scheme** (the prior spike in this repo, `Pedersen(collateral‖r)` using
circomlib's hash-oriented `Pedersen()` gadget). That scheme is fine for
hiding+binding, which is all the escrow spike needed, but nothing in its
windowed-hash definition guarantees `Pedersen(a) + Pedersen(b) [as points] =
Pedersen(a+b)` — the whole premise of *this* task requires that additive
property, so this circuit uses `PedersenCommitEC` (`v·G + r·H` via
`EscalarMulFix` + `BabyAdd`) instead. `G` is circomlib's standard subgroup
generator (`Base8`); `H` is `BASE[1]` from circomlib's own `pedersen.circom`
generator table — reused, not hand-picked, so there is no introduced,
undisclosed discrete-log relationship between `G` and `H`.

## 2. The sufficiency circuit

`WedgeAggregateSufficiency(N)` (`N=3` for this spike) proves, all private
except the `N+1` commitment points:

- (a) each `Cᵢ` opens to `(qᵢ, rᵢ)` — binds every seller's published
  commitment to a definite value; `Num2Bits(64)` inside `PedersenCommitEC`
  also enforces `0 ≤ qᵢ < 2⁶⁴` for free (see §4, adversarial test A4);
- (b) `C_V` opens to `(V, r_V)`;
- (c) `Σqᵢ ≥ V`, via `LtField` (`ltfield.circom`, reused from the escrow
  spike) — `qᵢ`, `rᵢ`, `V` are exactly the unbounded-operand case the
  circomlib `LessThan` finding warns about: nothing in this circuit itself
  bounds them below `2²⁵²` short of the explicit `Num2Bits(64)` checks, and
  a malicious seller/buyer choosing an adversarial value is exactly the
  threat model that finding demonstrated `LessThan(252)` fails against.

`sumQ` is wired as `sumQ <== q[0] + q[1] + ... + q[N-1]` — a **deterministic
linear combination of the already-bound `qᵢ` signals**, not a free private
input. This is the direct answer to "inconsistent openings between `C_agg`
and the claimed sum" (Step 4): there is no free "claimed sum" for a prover
to make inconsistent with anything, because the circuit never accepts a
sum as a witness — it computes one. The only way to get a different
`sumQ` is to change one of the `qᵢ` that's already bound to a public `Cᵢ`,
which (a) already covers.

`aggX, aggY` (the in-circuit sum of the public `Cᵢ` via `BabyAdd`,
independent of any private opening) are exposed as public outputs. This is
**belt-and-suspenders, not load-bearing**: the sufficiency check (c) never
reads `aggX`/`aggY`, it uses `sumQ` directly. Its purpose is letting a third
party verify, from the public commitments alone, that the aggregate this
proof is "about" matches what the `N` sellers actually published — useful
for composability with a future proof that references the same aggregate,
not needed for this proof's own soundness.

## 3. The harder version — attempted, correctly out of scope

Two directions were considered for removing the single-aggregator-learns-
everything property:

**(a) Threshold homomorphic decryption.** Each seller ElGamal-encrypts
`qᵢ` to a committee's public key; ElGamal ciphertexts are additively
homomorphic in the exponent, so the ciphertexts can be summed by anyone
without decrypting; a `t`-of-`n` threshold decryption then reveals *only*
`Σqᵢ` (not any individual `qᵢ`) to whoever runs the decryption. This is a
real, standard pattern (private-sum / e-voting tallying) — but it still
exposes `Σqᵢ` to the decrypting committee, which is Step 2's result again
with the aggregator replaced by a committee, not an improvement toward
"nobody learns the sum." It also requires an entirely different
cryptographic stack (ElGamal + a DKG for the committee key + a threshold-
decryption protocol) that doesn't exist in this project.

**(b) MPC-in-the-head / collaborative SNARK proving.** For the sum to never
be reconstructed by *anyone*, the sellers would need to jointly compute the
comparison `Σqᵢ ≥ V` via a genuine multi-party computation — each seller
holding a secret share of the computation, no party (and no coalition below
threshold) ever seeing a plaintext intermediate sum — and then either open
only the boolean result or produce a proof (via MPC-in-the-head, e.g.
ZKBoo/Ligero-style, or a "collaborative SNARK" where the witness itself is
secret-shared across provers) that the MPC ran correctly. This is a
genuinely different proving architecture from what this project uses
(Groth16 over a single prover's complete witness) — circom/snarkjs has no
notion of a witness split across non-colluding parties. Building this is a
research-and-infrastructure project in its own right, not a circuit that
fits in a spike.

**Conclusion, per instruction: this requires infrastructure out of scope for
this spike** — either the batch-clearing MPC explicitly named as out of
scope, or a materially different multi-party proving system that doesn't
exist in this project. Stopped here, as instructed; only Step 2's result is
built.

## 3 (cont). Constraint count

| circuit | constraints | wires |
|---|---:|---:|
| `PedersenCommitEC(64)` (one seller commitment, isolated) | **402** | 403 |
| `main_wedge_aggregate_sufficiency.circom` (N=3 sellers + buyer) | **3,143** | 3,141 |

Measured, not estimated, at every step (including compiling
`PedersenCommitEC` alone before the full circuit, and independently
confirming `EscalarMulFix`'s homomorphism against `circomlibjs` before
trusting the design — see §1). `EscalarMulFix`'s windowed fixed-base method
turned out considerably cheaper than the escrow spike's `Pedersen()` hash
calls scaled per bit: two `EscalarMulFix(64,...)` + one `BabyAdd` per
commitment ≈ 400 constraints, vs. `Pedersen(256)`'s 708 for a single
256-bit hash call in the escrow spike. Marginal cost per additional seller
(`N → N+1`): one more `PedersenCommitEC(64)` (~400 constraints) plus one
more `BabyAdd` for the running aggregate (~15 constraints) ≈ **~415
constraints/seller** — the construction scales linearly and cheaply; a
batch of, say, 20 sellers would land around 8,700 constraints, still well
within phone-provable range.

## 4. Adversarial tests — 10/10 PASS

`node scripts/gen_input_wedge_aggregate.mjs && node scripts/test_soundness_adversarial_aggregate.mjs`

**Layer A (4/4 rejections + 2 honest acceptances):** honest `Σq=1000 ≥
V=900` accepted; a second honest `Σq=5000 ≥ V=4800` accepted (for §5's
leakage comparison); `Σq=898 < V=900` (honestly committed) rejected;
a seller inflating their claimed `qᵢ` without updating their published
commitment rejected; `q₀ = p−1` ("negative" liquidity, encoded as the
field-modular negative) rejected by `Num2Bits(64)` before it ever reaches
the sufficiency comparison.

**Layer B (2/2):** forcing `sufficient := 0` on an honest witness breaks the
R1CS (1 constraint); nudging a public commitment coordinate `Cx[0]` by 1
breaks it (3 constraints — it feeds both that seller's own opening check
and the in-circuit aggregate).

**Layer C (3/3, the real soundness check): nullity 0** — same result as the
escrow spike, for the same reason: this circuit has no `IsZero`/`IsEqual`
selector logic, so the Jacobian at the honest witness has no free
directions at all to even test. Every signal, public and private, is
uniquely pinned to first order.

## 5. Leakage check

Compared the public transcripts of fixtures A1 (`Σq=1000, V=900`) and A1b
(`Σq=5000, V=4800`) — both `sufficient=1`. Public outputs in both cases are
three commitment points, a demand-commitment point, an aggregate point, and
the same boolean; none of these carries any observable trace of the
underlying scale (Pedersen-EC commitments are points on a curve, not
magnitude-correlated encodings — a commitment to 5,000 is not "bigger" than
a commitment to 1,000 in any observable sense). **This holds**: two
scenarios with the same sufficiency outcome and very different `Σqᵢ` are
indistinguishable to a market observer who sees only the public transcript.

**The buyer-learns-sum (more precisely, aggregator-learns-every-qᵢ)
limitation from Step 2 fully applies and is not papered over here:** the
leakage check above is about the *public transcript only*. Whoever
generated either proof saw every individual seller's `qᵢ` in plaintext to
compute `sumQ`. Reporting "the market learns only one bit" without this
caveat would be exactly the kind of overclaim this project's standard
exists to prevent; both halves of the result are stated together
deliberately.

## Summary against the five steps

| step | result |
|---|---|
| 1. commitment scheme | built and **empirically verified homomorphic** (`PedersenCommitEC` via `EscalarMulFix`+`BabyAdd`, not circomlib's `Pedersen()` hash, which was checked and does not guarantee this) |
| 2. sufficiency circuit | built: 3,143 constraints (N=3); `sumQ` is a computed linear combination, closing the "inconsistent claimed sum" attack surface by construction |
| 3. no-single-party-learns-sum | **attempted, correctly identified as requiring infrastructure out of scope** (threshold decryption or a collaborative/MPC-in-the-head proving system, neither of which exists in this project) — not built, per instruction |
| 4. adversarial tests | **PASS** — 10/10 (4 Layer A rejections + 2 acceptances, 2 Layer B, 3 Layer C — nullity 0) |
| 5. leakage check | **PASS on the market-facing claim, with the aggregator caveat stated plainly**: market sees only the boolean across very different `Σqᵢ`; the prover/aggregator sees every individual `qᵢ` — this is the weaker (but real and useful) result, not the full one-bit-to-everyone result Step 3 would have delivered |

**Bottom line, stated the way the task asked:** this spike delivers the
**"market gets one bit, aggregator gets every seller's amount"** result, not
the full one-bit-to-everyone result. Both are worth having. They are not
the same result, and this document does not conflate them.
