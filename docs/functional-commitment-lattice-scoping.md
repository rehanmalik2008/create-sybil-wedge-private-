# Functional-commitment hiding verdict, and scoping the lattice FC as a predicate layer

*Reads `evaluation-binding-not-hiding.md`. Two tasks. Task 1 (literature check,
Falsification #1) is reported first — it determines whether the frontier is
open or already closed by an existing scheme. Task 2 (scoping the transparent-
setup lattice FC as a drop-in predicate layer) follows. No construction was
attempted for either; this is verification and feasibility scoping only, per
instruction.*

## Task 1 — Falsification #1: is any scheme *both* evaluation-binding and statistically hiding for a `≥` predicate?

Read the actual definitions in both target papers, not the abstracts.

### de Castro–Peikert, "Functional Commitments for All Functions, with Transparent Setup and from SIS" (eprint 2022/1368)

- **Definition 2.2** (the formal syntax) defines `Setup/Commit/Open/Verify` and
  states only a **correctness** property and a **conciseness** requirement.
  No hiding property appears in the formal definition.
- **Definition 2.3** defines the one security property this paper cares
  about: **(selective) evaluation binding** — infeasibility of proving two
  different values for the same input against a single commitment. Remark 2.4
  defines a weaker **target evaluation binding** (binding only holds if the
  commitment was honestly generated). Remark 2.5 defines **adaptive**
  binding. That is the *complete* list of security properties formally
  defined for the base construction — no hiding definition exists for it.
- **The paper says so explicitly**, in its own words (page 2): *"In this work
  we will not focus on other security properties like function hiding or
  zero-knowledge for proofs, since they are often not needed in applications,
  and when they are needed, they can usually be added using standard
  techniques."* Hiding is stated as out of scope for the main construction.
- **However — and this is the finding that needed the closest check** —
  Section 3.2.6 gives exactly the "standard technique" alluded to above: a
  **zero-knowledge variant**, built with the "context hiding" technique of
  [GVW15b], for Boolean functions `f:{0,1}^k→{0,1}`. It is explicitly
  described as having **(statistical) zero-knowledge commitments and
  proofs** — "Function hiding ensures that `C_f` reveals nothing about `f`
  ... Gaussian preimage sampling ensures that proofs reveal nothing beyond
  the input-output pairs." This is a genuine, correctly-cited statistically-hiding
  construction, for a function family general enough to include a `≥`
  predicate (bounded-depth Boolean circuits, which a comparator circuit is).
- **The catch, stated by the authors themselves in the same paragraph**: this
  ZK variant achieves only **target evaluation binding, not full evaluation
  binding** — i.e., binding holds only if the commitment itself was honestly
  generated; it is explicitly *not* secure against a malicious committer who
  submits a malformed commitment and only later tries to open it two
  inconsistent ways. The paper is direct about the trade: *"a weaker
  notion... requires the commitment to be generated honestly."*
- **Extractability**: not discussed anywhere in this paper for either
  variant. The security property offered is binding/target-binding, not an
  extraction guarantee.

**Verdict for this scheme: not the Result 6 object.** It achieves
statistical hiding and supports a general (hence `≥`-capable) predicate, but
only by giving up full evaluation binding — precisely because it drops to
the "committer already behaved honestly" security model. That is the wrong
trade for this project's setting: a coalition or committee is exactly the
party that would maliciously commit and then try to prove a fabricated
predicate result, and target binding provides no protection against that.
It does not evade Result 4 because it never actually holds both properties
simultaneously against an adversarial party — it trades one for the other in
the same way this project's own multiplicative-mask construction trades
seller-hardness for committee-hardness, just along a different axis
(binding vs. hiding rather than sellers vs. committee).

Separately, and just as important for Result 6 specifically: this ZK
variant is a **single-committer, non-threshold** scheme. There is no
multi-party predicate-opening-key structure in it at all — every property is
about one committer proving to one verifier. So even setting the binding
trade-off aside, it says nothing about whether a *threshold* set of
key-holders could jointly derive a predicate-opening capability without
learning the value. It answers a different question than Result 6 asks.

### Wee–Wu, "Lattice-Based Functional Commitments: Fast Verification and Cryptanalysis" (this is Wee's and Wu's own paper — Construction 3.2/3.9/3.19, plus Construction B.1's adaptation of [WW23])

*Correction to the prior spike's literature note: this paper is authored by
Hoeteck Wee and David J. Wu themselves — it is not the Balbás–Catalano–
Fiore–Lai paper. The prior spike's citation of "Balbás-Catalano-Fiore-Lai,
eprint 2024/028" for this title was a misattribution; the content checked
here is the correct target the theory note calls "Wu's ℓ-succinct-SIS
schemes."*

- **Definition 2.1** (Succinct Functional Commitment, adapted from [WW23,
  Definition 4.1]) formally defines exactly four properties: **Correctness**,
  **Succinctness**, **(computational) Binding**, and (Definition 2.2/Remark
  2.3) **preprocessing/fast verification**. Binding's exact statement:
  `Pr[Verify(crs,σ,f,y0,π0)=1 = Verify(crs,σ,f,y1,π1)] = negl(λ)` for
  `y0≠y1`, over `crs←Setup(1^λ)` and adversarially chosen everything else.
- **Definition 4.1** additionally and separately defines **Extractability**:
  for every efficient adversary outputting `(σ, {(f_i,y_i,π_i)})`, there
  exists an efficient extractor outputting `x` such that no accepted opening
  contradicts `f_i(x)=y_i`.
- **The word "hiding" does not appear anywhere in this paper.** Not as a
  defined property, not as a remark, not as a stated non-goal. Hiding is
  simply never discussed for this construction — it is not that hiding is
  explicitly disclaimed (as in dCP23), it is that the paper's entire security
  focus is at the opposite pole: it spends Section 4 constructing **heuristic
  attacks that break extractability** for its own Construction 3.2, and for
  an integer-adapted version of [ACL+22]'s linear scheme — showing these
  schemes' openings can be **obliviously sampled without knowledge of any
  input `x`**, which is a cryptanalytic result about the *absence* of a
  strong knowledge property, not a hiding result. As the paper states
  explicitly (Section 4, opening paragraph): *"We stress that our oblivious
  sampling attacks only apply to the extractability of lattice-based
  functional commitments. All of the aforementioned schemes still plausibly
  satisfy the standard notion of binding security."*

**Verdict for this scheme family: confirms Result 1 with no qualification
needed.** These are binding-only (and, per the paper's own cryptanalysis,
*not* safely upgradable to extractable) constructions. No hiding property is
defined, claimed, or discussed. This is the polar opposite of what Result 6
needs, exactly as the theory note expected.

### Falsification #1 — final answer

**Result 1 does not fail.** No scheme found is *both* evaluation-binding
(in the full, adversarial-committer sense) *and* statistically hiding for a
`≥` predicate. The one construction that gets closest — dCP23's
zero-knowledge variant — is genuinely statistically hiding and could encode
a `≥` predicate, but purchases that hiding by weakening to target binding,
and is a single-committer scheme with no threshold structure at all. It is
not the Result 6 object, and it does not need to be reclassified as one.
The theory note's expected answer holds, checked against the actual
theorems rather than assumed from the abstracts.

---

## Task 2 — scoping the transparent-setup lattice FC as the sufficiency-predicate layer

*Scoping only — no circuit was built. This assesses whether replacing the
current EC-Pedersen + LtField predicate machinery
(`wedge_aggregate_sufficiency.circom`, 3,143 constraints) with dCP23's
transparent-setup lattice functional commitment is worth pursuing, to close
Gate 5 (trusted setup) and the PQ disclosure simultaneously.*

### (a) Does it support the `≥`/range predicate needed for sufficiency?

**Yes, structurally.** dCP23's construction (Construction 3.5, `Setup / Commit
/ Open / Verify`) is a functional commitment for **any function computable
by a bounded-depth Boolean circuit** (`F^k_circuit`, Definition 3.1). A
sufficiency check `Σq_i ≥ V` is exactly such a circuit: an adder over `N`
sellers' `QBITS`-bit values, followed by a magnitude comparator. Either the
"vector commitment" instantiation (Section 4.1.2 — commit to the vector
`(q_1,...,q_N)` by position) or the general dual functional-commitment
route (Section 4.3 — commit to input data, open at a circuit) covers this
case; there is no missing primitive here, unlike Task 1's finding for
hiding.

### (b) Estimated proof size and verification cost vs. the current EC construction — **not competitive**

This is where the scoping breaks down. dCP23's own complexity analysis
(Section 3.2.1, and Theorem 3.3 item 2) gives the norm bound for a
depth-`D` Boolean circuit as **`‖S_{f,x}‖₁ ≤ O(w)^D`**, where `w = nℓ =
n⌈log₂q⌉`. This bound is **exponential in circuit depth** — it is the same
"noise growth per level" phenomenon as leveled (non-bootstrapped) GSW-style
fully homomorphic encryption, because that is literally the machinery this
functional commitment is built from (Section 3.1, explicitly derived from
[GSW13, GVW15b]). An adder-plus-comparator circuit for `N` sellers at
`QBITS=64` has a depth of several tens of levels for any practical circuit
construction (ripple-carry: `O(N·QBITS)`; carry-lookahead: `O(log(N·QBITS))`
but with larger per-level constants) — either way, `D` is not small enough
for `O(w)^D` to stay reasonable, since `w` itself is already in the
thousands once `n` and `log q` are set for 128-bit security.

Concretely, the paper's own uncompressed proof-size formula is
**`|π| ≈ W·W'·log₂κ` bits**, and `κ` **is** the norm bound above — so proof
size inherits the exponential-in-depth blowup directly. There is no SNARK
wrapping this scheme down to constant size; the "proof" the verifier checks
*is* the raw short-integer-solution witness `S_{f,x}`, sized in proportion
to the circuit's homomorphic evaluation cost. This is a fundamentally
different cost profile from the current pipeline, which wraps a
3,143–3,312-constraint R1CS circuit in a SNARK (Groth16-style) to get a
constant-size (~200-byte) proof regardless of circuit depth.

The favorable numbers in dCP23's Table 1 (proof size `log D·log²S` for a
*vector commitment* with `S` updates) do **not** apply here — that bound is
for committing to and opening raw vector *positions*, with no predicate
circuit evaluated over them. The moment a real comparison/sum circuit of
nontrivial depth is added (which sufficiency requires), the applicable cost
model is the general `F_circuit` one with the `O(w)^D` norm bound, not the
specialized vector-commitment case.

