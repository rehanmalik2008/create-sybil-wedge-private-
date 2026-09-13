# Value-hiding frontier: Conjecture, not Theorem — two corrections needed, one open verification

*Supersedes this file's prior version. That version found the
malicious-commitment gap in de Castro–Peikert's ZK variant (honest-
commitment-only hiding/binding) and reported the frontier open.
`well-formedness-compiler.md` proposes closing exactly that gap: attach a
committer-produced ZK well-formedness proof `Π_wf` to the commitment, so
every accepted commitment is provably honest. This document verifies that
proposal against the actual mechanism, not just its shape. Verdict:
**Conjecture (pending two corrections and one unverified composition
claim), not Theorem** — the construction is real progress and likely closes
the frontier, but not exactly as `well-formedness-compiler.md` states it.*

## Task 1 (decisive) — the quantifier is distributional, not existential

`well-formedness-compiler.md` proposes `Π_wf` prove `∃(x,r): σ =
Commit(x;r)` — a bare existential relation proof — and its Result 1 treats
this as sufficient for hiding. **It is not, and the reason is specific to
how this scheme's hiding actually works.**

The paper gives no formal, numbered theorem for the ZK variant's hiding —
§3.2.6 is an informal sketch, as found in the prior check. But the
mechanism it names is unambiguous about which kind of statement is needed.
From §3.1.1, describing exactly the technique §3.2.6 invokes:

> *"the decomposition operation `g⁻¹` can be randomized as in [MP12, AP14].
> This can be used for (statistically) function-hiding homomorphic
> computation, using ideas from [BPMW16], but simplified in our setting
> because only SIS (not LWE) instances need to be re-randomized. Function
> hiding is used only in the zero-knowledge variant of our functional
> commitment construction (see Section 3.2.6)."*

[BPMW16] ("FHE circuit privacy almost for free") is a **noise-flooding /
smudging** technique. Its hiding guarantee is a claim about the *process*
that produced `σ` — that the re-randomization noise injected during
evaluation was drawn from a sufficiently wide distribution, so the output's
distribution becomes statistically close to one depending only on the
final value. It is not a claim about `σ`'s bare membership in a relation.

**This makes the proposed existential `Π_wf` close to vacuous, not merely
insufficient.** The underlying commitment relation is essentially always
satisfiable for *some* `(x,r)` — that is what ordinary correctness
guarantees. A malicious committer can trivially produce a `σ` that
satisfies `∃(x,r): σ = Commit(x;r)` while using **degenerate
re-randomization** (minimal, structured, or non-random decomposition
noise): this `σ` is a perfectly valid opening in the relation sense, passes
any existential well-formedness check, and leaks far more about the
committed value than an honestly-smudged commitment would, because the
noise-flooding that actually provides hiding was never applied.

**Correction required:** `Π_wf` must certify a **norm/width bound on the
randomness `r`** used in the decomposition — knowledge of an opening whose
re-randomization noise falls within (or is statistically close to) the
honest smudging distribution's support, not merely knowledge of *some*
opening. This is a materially heavier statement — a lattice ZK proof of
knowledge of a *bounded-norm* opening, not a bare relation proof — but it
is achievable: bounded-norm lattice ZK arguments are a standard (if not
small) primitive (Lyubashevsky-style range techniques; [LNP22]; [BLS19]).

**Verdict: distributional. The frontier still plausibly closes, but only
with a heavier, norm-bounded `Π_wf` — the construction as literally stated
in `well-formedness-compiler.md`'s Result 1 is under-specified and would
not actually deliver the claimed hiding.**

## Task 2 — aggregate well-formedness: likely composes, unverified against the cited paper directly

The homomorphic addition operator (`C₊ := C·S₊`) is a *fixed*, non-random
linear map — a deterministic post-processing of the per-seller randomized
outputs. Sums of independent smudging noise only get *wider* (a standard
composition fact throughout the FHE/lattice literature), so per-seller
norm-bounded well-formedness plausibly implies the aggregate inherits at
least as much effective smudging as any individual contribution, with no
joint MPC-based well-formedness proof needed — **provided each per-seller
`Π_wf,i` is the corrected, norm-bounded version from Task 1**, not the bare
existential `well-formedness-compiler.md` proposed.

**This is reported at moderate, not full, confidence.** [BPMW16] itself was
not fetched or read directly in this check — the composability argument
above is a structural inference from the citation and from standard
lattice/FHE composition facts, not a line-by-line verification of that
paper's exact hypotheses. If BPMW16's specific smudging construction has an
interaction effect under linear combination that a naive "noise only gets
wider" argument misses, this could fail. **Recommend reading [BPMW16]
directly before relying on this composition.**

## Task 3 — assumption independence: **not independent by default**

This is the sharpest new finding, and it's a real problem the note did not
anticipate as a live possibility.

The de Castro–Peikert scheme's binding reduces to SIS over its own public
matrices. The natural, default way to instantiate `Π_wf` — a lattice ZK
proof of knowledge tailored to this same relation, over the same ring and
modulus, which is the obvious engineering choice — would typically have its
soundness reduce to the **same or a directly related SIS instance and
parameters**, because that is the native hardness assumption available in
this setting and nothing in the construction as described forces a
different one.

If both properties reduce to the same underlying SIS instance, breaking
that one instance defeats **both** binding and well-formedness-soundness
simultaneously. `well-formedness-compiler.md`'s Result 4 states *"Two
computational assumptions now, not one; state both"* — but if they are the
same assumption, the honest statement is not "two independent assumptions"
but **"one assumption, used twice."** This is a strictly more fragile
security posture: a single SIS break cascades to defeat both properties at
once, rather than requiring two independent breaks.

