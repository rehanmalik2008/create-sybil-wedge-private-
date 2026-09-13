# Multiplicative masking (Part 1) and the functional-commitment frontier (Part 2)

*Reads `partial-collusion-collapse.md`. Two distinct tasks, kept separate
throughout this document, per instruction. Part 1 circuits:
`wedge_masked_sufficiency.circom`, `main_wedge_masked_sufficiency.circom`.
Part 2 is literature + feasibility only — no circuit.*

## Part 1 — disclosure profile and the honest trade — READ THIS FIRST

This construction is **not** a strict improvement over the offset
construction (`docs/open-anonymous-sufficiency.md`) — it trades one weakness
for a different one, exactly as `partial-collusion-collapse.md`'s Result 3/4
derive, and this is confirmed here by direct construction and test, not
re-argued from the paper:

- **Against a seller coalition controlling `c<n` sellers, however large `c`
  is** (short of all `n`): the mask **defeats them completely**. Verified
  concretely in Step 3 (below), not just asserted — subtracting known
  contributions requires *dividing* by the unknown mask `α`, which the
  coalition cannot do.
- **Against a full committee that reconstructs `α`** (the `t`-of-`m` MPC,
  not built here): this offers **zero** protection — `Q−V =
  α⁻¹·[α(Q−V)]` exactly, no search, no residual cost at all. This is
  **worse** than the offset construction against a full committee, which at
  least imposed a real (if smaller-than-claimed) `Θ(√(n·2^ℓ))` BSGS cost.
- **Result 4 (proved in the theory note, not re-derived here) stands**: no
  construction over a masked homomorphic aggregate gives both
  threshold-hardness against sellers and search-hardness against the
  mask-holding committee — the key that provides one is the key whose
  reconstruction eliminates the other. Nothing built here evades this.
- **The trust anchor is therefore the committee**, justified because a
  committee is *selectable* for disjointness from trade beneficiaries, while
  sellers are the beneficiaries by definition. This spike does not build or
  verify committee selectability (Result 5's own §falsification #4 already
  flags this as deployment-dependent) — it only confirms the cryptographic
  half of Result 5 holds as claimed.

## Part 1, Step 1 — the masked range proof: **built, 3,312 constraints**