**Conclusion for (b): the migration is very unlikely to be size- or
verification-cost-competitive with the current EC+SNARK pipeline** for a
circuit with the depth a real adder+comparator requires, unless dCP23's
scheme were itself wrapped in a further succinct argument layer — which the
paper does not provide and which would need to be built separately.

### (c) Is the lattice aggregate linearly strippable? — **likely yes, for the natural instantiation; this is a real risk, not confirmed by a build**

This is the question Falsification #2 asks, and it deserves a careful,
honest answer rather than an optimistic one.

The natural way to build `Σq_i` in this scheme is via the **linear
homomorphism** (Section 3.1.2): given per-seller commitments (or a single
vector commitment to `(q_1,...,q_N)`), the sum is computed by the
homomorphic addition operation `C_+ := C·S_+`, which satisfies
`(C − [X_1|X_2]⊗g^t)·S_+ = C_+ − (X_1+X_2)⊗g^t`. **This operation is
ordinary matrix/vector subtraction — it requires no lattice hardness
assumption to invert.** It is algebraically the same shape as the additive
Pedersen aggregate `C_Σ = Σ(q_i·G + r_i·H)` that made the offset
construction's "subtract your own contribution" attack trivial in the prior
spike: if a coalition knows its own opening data for its own positions (its
`q_i`, and the corresponding short matrices/openings the scheme reveals for
those positions), it can subtract its own known linear contribution from
the sum's opening using the *same* linear-algebra move, and this move does
not require breaking SIS or any lattice problem — it's linear algebra over
`Z_q`, available to anyone who can do arithmetic.

