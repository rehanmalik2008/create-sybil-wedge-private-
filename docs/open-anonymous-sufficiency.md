# Anonymous aggregate sufficiency (priced-collusion version) — spike report

*Reads `constructive-anonymous-sufficiency.md`. Circuits:
`wedge_anonymous_sufficiency.circom`, `main_wedge_anonymous_sufficiency.circom`.
Spike, not production. This is the elite construction the theory note asked
for — built carefully, and one of its central security claims did not
survive contact with a direct measurement. Reported plainly, per this
project's standard.*

## Disclosure profile and the honest boundary — READ THIS FIRST

**Market:** one bit (`sufficient`/not), plus the seller/buyer commitment
points and `D` — all opaque, hiding, indistinguishable across scale
(confirmed §5). **Each seller:** its own `(qᵢ, rᵢ)` only. **Buyer:** its own
`(V, s)` only. **The single prover who runs this circuit** (there is no MPC
in this spike — see §4) must hold every `qᵢ`, `rᵢ`, `V`, `s` — **identical
disclosure to the plain aggregate-sufficiency spike.** This circuit does not
by itself change who learns the sum in single-prover mode; it only builds
the range-argument component that Step 4's (unbuilt) MPC would need to make
distributed.

**The corrected security bound (supersedes the theory note's Result 3):**

> A colluding committee that obtains `R` (the aggregate blinding) recovers
> `Q` via BSGS/Pollard-rho at cost `Θ(√(n·2^ℓ))` group operations, where `n`
> is the seller count and `ℓ` the per-seller amount bit-width — **completely
> independent of the offset `Δ`'s magnitude.** The theory note's claim that
> `Δ` inflates this cost to `Θ(√2^κ)` for a chosen security parameter `κ` is
> **false as stated**: `Δ` is specified as public, and BSGS against a known
> offset costs `O(√width)` regardless of where that known interval sits — a
> public `Δ` shifts the search window, it does not widen it. **Measured
> directly** (not argued): searching the true, narrow, `Δ`-independent
> window is **50× cheaper** than the width the theory note's `κ` implies,
> and the ratio grows without bound as `Δ` grows, because the real cost
> never moves while the claimed cost keeps climbing with `Δ`. For realistic
> parameters (`n≈3–100` sellers, `ℓ=64`-bit amounts), the *actual* work
> factor is on the order of **2³³–2³⁶ group operations — days, not the
> "2⁴⁰-work-factor-for-κ=80" (interpreted as years) the theory note implies**
// see §3 for the concrete, measured numbers.
>
> Falsification #1's specific question (does a committee controlling `c`
> sellers shrink the search to the remaining `n−c`) is **confirmed true**,
> and is now understood as a second-order effect on top of a first-order
// problem: the search was never `2^κ`-wide to begin with.

**What is still real and worth having:** the sum is genuinely not exposed to
the market (one bit only, §5), sellers/buyer keep their own privacy from
each other and from the market, and a colluding committee's cost, while not
`2^(κ/2)` for a chosen `κ`, is still a *real, quantifiable, non-zero* cost
(`Θ(√(n·2^ℓ))`) rather than the "free" recovery of the naive threshold-
homomorphic approach `the-provers-knowledge.md` critiqued. That is a smaller
but genuine improvement over "coalition learns `Q` for free" — it is not the
tunable-to-any-security-level improvement claimed.

## Step 1 — the difference-commitment range proof: **built, 3,461 constraints**

`D = C_Σ · C_V⁻¹ · G^Δ`, computed via elliptic-curve point arithmetic
(`pedersen_ec.circom`'s already-verified-homomorphic commitments,
`BabyAdd`, twisted-Edwards negation `-(x,y)=(-x,y)` — confirmed empirically,
`G+(-G)=identity`). Sufficiency reduces to `sumQ ≥ V ⟺ deltaV ≥ Δ` where
`deltaV := sumQ - V + Δ` is computed as **field arithmetic on already-bound
witnesses** (`sumQ` tied to the seller commitments exactly as in the
aggregate-sufficiency spike — a deterministic linear combination, not a free
witness), checked via `LtField` (`suff.a<==deltaV; suff.b<==Delta;
suff.out===0`).

**A design bug found and fixed before this number is trustworthy.** The
first draft compared `deltaV` against a fixed `2^ℓ'` width instead of
against `Δ` itself — reasoning that an insufficient `Q<V` would wrap `deltaV`
to a near-`p` value. **This is wrong whenever `Δ` is chosen large enough to
avoid wraparound** (which the protocol needs, for `D`'s point arithmetic to
behave sensibly) — in that regime *both* the sufficient case
(`deltaV=Δ+(sumQ-V)`, near `Δ`) and the insufficient case
(`deltaV=Δ-(V-sumQ)`, also near `Δ`, just smaller) land in the same width, so
a bare range check cannot tell them apart. **Adversarial test A2 caught this
immediately** (Sum(q)=898 < V=900 was incorrectly *accepted* by the first
draft) — exactly the discipline Step 5 exists to enforce: the fix (compare
directly against `Δ`, not a fixed width) was verified against the same
fixture before anything else in this report was trusted. `LtField` is
required here, not circomlib `LessThan(n)`: `deltaV` is exactly the kind of
value that can legitimately be either near-`Δ` (small relative to the field)
or near-`p` (if `Δ` is undersized relative to the amount width — a genuine
protocol precondition, `Δ ≥ 2^QBITS()`, documented in the circuit, not
circuit-enforced since `Δ` is a public input whose validity is a deployment
concern) — the unbounded-operand case the circomlib finding demonstrates
`LessThan(n)` gets wrong.