**Achieving genuine independence requires a deliberate, non-default design
choice** not specified anywhere in `well-formedness-compiler.md` — e.g.,
instantiating `Π_wf` via a hash-based Fiat-Shamir argument (soundness from
collision-resistance of a hash function, a different assumption family
entirely) or a lattice parameter regime genuinely decoupled from the
commitment scheme's own. Without that explicit choice, treat the
construction as resting on **one assumption**, not two.

## Task 4 — the result, honestly labeled

**Label: Conjecture (pending: (i) `Π_wf` corrected to a norm-bounded proof
per Task 1; (ii) direct verification of [BPMW16]'s exact composability
hypotheses per Task 2; (iii) an explicit, independent hardness-basis choice
for `Π_wf` per Task 3, absent which the construction rests on one
assumption, not two).** Not a Theorem as `well-formedness-compiler.md`
states it — the proposed `Π_wf` (bare existential) does not deliver the
claimed hiding, and the "two independent assumptions" framing is not
justified by default.

### The corrected statement, as far as this check can support it

*There plausibly exists a protocol proving `Σqᵢ ≥ V` to a verifier as a
single bit, such that:*

- *(a) statistical hiding against every coalition, including a full
  committee and including maliciously-formed commitments — via honest-
  hiding lattice FC + a **norm-bounded** ZK well-formedness proof (not the
  bare existential originally proposed), each produced by its own committer
  from their own witness, before any MPC runs;*
- *(b) computational binding against a bounded committer — the favorable-
  direction tradeoff, unchanged from the prior note;*
- *(c) transparent setup and post-quantum security (lattice FC);*
- *(d) but resting on what is most honestly described as **one**
  computational assumption used for two purposes (binding and `Π_wf`
  soundness), unless a deliberately independent hardness basis is chosen
  for `Π_wf` — which has not been specified.*

**Result 4 (of `closing-value-hiding.md`, the original masked-homomorphic-
group impossibility) still does not apply, and for the same reason as
before**: that impossibility is specific to computationally-hiding
aggregates over a group with a known discrete-log relationship between
generators, where a single reconstructible scalar both enables opening and
destroys hiding. Nothing here changes that structural non-applicability —
the corrections and open items found in this check are about whether the
*proposed replacement* construction actually holds, not about whether the
*original* impossibility somehow reaches it after all. It does not.

## Task 5 — `Π_wf` proof size, order of magnitude

Not a build — order-of-magnitude from the literature, per instruction.

Lattice ZK proofs of knowledge for SIS-style relations, including
bounded-norm range components (the corrected `Π_wf` from Task 1 needs
exactly this: a relation proof *plus* a norm bound on the randomness),
typically fall in the **tens of KB to low hundreds of KB** range at
128-bit security for witness/lattice dimensions in the hundreds to low
thousands (representative recent constructions: [LNP22] "Lattice-based
zero-knowledge proofs and applications: Shorter, simpler, and more
general"; [BLS19] "Algebraic techniques for short(er) exact lattice-based
zero-knowledge proofs" — both already cited in this project's own
literature review).

The relevant witness dimension here is `w = nℓ = n⌈log₂q⌉` from de
Castro–Peikert's own complexity analysis (Construction 3.5's parameter
sizing). Per this project's own prior scoping
(`docs/functional-commitment-lattice-scoping.md`, Task 2), `w` is already
pushed toward the **thousands** once parameters absorb the leveled-scheme
depth-dependent modulus growth needed for a real adder+comparator circuit.
A bounded-norm relation proof at that witness scale sits toward the
**higher end** of what the cited literature reports — plausibly reaching
into the **low-MB range per proof**, not merely tens of KB, once both the
norm-bound component and the leveled-parameter blowup are accounted for
together.

This is **per seller** (each seller produces their own `Π_wf,i`), stacked
on top of the already non-succinct predicate-opening proof size flagged in
the prior scoping document. The honest framing: **existent and buildable,
not impractically infeasible** — proofs of this size are used in real
deployed post-quantum systems — but **heavy, likely in the hundreds-of-KB
to low-MB range per seller**, and not remotely comparable to the current
EC+SNARK pipeline's constant ~200-byte proof. This is a cost to state
plainly if the construction is pursued, not a reason to abandon it.

## Where this leaves the frontier

This is real progress over the prior version of this document. The
malicious-commitment gap has a genuine, standard-shaped fix (committer-
produced well-formedness proof, checked and found structurally sound in
*where* it slots into the composition — Results 2 and 3 of
`well-formedness-compiler.md` hold up under this check). What does not
survive as literally stated is the specific `Π_wf` construction (needs to
be norm-bounded, not existential) and the assumption-count claim (likely
one assumption, not two, absent a deliberate independent choice). Neither
of these is fatal — both have known fixes — but neither is free, and the
construction should be labeled and reported as a conjecture pending those
fixes and the one unverified composition claim (Task 2), not asserted as a
closed theorem.

## Related

- `closing-value-hiding.md` — the theory note whose Result 3 this and the
  prior version of this document check
- `well-formedness-compiler.md` — the compiler proposal this document
  verifies; Results 2–3 hold up, Result 1 needs the norm-bound correction,
  Result 4's "two assumptions" needs the independence correction
- [[open-value-hiding]] — the original precise open-primitive statement,
  narrowed but not yet closed by this line of work
- [[open-masked-sufficiency]] — Result 5's committee-as-trust-anchor
  rationale and Result 4's original discrete-log-specific impossibility,
  confirmed still non-applicable here