This is a **different and more elementary attack than the one Result 4 (and
Result 3 of the prior note) analyzed**. Result 3's conclusion — "the
reconstruct-randomness-then-invert discrete-log attack has no lattice
analogue" — is correct as far as it goes, but it addresses a
*discrete-log-style* recovery, not a *linear-subtraction* recovery. The
linear-subtraction move does not care whether the underlying hard problem is
discrete log or SIS; it only cares whether the aggregation step is linear
and whether the coalition knows its own linear contribution. Both hold here.

**This was not verified by constructing and testing a witness (per
instruction — scoping only), so it should be treated as a structural
red flag requiring confirmation before committing to the migration, not as
a proven fact.** But the algebraic argument is direct enough that the
burden of proof should be on the migration, not the other way around: **do
not assume "lattice-based" implies immunity to the seller-collusion
stripping attack.** If the migration proceeds, the sum must be built either
(i) without exposing separable per-seller linear openings at all (a single
monolithic circuit proof over the whole vector, never revealing intermediate
per-position linear structure), or (ii) with a masking layer analogous to
this project's own multiplicative-mask construction (Part 1 of the prior
note), re-derived and re-tested in the lattice setting — which is
additional, non-trivial work this scoping pass does not cover.

### (d) Prover cost on target hardware — **heavier by a large, currently unquantified margin**