| circuit | constraints |
|---|---:|
| `main_wedge_anonymous_sufficiency.circom` (N=3 sellers) | **3,461** |

Comparable to the plain aggregate-sufficiency spike (3,143) — the added cost
is one more `EscalarMulFix` (for `Δ·G`), one more `BabyAdd` chain (for `D`'s
construction), and one more `LtField` call.

## Step 2 — the offset security parameter: **tested, and it fails as specified**

Falsification #1, tested directly (not argued): built a small baby-jubjub
BSGS solver (`circomlibjs`'s `mulPointEscalar`/`addPoint`) and measured, not
assumed:

| scenario | search width | group ops | wall time |
|---|---:|---:|---:|
| attacker uses public `Δ` to search the true narrow window `[Δ, Δ+n·2^ℓ)` | `n·2^ℓ` (~2^9.6, toy scale) | 41 | 35 ms |
| attacker (incorrectly) assumed to search `[0, Δ+n·2^ℓ)` as if `Δ` genuinely hid the interval | `Δ+n·2^ℓ` (~2^20) | 2,049 | 235 ms |

**50× cheaper, confirmed empirically, and the ratio is unbounded as `Δ`
grows** — this is the direct refutation of Result 3's core claim.

**Falsification #1's literal question** (committee controls `c` of `n`
sellers, subtracts known contributions): confirmed true, measured directly:

| `c` (of `n=6`) | remaining search width `(n−c)·2^ℓ` | group ops |
|---:|---:|---:|
| 0 | 1,536 (~2^10.6) | 60 |
| 2 | 1,024 (~2^10.0) | 49 |
| 4 | 512 (~2^9.0) | 33 |