`WedgeMaskedSufficiency(N=3)` proves, all private except the seller/buyer
commitments: each `Cᵢ` opens to `(qᵢ,rᵢ)`, `C_V` opens to `(V,s)`,
`sumQ := Σqᵢ` (deterministic linear combination, same "nothing to claim
inconsistently" architecture as every prior spike here), and
`sufficient ⟺ maskedVal < bound` where `maskedVal := α·(sumQ−V)` and
`bound := α·(n·2^QBITS())`, checked via `LtField` — required, not circomlib
`LessThan(n)`, because `maskedVal` is exactly the near-`p`-when-insufficient
case the finding warns about.

Simpler than the offset construction (3,461 constraints): no `D`, no public
`Δ`, no `EscalarMulFix`/`BabyAdd` for the mask itself, because `α` scales
the **field value** `Q−V`, not a curve point.

| circuit | constraints |
|---|---:|
| `main_wedge_masked_sufficiency.circom` (N=3) | **3,312** |
| (for comparison) `main_wedge_anonymous_sufficiency.circom` (offset, N=3) | 3,461 |

**Verified per Step 1's literal ask**: honest `Σq=1000≥V=900` proves under
**two different valid `α` values** (`2^150+7777` and `2^90+42`) — sufficiency
does not depend on which `α` is used. The same insufficient scenario
(`Σq=898<V=900`) **fails for both** `α` values tested — insufficiency is not
an artifact of one unlucky mask choice.

## Part 1, Step 2 — the field-wrap bound: **confirmed, ample margin, exactly as claimed**

Unlike Result 3 of the *prior* theory note (which I falsified — a public
offset buys zero hardness), this bound is a different kind of claim (a
hiding-boundedness constraint on a **private** secret, not a search-space
claim about a **public** one) and it holds up:

| `n` | `ℓ` | `n·2^ℓ` | safe `α` entropy (`log₂(p/(n·2^ℓ))`) |
|---:|---:|---:|---:|
| 10 | 40 | 2^43.32 | **210.27 bits** |
| 100 | 40 | 2^46.64 | **206.95 bits** |
| 1000 | 40 | 2^49.97 | **203.63 bits** |

(computed against BN254's `p ≈ 2^253.6`.) For this spike's own parameters
(`n=3, ℓ=64`): `n·2^ℓ ≈ 2^65.58`, safe `α` entropy `≈ 2^188.4`; the circuit
uses `ALPHA_BITS()=180`, comfortably under that margin. **The safe range is
not too small to hide the sign — confirmed, not just computed on paper**:
the circuit enforces `α<2^180` via `Num2Bits`, and adversarial test A5
confirms a malicious field-modular-negative `α` (`p−5`) is rejected before
it could exploit the sign argument.

## Part 1, Step 3 — the partial-collusion defense: **confirmed by direct construction**

This is the whole point of the construction, and it's demonstrated
concretely, not argued: a coalition controlling seller(s) with known
`Q_C=300` observes (hypothetically — this circuit never actually outputs
`maskedVal`, only the boolean, an even stronger guarantee than this test's
premise) `M = α·(Q−V) mod p` for the true `α` and true honest-side sum
`Q_H=700`. The coalition tries an arbitrary **wrong** `α'` and solves for
the `Q_H'` that would be consistent with the *same* `M`:

```
Q_H' = M/α' − Q_C + V
```

**Result: a completely different, huge, fabricated `Q_H'` is exactly as
consistent with the observed `M` as the true `Q_H=700`** — the system is
underdetermined (one equation, two unknowns: `α` and `Q_H`) without `α`.
The coalition cannot tell which is real from `M` and `Q_C` alone.

**Direct contrast with the offset construction's identical attack**
(`open-anonymous-sufficiency.md`'s Falsification #1 test): there, the
observed value is `M_add=(Q−V)+Δ` with `Δ` **public**, so
`Q_H = M_add − Δ − Q_C + V` is **uniquely, directly computable** — zero
unknowns remain. That is exactly the linear-stripping collapse measured in
the prior spike. **The mask closes precisely this gap**: the analogous
operation now requires dividing by an unknown, not subtracting a known
public constant.

## Part 1 — adversarial + leakage: **15/15 PASS**, nullity 0

`node scripts/gen_input_wedge_masked.mjs && node scripts/test_soundness_adversarial_masked.mjs`

**Layer A (8/8):** honest sufficient accepted for two different `α`;
insufficient rejected for both of the same two `α`; seller-opening
inconsistency rejected; negative liquidity (`q₀=p−1`) rejected; a malicious
field-modular-negative `α` on an insufficient scenario rejected by the
`ALPHA_BITS` range check.

**Layer B (1/1):** forcing `sufficient:=0` on an honest witness breaks the
R1CS.

**Layer C (3/3): nullity 0** — same as both prior spikes; no
`IsZero`/`IsEqual` logic in this circuit at all.

**Leakage (1/1):** two honest proofs at very different scale (`Σq=1000` vs
`Σq=5000`, both sufficient) are indistinguishable — and this circuit's
leakage surface is **narrower than the offset construction's**: there is no
`D`-like point output at all here, only the single boolean plus the
(already-opaque) commitments.

**Step 3 defense (2/2):** the underdetermination result above, plus the
direct qualitative contrast against the offset construction's collapse.

---

## Part 2 — the functional-commitment frontier (Result 6): literature + feasibility, no build

### Step 5 — literature search verdict: **no existing scheme found with the needed separation**

Searched the lattice functional-commitment literature (de Castro–Peikert
"Functional Commitments for All Functions" [Springer](https://link.springer.com/content/pdf/10.1007/978-3-031-30620-4_10),
Wee–Wu "Succinct Vector, Polynomial, and Functional Commitments from
Lattices" [NTT Research PDF](https://ntt-research.com/wp-content/uploads/2023/01/Succinct-Vector-Polynomial-and-Functional-Commitments-from-Lattices.pdf),
Balbás–Catalano–Fiore–Lai "Lattice-Based Functional Commitments: Fast
Verification and Cryptanalysis" [PDF](https://www.cs.utexas.edu/~dwu4/papers/LatticeFC-Fast.pdf)),
plus adjacent threshold/multi-party primitives (Multi-Party Functional
Encryption, Decentralized Multi-Client Functional Encryption), for: threshold
or multi-party functional commitments with a predicate-opening key provably
distinct from a value-opening key.

**Found: no such scheme, in either literature branch.**

1. **Standard (non-threshold) lattice functional commitments** define
   security around *binding* — the committer cannot open to two different
   values `y₀≠y₁` for the same function `f` — not around separating who can
   produce an opening from who knows the raw committed vector. In every
   scheme found, **the opener is the committer, who already holds the full
   committed value** — structurally identical to the single-prover SNARK
   limitation `the-provers-knowledge.md` already proved (a party producing a
   proof/opening about a predicate over `x` must know `x`). Functional
   commitments as studied do not escape this; they were never designed to.

2. **The closest adjacent primitives that *do* decentralize** —
   Multi-Party Functional Encryption (MPFE) and Decentralized Multi-Client
   Functional Encryption (DMCFE) [surveyed here](https://arxiv.org/pdf/2106.06306) —
   remove the single trusted key-issuing authority by requiring the **data-
   holding clients themselves** to cooperate in deriving functional keys.
   Mapped onto this project's setting, the "clients" are the **sellers** —
   i.e. this decentralization relocates trust to exactly the unselectable,
   self-interested coalition Result 4/5 already identified as the wrong
   party to trust. It does not evade the dilemma; it restates it in FE
   vocabulary.

3. **Even a hypothetical committee-based threshold-FE variant** generally
   fails the separation on structural grounds, independent of whether a
   paper describing exactly this was found: standard FE constructions
   derive a functional key `sk_f` from a function-agnostic master secret
   plus a description of `f`. A threshold set that can jointly derive
   `sk_{[Σ≥V]}` generally has access to the same secret machinery needed to
   derive `sk_{identity}` (which would reveal the raw value) for a
   *different* function request — the master secret does not know which
   function it will be asked about. **A scheme that structurally forecloses
   this — supporting only the one hardwired predicate, provably nothing
   else, from inception — would no longer be a general "functional
   commitment from lattices" in the sense surveyed; it would be a bespoke,
   single-purpose secure-comparison MPC protocol.** That object already
   exists in this project's own scoping: it is exactly the "collaborative
   SNARK" / distributed-comparison-MPC route `the-provers-knowledge.md`
   named and correctly deferred as separate infrastructure, restated under
   different terminology, not a new primitive.

### Step 6 — feasibility verdict: **Result 6 is confirmed as a genuinely open problem**

No existing scheme — general lattice functional commitment, or its
threshold-FE relatives — separates predicate-opening from value-opening in
the way Result 4's escape hatch requires. Restated precisely, per
instruction:

- **If** a general-purpose functional commitment existed where a
  threshold predicate-opening key were *provably* incapable of deriving (or
  being extended to derive) a value-opening key for the same commitment,
  **then** Result 4's hypothesis (a masked *homomorphic aggregate*) would
  not apply to it — it would be a structurally different object, and
  Result 4 would not foreclose it. No such general-purpose scheme was found.
- The one construction that *would* achieve the goal — a hardwired,
  single-predicate secure-comparison protocol with no general key-derivation
  capability at all — is not a "functional commitment" novelty in the sense
  the theory note's Result 6 was hoping for (new mathematics in commitment
  theory); it is the MPC-infrastructure route already identified twice in
  this project (`the-provers-knowledge.md`'s collaborative SNARKs; Part 1's
  own committee-MPC boundary) and already correctly scoped as out of this
  spike's reach.
- **Honest conclusion**: Result 6 remains open, and — sharpened by this
  search — the open question is narrower than "does a separating functional
  commitment exist": it is closer to "is there a way to build the
  single-predicate secure-comparison object *without* it collapsing into
  the same trust-anchor-must-be-a-committee shape Result 5 already reached
  by a different route." No evidence found either way; not attempted here,
  per instruction (literature + feasibility only, no construction).

## Summary against the six steps

| step | result |
|---|---|
| 1. masked range proof | **built**, 3,312 constraints; proves for any valid `α`, fails for insufficiency under every `α` tested |
| 2. field-wrap bound | **confirmed with wide margin** (203–210 bits safe `α` entropy for realistic `n`, `ℓ=40`); unlike the prior note's Result 3, this claim holds up |
| 3. partial-collusion defense | **confirmed by direct construction**: system is provably underdetermined without `α` (two valid, inconsistent `(α,Q_H)` pairs for the same observation), contrasted directly against the offset construction's unique, trivial recovery |
| 4. honest trade (Result 3/4) | stated in this document's **first section**, per instruction — mask defeats sellers, offers nothing against a full committee, Result 4's impossibility not evaded |
| 5. literature search | **no separating scheme found**, in general lattice FC literature or its threshold-FE relatives; the closest decentralized variant (MPFE/DMCFE) relocates trust to the beneficiaries, restating rather than resolving the dilemma |
| 6. feasibility verdict | **Result 6 confirmed genuinely open** — not attempted; the honest frontier is narrower than originally framed (see Step 6 above) |

Part 1 and Part 2 are reported separately throughout, per instruction; no
conflation.