Because this is a **leveled** (non-bootstrapped) scheme — there is no noise
refresh, so parameters must accommodate the *full* circuit depth `D` up
front, exactly like leveled FHE — the modulus `q` must grow to absorb the
`O(w)^D` norm bound, which in turn inflates `ℓ=⌈log₂q⌉` and hence `w=nℓ`,
in a feedback loop. For any circuit deep enough to add and compare
realistic seller counts at `QBITS=64`, this pushes `q` (and therefore the
size of every matrix entry, and the cost of every modular multiplication in
the homomorphic evaluation) far beyond what the current EC construction
needs. Concretely: the current circuit's field arithmetic works over
BN254's ~254-bit prime with small, fixed-size R1CS constraints (3,143–3,312
of them, proved via a constant-size SNARK); the lattice route's prover does
`O(w)`-to-`O(w²)`-scale matrix arithmetic over a modulus that could run to
many hundreds or thousands of bits once the leveled-parameter blowup from
(b) is accounted for. This is very likely **multiple orders of magnitude**
heavier in raw prover work, and — absent a wrapping SNARK — produces a
proof that must itself be transmitted and checked at that size, rather than
compressed to a constant. **This was not benchmarked on the target
hardware** (per instruction, scoping only); an actual parameter selection
and microbenchmark would be needed before any commitment, but the
qualitative direction (heavier, likely by a lot) is clear from the
complexity bounds above.

### Task 2 — feasibility verdict, for the user's go/no-go

| question | verdict |
|---|---|
| (a) supports `≥`/range predicate | Yes, structurally — no missing primitive |
| (b) proof size / verification cost vs. current EC circuit | Very likely **not competitive** — `O(w)^D` norm blowup for any circuit with real depth, no SNARK wrapping to flatten it |
| (c) lattice aggregate linearly strippable | **Likely yes** for the natural (linear-homomorphism) instantiation — same elementary attack as the offset construction, not blocked by lattice hardness. **Not confirmed by a build; flagged as a real risk requiring further work before migrating.** |
| (d) prover cost on target hardware | **Heavier, likely by a large margin** — leveled-scheme parameter blowup compounds with (b); not benchmarked |

**This scoping pass leans against a wholesale predicate-layer migration** as
currently understood: (b) and (d) look expensive, and (c) surfaces a
collusion-stripping risk that would need its own mitigation (and its own
adversarial testing) before the "closes Gate 5 and PQ simultaneously" framing
can be taken at face value. The go/no-go is the user's call, per instruction
— this is feasibility and cost, not a recommendation to build or not build.

---

## Summary against the instructed reporting order

**Task 1, per-scheme, first:** de Castro–Peikert's transparent-setup
construction is not statistically hiding for a `≥` predicate in its
adversarial-binding form — its ZK variant achieves hiding only by weakening
to target (honest-commitment) binding, and has no threshold structure at
all. Wee–Wu's ℓ-succinct-SIS schemes define no hiding property whatsoever
and are focused entirely on (and actively cryptanalyze) binding/
extractability. **Result 1 stands; the frontier remains open, not closed.**

**Task 2:** the transparent-setup lattice FC supports the needed predicate
in principle, but scoping surfaces two serious costs (proof/verification
size, prover cost) and one serious risk (likely linear strippability of the
natural sum construction) that were not part of the original "closes two
gates at once" framing. Reported for go/no-go, not decided here.
