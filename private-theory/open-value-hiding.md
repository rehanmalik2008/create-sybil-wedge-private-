# Open: statistically-hiding threshold predicate-opening for aggregate sufficiency

*Status: **Open.** Not attempted here — this note states the object
precisely enough to be a research target, per instruction. It does not
sketch or attempt a construction.*

## The exact object

A **statistically-hiding aggregate commitment with threshold predicate-
opening for `≥`**, precisely:

> A commitment scheme for a vector `(q_1,...,q_n)` such that:
>
> 1. **Aggregatable**: the commitments `C_1,...,C_n` combine (publicly, with
>    no secret key) into a single aggregate commitment `C_Σ` to `Σq_i`.
> 2. **Statistically hiding**: `C_Σ` (and each `C_i`) reveals nothing about
>    the committed values beyond what is information-theoretically
>    unavoidable — this must hold **even against a party holding every
>    protocol key and every share** of whatever opening mechanism is used,
>    not merely against a computationally bounded outside observer.
> 3. **Threshold predicate-opening for `≥`**: a `t`-of-`m` committee, each
>    holding a share of some opening/proving key, can jointly produce a
>    non-interactive, publicly verifiable proof that `Σq_i ≥ V` for a public
>    `V` — **without any subset of `t` or fewer shares (and without the
>    reconstructed key itself) being sufficient to recover `Σq_i` or any
>    `q_i`** beyond the single revealed bit.
>
> Equivalently: a threshold predicate-opening capability that is
> **information-theoretically independent of value-recovery capability** —
> reconstructing (or colluding to exercise) the opening key must not, even
> in principle, reveal more than the predicate's output bit.

This is the object [[partial-collusion-collapse]]'s Result 6 originally
asked whether the functional-commitment literature already provides. It
does not (see `docs/functional-commitment-lattice-scoping.md`, Task 1):
every scheme checked there is built for evaluation binding/extractability,
which is close to the *opposite* of statistical hiding, and the one
genuinely hiding variant found (de Castro–Peikert's zero-knowledge
construction) is single-committer, has no threshold structure, and trades
away adversarial-committer binding to get its hiding — it does not answer
the threshold-opening-vs-value-recovery question at all.

## Why Result 4 does not rule this out

Result 4 (proved over the masked-homomorphic-aggregate object built in
[[open-masked-sufficiency]]) is an impossibility theorem **specific to that
object class**: a commitment `C_Σ = Q·G + R·H` that is homomorphic over a
group with a known discrete-log relationship between `G` and `H`, masked by
a scalar `α` that a committee can reconstruct. Its proof works by showing
the *same* key material (`α`, or the committee's shares of it) that lets the
committee produce a valid predicate proof also lets it invert the mask and
recover `Q` exactly — because inversion in that specific algebraic
structure is a single scalar multiplication once `α` is known.

**That argument does not generalize to an arbitrary commitment scheme.** It
relies on three properties specific to the masked-homomorphic-group
construction: (a) the aggregate is a linear combination in a group with
known generators, (b) the mask is a single scalar whose reconstruction is
exactly the event that both enables opening and destroys hiding, and (c)
there is no statistical (only computational, discrete-log-hardness-based)
separation between "knows enough to help open" and "knows enough to
recover the value." An object satisfying the definition above is
constructed differently on purpose: hiding is **statistical**, not
computational-discrete-log-based, so there is no "invert once you know a
scalar" step for the impossibility argument to exploit in the first place.
Result 4's proof technique simply does not apply to a scheme with no
discrete-log structure and no single reconstructible mask scalar governing
both hiding and opening.

This was flagged already, precisely, in the prior note's own Result 3 (the
functional-commitment investigation): *"Result 4's impossibility is
specific to homomorphic aggregates over a group with a discrete-log
structure... The impossibility does not transfer."* This note's contribution
is narrower and more concrete: stating the *exact* object that would need
to exist to take that escape route, rather than leaving it as "some
functional commitment."

## Why this is more tractable than "invent a new primitive"

The individual components already exist, separately:

- **Statistical hiding** for an aggregatable commitment: Pedersen
  commitments are statistically hiding and additively homomorphic
  (`C_Σ = Σ(q_i·G + r_i·H)`) — this project has used exactly this primitive
  in every prior spike (`pedersen_ec.circom`).
- **Range/comparison arguments over a statistically-hiding commitment**:
  Bulletproofs-style range arguments are a standard, well-studied
  construction over Pedersen commitments, giving a `≥`/range proof without
  giving up statistical hiding of the committed value.
- **Threshold MPC for producing a proof jointly**: threshold/multi-party
  computation protocols that let a committee jointly compute a function of
  shared secrets (here, the opening randomness) without reconstructing the
  secret in the clear are a mature area, independent of this project.

**None of these three pieces is the open part.** The open part is the
*composition*: keeping the aggregate's hiding **statistical**, specifically
**through** the threshold MPC step that produces the `≥` proof — i.e.,
proving that no subset of `t` colluding committee members, even pooling
every message they see during the MPC execution (not just their final
output shares), gains more than negligible (ideally zero) statistical
advantage at guessing `Σq_i` beyond the revealed bit. This is a genuine,
nontrivial open question, but it is a **composition question about an
existing MPC protocol run over an existing statistically-hiding
commitment**, not a request for new commitment-theoretic mathematics from
scratch. That is a meaningfully smaller and more tractable target than the
original "does a value-hiding functional commitment exist" framing.

## The likely construction shape (not attempted, stated only to make the target concrete)

A Bulletproofs-style range argument over a Pedersen aggregate, with the
opening randomness `r = Σr_i` (or, per [[open-masked-sufficiency]], a
`t`-of-`m` Shamir-shared blinding factor analogous to `α`, but shared such
that reconstruction is never required) held only in MPC-shared form, such
that the committee can jointly run the Bulletproofs prover algorithm
without any party ever holding — or any `t`-subset ever being able to
reconstruct — the plaintext `Σq_i` or the full opening randomness in the
clear. The crux, restated precisely: **does a secure MPC evaluation of the
Bulletproofs prover circuit leak only computational, or genuinely zero
statistical, information about the witness to a `t`-colluding subset of
participants, when the output is only the boolean transcript (the proof
itself, which the honest protocol already makes zero-knowledge against
outside verifiers)?** This is the same collaborative-proving question
identified in `the-provers-knowledge.md` and revisited in
[[open-masked-sufficiency]]'s Step 4 committee-MPC boundary — now sharpened
to a specific target primitive (Bulletproofs/Pedersen) and a specific
required property (statistical, not computational, hiding through the MPC).

## Falsification

This open primitive would be shown **impossible** — closing Result 6
definitively in the negative — if it could be proved that statistical
hiding against all-key-holders is fundamentally incompatible with any
non-trivial threshold predicate-opening for `≥` (i.e., an impossibility
theorem in the shape of Result 4 but proved for the *general* object class
defined above, not merely the masked-homomorphic-group special case). No
such general impossibility is known to this project as of this note; its
absence is exactly what keeps Result 6 open rather than closed in either
direction.

## Related

- [[partial-collusion-collapse]] — Results 4, 5, 6 (the source theory note)
- [[open-masked-sufficiency]] — the built multiplicative-mask spike (Part 1)
  and the functional-commitment literature verdict (Part 2), which this note
  extends
- `the-provers-knowledge.md` — the original statement of the collaborative-
  proving / MPC-without-reconstruction question this composition question
  reduces to
