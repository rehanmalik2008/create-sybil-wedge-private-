# Value-hiding frontier: still open — the honest-commitment precondition breaks Result 3

*Reads `closing-value-hiding.md`. Two verification checks against the actual
de Castro–Peikert theorem text (eprint 2022/1368, §3.2.6), not a new
construction. **Task 1 is decisive and fails.** The frontier does not close.*

## Task 1 (the load-bearing check) — hiding is honest-commitment-only

**Exact finding.** The paper gives **no formal, quantified hiding theorem**
for the zero-knowledge variant at all — §3.2.6 is explicitly an informal
sketch ("we describe this modification and briefly sketch the proofs"), not
a numbered `Theorem`/`Lemma`. What it does state, precisely:

> *"the modified scheme has zero-knowledge commitments and proofs: function
> hiding ensures that `C_f` reveals nothing about `f` (formally, a simulator
> can return a random 'dummy' commitment `C_f` instead)... The scheme
> satisfies **target evaluation binding** (see Remark 2.4) under a suitable
> SIS assumption."*

The decisive quantifier is in **Remark 2.4's formal game**, which this
section invokes by name for its binding property:

> *"After Step 2, the adversary outputs a target function `f*`, and **the
> challenger generates a commitment `c* ← Commit(pp, f*)`**, which it gives
> (along with the random coins, if any) to the adversary."*

**The challenger, not the adversary, produces the commitment.** The
target-binding game never gives the adversary the ability to submit its own
commitment at all — its only move is to attack the *opening*, against a
commitment the game itself guarantees was run through honest `Commit` with
genuine randomness. The informal hiding sketch is built on the identical
precondition: it describes what an honestly-run `Commit` outputs (and what
a simulator can substitute for that honest output), and says nothing about
any object that did not come from an honest run.

**Conclusion: hiding, exactly like binding here, is honest-commitment-only.**
There is no claim anywhere in the paper — formal or informal — covering the
hiding or binding of a maliciously/adversarially-formed commitment. This is
precisely the weaker case `closing-value-hiding.md`'s own Falsification #1
named as decisive, and it is the case that obtains.

## Why this breaks Result 3, concretely

Result 5 of the theory arc (from [[open-masked-sufficiency]]) already
established the load-bearing trust assumption for this whole line of
constructions: **sellers are the untrusted party** — they are the
beneficiaries of the trade and cannot be assumed to behave honestly, which
is exactly why the committee (not the sellers) was chosen as the anchor for
hiding. The aggregate commitment to `Σqᵢ` is built by combining each
seller's own submitted per-seller commitment `Cᵢ`.

If a colluding subset of sellers is willing to deviate from the protocol —
the threat model this whole arc is built to survive — nothing stops them
from submitting an **adversarially-crafted `Cᵢ`** rather than one produced
by honestly running `Commit` with genuine random coins. There is nothing
exotic required to do this: the paper's *own* zero-knowledge simulator
achieves its result by embedding a trapdoor into `C` and substituting a
"dummy" commitment for the honest one — a real colluding party controlling
part of the input has exactly the same capability, and can use it
maliciously instead of for simulation.

Once the aggregate is built from at least one such component, it is no
longer the honestly-generated object the ZK/target-binding argument
requires, and the construction provides **zero guarantee** for it — neither
that it is bound to any particular value, nor that it hides one. A
colluding subset of sellers can therefore attack the aggregate's hiding
directly through this gap, which is structurally the same shape of attack
Result 4 (the original masked-homomorphic-aggregate impossibility) was
built to characterize, just entering through the commitment-formation step
instead of through mask-key reconstruction.

**Result 3 (`closing-value-hiding.md`) fails.** The frontier does not close
here: a statistically-hiding predicate-opening scheme whose hiding and
binding guarantees are conditioned on honest commitment generation cannot
defend against the untrusted party (sellers) this whole arc exists to
defend against, regardless of how the threshold-MPC composition around it
is built.

## Task 2, for the record (moot given Task 1, but checked)

Structurally, the compositional half would have worked: defining the whole
`Σqᵢ ≥ V` computation as a single Boolean circuit (adder composed with
comparator) and committing/opening only at that one composed function —
using the scheme's own composability (Remark 3.4: `Eval` can be chained
without revealing intermediate outputs) rather than opening an intermediate
sum and comparing it separately — does yield an interface where only the
boolean `y = h(x) ∈ {0,1}` is ever revealed, never the sum itself. This
distinction (proving `f(x)=y` for a revealed `y`, where `y` is itself just
the comparison bit, versus separately revealing a sum and then comparing
it) is real and the construction supports the safe version of it. This
does not rescue Result 3, however, since it inherits the identical
honest-commitment precondition Task 1 found decisive: the composed-circuit
opening's hiding argument is built on the same honestly-run `Commit`
assumption.

## Task 4 — not reached

Task 4 (scoping the MPC + lattice-FC composition as a systems project) is
explicitly conditioned on Result 5 holding. It does not, so there is
nothing to scope: building threshold-MPC infrastructure around a primitive
whose hiding guarantee already fails against the exact adversary
(colluding sellers) this arc is designed to survive would not close
anything. That scoping is deferred until — and unless — a version of this
primitive with an honest-commitment-independent (adversarial-commitment)
hiding and binding guarantee is found or built.

## Where this leaves the frontier

The open primitive is exactly as it was stated in [[open-value-hiding]],
**unrevised**: a statistically-hiding aggregate commitment with threshold
predicate-opening for `≥`, hiding statistical against every key-holder —
now sharpened by this check to make explicit a requirement that was
implicit before: the scheme's hiding and binding must hold **for
adversarially-formed commitments, not only honestly-generated ones**,
because the party contributing components to the aggregate (sellers) is
exactly the untrusted party in this arc's own threat model. The
de Castro–Peikert ZK variant is not this object — it is a genuinely useful
building block (statistical hiding, `≥`-capable, transparent setup, PQ) but
it answers a single-honest-committer question, and this arc needs an
answer to a many-untrusted-contributor question. That gap was not visible
until the exact quantifier in Remark 2.4's game was checked against the
actual threat model, which is precisely why this was worth verifying
line-by-line rather than reasoning about it from the abstract.

**No general impossibility is known either.** This is not a closed-negative
result — it is the same honestly-stated open problem as
[[open-value-hiding]], now with one previously-unstated requirement made
explicit: the primitive needed must be hiding/binding against
adversarially-contributed components, not merely against a curious
verifier of an honestly-run commitment.

## Related

- `closing-value-hiding.md` — the theory note this document verifies against
  (Results 1–5 and Falsifications 1–4)
- [[open-value-hiding]] — the precise open-primitive statement this
  document sharpens, not replaces
- [[open-masked-sufficiency]] — Result 5's committee-as-trust-anchor
  rationale, whose seller-untrusted framing is what makes Task 1's finding
  decisive rather than academic