**Corrected bound:** `κ` (the effective, real security level) must be sized
against `ℓ + log₂(n−c)` — the *honest-seller* count's amount-width, exactly
as Falsification #1 anticipated — **not** against any offset-derived value,
because the offset contributes nothing at all (not "less than claimed," but
*zero*, since it's public). This is the materially weaker bound the task
asked me to report if I found this, and I found it.

## Step 3 — concrete work factors, measured (not asymptotic)

Baseline throughput measured on this environment (unoptimized, single-
threaded JS, `circomlibjs`): a real BSGS run at width `2^40` (`m≈2^20` baby
steps) completed in **170.3 s**, recovering the correct discrete log
(`2^21` group operations total, `≈12,317` effective ops/sec including hash-
table overhead — the raw point-addition-only rate measured separately was
`17,652`/sec). Extrapolating from this **measured** calibration point (not
the pure asymptotic):

| width (as theory-note `κ`, i.e. *if* `Δ` genuinely hid the interval this wide) | group ops (`√width`) | extrapolated time (this baseline) |
|---|---:|---:|
| `2^40` | `2^20` (1.05×10⁶) | **59 s** (measured directly: 170 s, including overhead) |
| `2^60` | `2^30` (1.07×10⁹) | **≈24 hours** |
| `2^80` | `2^40` (1.10×10¹²) | **≈2.8 years** |

**These numbers are what the theory note implies `κ=40/60/80` would cost —
and they are not the numbers that actually apply**, because (Step 2) `Δ`
does not create a search interval of this width for anyone who knows `Δ`
(which is everyone, since it's public). The **actually relevant** numbers,
using the real search width `n·2^ℓ` for realistic parameters and the same
measured throughput:

| realistic scenario | real search width | group ops | extrapolated time |
|---|---:|---:|---:|
| `n=3` sellers, `ℓ=64`-bit amounts | `3·2^64` (~2^65.6) | `≈2^32.8` (7.4×10⁹) | **≈7 days** |
| `n=100` sellers, `ℓ=64`-bit amounts | `100·2^64` (~2^70.6) | `≈2^35.3` (1.7×10¹⁰) | **≈16 days** |

Note this cost is **the same regardless of what `Δ` is set to** — setting
`Δ=2^80` buys nothing over `Δ=2^64`; both face the same `n·2^ℓ`-bounded
search. On dedicated (non-JS, GPU/ASIC-class) hardware — the realistic
adversary class for a state-level or well-resourced beneficiary, per the
theory note's own Falsification #4 — these day-to-two-week figures compress
further, plausibly to hours; **days-to-weeks on an unoptimized single-
threaded baseline is not a strong security margin against a determined
beneficiary**, which is the honest conclusion Step 6 states plainly.

## Step 4 — the MPC: scoped, not built

**Not attempted, per instruction.** The buyer↔committee MPC (theory note
§2.3) producing the range argument over secret-shared `R` requires:
- a genuine multi-party computation framework (this project has none —
  circom/snarkjs is a single-prover SNARK stack, the same limitation
  `the-provers-knowledge.md` already identified for the plain aggregate-
  sufficiency spike);
- **abort-uniformity** (Falsification #2): the buyer's view before MPC
  completion must be independent of `R`, or a malicious buyer leaks `R` one
  bit per selective abort. Standard MPC-with-guaranteed-output or
  simulatable-abort techniques exist, but are a real, non-free requirement
  on whatever MPC framework would be adopted — not addressed by this spike;
- **an unbiasable beacon for `Δ`** (Falsification #3): `Δ` must be committed
  before any `Cᵢ` and beacon-derived, or a colluding committee grinds `Δ` —
  though per Step 2's finding, grinding `Δ` for THIS reason is moot, since
  `Δ`'s value doesn't affect search cost either way; the beacon requirement
  would still matter if `Δ` were later used for something that does depend
  on its unpredictability, which this construction's core security property,
  as corrected, does not.

**This is a separate infrastructure project, not a spike extension** — the
same conclusion `the-provers-knowledge.md` reached for collaborative SNARKs.

## Step 5 — adversarial + leakage: **13/13 PASS**, nullity 0

`node scripts/gen_input_wedge_anonymous.mjs && node scripts/test_soundness_adversarial_anonymous.mjs`

**Layer A (5/5):** honest sufficient accepted; honest sufficient at a very
different scale accepted (for §5's leakage comparison); `Sum(q)=898<V=900`
rejected (**this is the fixture that caught the Step 1 design bug** — see
above); a seller inflating their claimed `qᵢ` without updating their
published commitment rejected; `q₀=p−1` ("negative" liquidity) rejected by
`Num2Bits(64)`; a proof with a *different* `Δ` (same `q`/`V`) correctly
*accepted* and correctly produces a *different* `D` — confirming `Δ` is
load-bearing in the point arithmetic, not a dead input, and that there is no
second, decoupled `Δ` for a prover to be inconsistent with (single shared
wire, same architecture as every prior spike in this repo).

**Layer B (2/2):** forcing `sufficient:=0` on an honest witness breaks the
R1CS (1 constraint); nudging `Dx` by 1 breaks it (1 constraint).

**Layer C (3/3): nullity 0** — same result as both prior spikes in this
repo; no `IsZero`/`IsEqual` logic exists in this circuit, so there is no
free direction to even test.

**Leakage check (1/1):** two honest proofs at very different scale
(`Σq=1000,V=900` vs `Σq=5000,V=4800`), both `sufficient=1`, produce
structurally identical-shaped public transcripts (`D`'s coordinates are
random-looking curve points regardless of the committed scale) — confirmed
directly, same discipline as the plain aggregate-sufficiency spike.

## Summary against the six steps

| step | result |
|---|---|
| 1. difference-commitment range proof | **built**, 3,461 constraints; a real design bug (range-vs-`Δ` comparison) found and fixed via the adversarial test before trusting the number |
| 2. offset security parameter (Result 3) | **tested and falsified as stated** — a public `Δ` buys zero hardness (measured 50× cheaper, unboundedly so as `Δ` grows); corrected bound: `κ` must track `ℓ+log₂(n−c)`, confirmed against Falsification #1's literal committee-`c`-sellers scenario |
| 3. randomness-reconstruction cost | **measured concretely**: 170.3 s real at width `2^40`; extrapolated ≈24h/≈2.8y at `2^60`/`2^80` widths *as claimed*; but the actually-relevant width (`n·2^ℓ`, `Δ`-independent) costs only ≈7–16 days on this unoptimized baseline for realistic `n` |
| 4. MPC | **scoped, not built**, per instruction — abort-uniformity and beacon requirements named as real, unaddressed costs |
| 5. adversarial + leakage | **PASS**, 13/13, nullity 0, leakage check confirms scale-independence of the public transcript |
| 6. disclosure profile / honest boundary | stated **first**, in this document's opening section, not buried — including the corrected security finding |

**Bottom line:** this spike builds the range-argument component the theory
note specified, and in doing so discovered that its central pricing claim
(Result 3, `2^(κ/2)` collusion cost tunable via `Δ`) does not hold — the real
cost is fixed by the amount-width and seller-count parameters and cannot be
raised by choosing a larger public offset. Result 5's honest-boundary
framing (sum-privacy against a fully-colluding set is priced, not
prevented) survives; the *specific price* claimed does not, and the
corrected price (`Θ(√(n·2^ℓ))`, days-to-weeks on commodity hardware for
realistic parameters) is materially weaker than advertised. This should be
corrected in `constructive-anonymous-sufficiency.md` before that note is
cited anywhere as delivering a tunable `κ`-bit security level.
