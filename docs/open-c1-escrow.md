# The escrow-leak fix (atomic-sourcing.md Falsification #2) — spike report

*Reads `atomic-sourcing.md` / `sealed-execution.md` (private-theory/). Circuit:
`circuits/wedge_escrow.circom`, `circuits/main_wedge_escrow.circom`. Spike,
not production. Kept in the private repo under the evaluation license, per
instruction.*

## 1–2. The hiding escrow — what was built

The bracket construction (atomic-sourcing.md Result 2) leaks exactly
`log2(V_hi/V_lo)` bits about the buyer's true demand `V` — **provided** the
escrow backing the bracket's upper bound doesn't independently reveal
`V_hi`. A naive escrow of `V_hi · p*` in the clear does exactly that
(Falsification #2). `WedgeEscrow()` replaces it: the buyer publishes only a
**hiding commitment** `C_esc` to the escrowed collateral, and proves in
zero knowledge:

- (a) `V_lo ≤ V ≤ V_hi` — the bracket itself;
- (b) `C_esc` opens to `(collateral, r_esc)` — the commitment is honestly
  formed, not a free-standing claim;
- (c) `collateral ≥ V_hi · p*` — escrow sufficiency, **the check this
  finding requires**, reading `V_hi` off the *same public wire* used in (a);
- (d) `C_bal` opens to `(balance, r_bal)` — a second commitment, to the
  buyer's total controlled balance, assumed already published;
- (e) `balance ≥ collateral` — solvency: the buyer actually controls what
  they claim to have escrowed, not merely a commitment to an arbitrary
  number.

**Commitment scheme, and a deliberate substitution from the prompt's literal
spec:** the prompt described `C = g^collateral · h^r`, a two-generator
Pedersen commitment. I built it as `C = Pedersen(collateral‖r)` using
**circomlib's own audited `Pedersen(n)` hash gadget** instead of hand-
deriving two independent baby-jubjub generators myself. Same commitment
family, same hiding/binding properties (this is the exact pattern Tornado
Cash and others use for note commitments); the difference is generator
provenance — circomlib's generators come from a documented, reproducible
nothing-up-my-sleeve procedure (`pedersen_printbases.js`), whereas manually
picking a second generator for a spike risks an accidental known discrete-
log relationship between `g` and `h`, which would silently break *binding*
(a buyer could then open the same `C_esc` to two different collateral
values). Reusing the audited primitive is the "don't invent new
cryptography for a spike" choice, consistent with how every other privacy
mechanism in this project is built.

**Every comparison uses `LtField`** (`circuits/ltfield.circom`), the
full-field-safe comparator from the circomlib `LessThan` finding — not
circomlib `LessThan(n)`. Verified by direct compile+witness test that the
JS-side commitment computation matches the circuit's bit-for-bit (the
honest witness computes with **zero constraint violations** on the first
try once the bit-packing convention — little-endian bytes, value then `r`,
matching `Num2Bits`'s LSB-first output — was nailed down against
`circomlibjs`'s `PedersenHash`).

## Resolving a tension in the prompt: is `V_hi` public?

Step 1 said "never `V_hi`" as a public output; atomic-sourcing.md's own
mechanism (§3) says sellers "price against `[V_lo, V_hi]`" — which requires
sellers to *see* the bracket. These can't both mean "V_hi is secret." I
resolved it the way atomic-sourcing.md's own text requires: **`V_lo`, `V_hi`,
and `p_star` are public circuit inputs** — that's the bracket being
published, exactly as the mechanism specifies, and it's *not* an escrow
leak. What Step 1's "never `V_hi`" actually protects against, and what this
circuit delivers, is narrower and correct: **the escrow side adds zero
information about `V_hi` beyond what the bracket already, intentionally,
discloses** — nobody can back out `V_hi` (or a *more precise* `V_hi`, or the
collateral amount) from `C_esc`, because `C_esc` is a hiding commitment, not
`V_hi · p*` in the clear. Falsification #2's actual failure mode — the
escrow revealing more than the bracket already reveals — is closed. Full
bracket-bound secrecy (hiding `V_lo`/`V_hi` themselves) is a different,
larger construction, not specified as buildable by Steps 1–3, and not built
here. See §5 for exactly where this matters.

## Step 2's consistency requirement

"The range proof and the escrow-sufficiency proof share `V_hi` as a private
witness" — read literally this conflicts with `V_hi` being public (above).
What actually matters, and what I built: **both sub-checks reference the
*same* `V_hi` wire** (`main.V_hi`, one public input, used directly in both
the bracket's `leHi` check and the sufficiency check's `required <== V_hi *
p_star`). This is a structural guarantee, not a leakage argument: there is
no *second*, private "shadow" `V_hi` a prover could substitute into the
sufficiency check while presenting a different, smaller one to the bracket
check. Adversarial test A7 confirms this the only way it's testable — there
is nothing to decouple.

## 3. Constraint count — comfortable

| build | constraints | wires |
|---|---:|---:|
| `circuits/main_wedge_escrow.circom` | **7,507** | 7,500 |

Breakdown by measurement, not estimate:
- `Pedersen(256)` (one `HidingCommit`'s hash call): **708 constraints**,
  measured in isolation before building the full circuit — far cheaper than
  the ~2.5–3k/call I initially budgeted for; circomlib's windowed
  fixed-base method is efficient. Two calls (`C_esc`, `C_bal`) ≈ 1,416,
  plus `2×Num2Bits(128)` per call (≈512 total) for the value/blinding range
  checks feeding each hash.
- Four `LtField` calls (`geLo`, `leHi`, `suff`, `solv`) at ~1.5k constraints
  each (`2×Num2Bits(254)` + the 254-round MSB-first compare) ≈ 6,000 — **this
  is the actual cost driver**, not the range proof on `V` specifically (that's
  only 2 of the 4 `LtField` calls; the escrow-sufficiency and solvency checks
  cost the same per-call and account for the other half).

No fixed target was given for this spike (unlike Open A1's ~15,000), but
7,507 is in the same practical range as that already-tested circuit —
comfortably phone-provable, not a gate failure by any reasonable bar.

## 4. Adversarial tests — 12/12 PASS

`node scripts/gen_input_wedge_escrow.mjs && node scripts/test_soundness_adversarial_escrow.mjs`

**Layer A (7/7, malicious witness rejected at generation):** honest baseline
accepts; escrow insufficient by exactly 1 unit (`collateral = V_hi·p* − 1`,
honestly committed) rejected; `V` one above `V_hi` rejected; a balance
opening that doesn't match the published `C_bal` rejected; insolvency
(`balance < collateral`, honestly committed) rejected; an escrow opening
that doesn't match the published `C_esc` rejected; shrinking the single
shared `V_hi` wire (the only way to *attempt* the "inconsistent `V_hi`"
attack, since no second `V_hi` wire exists) rejected.

**Layer B (2/2, tamper a satisfying witness's public output):** forcing
`solvent_ok := 0` on an honest witness breaks the R1CS (1 constraint);
nudging `C_esc` by 1 on an honest witness breaks the R1CS (1 constraint) —
the commitment opening is load-bearing at the R1CS level, not just enforced
by the honest generator's convention.

**Layer C (3/3, the actual soundness check):** **nullity 0** — stronger than
Open A1's result. The Jacobian at the honest witness has *no* free
directions at all: every internal and output signal is uniquely pinned to
first order, with zero candidate perturbations to even check against the
full nonlinear R1CS. This circuit has no `IsZero`/`IsEqual` components (no
Merkle-style selector logic), so there's no non-public witness-hint slack
of the kind Open A1 had to classify as benign — there's simply none here.

## Where the LessThan bug class was the live risk

`suff` (`collateral ≥ V_hi · p*`) and `solv` (`balance ≥ collateral`) are
exactly the case the finding warns about: `collateral`, `balance`, and
`required = V_hi · p*` are all values this circuit does not itself bound
below any `2^n` headroom short of the full field — a naive
`LessThan(252)` here would be unsound the moment any of them exceeded
`2^252` (about 11% of uniformly-chosen 254-bit values, per the filing's own
measurement), and a malicious buyer choosing `collateral` adversarially
could force exactly that. Built with `LtField` (full 254-bit MSB-first
compare, sound for all of `[0, p)`) instead, per instruction — this is the
first place in this project's own code where the finding's fix is applied
because the operand class *genuinely* requires it, rather than as a
judgment call to skip it (contrast Open A1's epoch-window check, where the
operands were bounded application timestamps and the cheaper range-checked
`SafeLessThan` was the right tool).

## 5. Leakage check — partial, and precisely where it stops

**What holds:** an observer with all public outputs (`bracket_ok,
solvent_ok, V_lo, V_hi, p_star, C_esc, C_bal`) learns nothing about
`collateral` or `balance` beyond "collateral is enough to cover `V_hi·p*`"
and "balance is enough to cover collateral" — both `C_esc` and `C_bal` are
hiding commitments (binding under circomlib's Pedersen construction; hiding
depends on `r_esc`/`r_bal` carrying real entropy, which the 128-bit width
provides but this spike does not enforce sampling randomness for — that's
an operational requirement on the prover, not a circuit property). Two
buyers under the **same** `(V_lo, V_hi, p_star)` with different collateral,
balance, or blinding factors produce publicly identical outputs except for
`C_esc`/`C_bal`, which are computationally indistinguishable from each
other under the hiding property — confirmed structurally (neither
`collateral` nor `balance` is a circuit output, and Layer C's zero-nullity
result means there's no witness-level path connecting them to a public
signal either).

**What does not hold, stated precisely rather than glossed over:** Step 5
asked that "two buyers with different `V_hi` but the same bracket width
must be indistinguishable." **That is false for this circuit as built**,
and it is false for a structural reason, not a bug: `V_lo` and `V_hi` are
public inputs (§ above — required by atomic-sourcing.md's own mechanism, so
sellers can price against the bracket). Two different brackets of the same
width — e.g. `[800, 1200]` and `[3800, 4200]`, both width 400, both fixtures
built and both producing valid honest witnesses here — are trivially
distinguishable by reading the public `V_lo`/`V_hi` values directly off
either proof. This is not a leak this circuit was supposed to close: hiding
the bracket *bounds* themselves (as opposed to hiding `V` within a published
bracket, and hiding the escrow within a published sufficiency claim, which
is what this spike does) is a different, larger construction — it would
mean committing to `(V_lo, V_hi)` too and proving sufficiency/bracket-
membership against a *hidden* bracket, disclosing only its width to whatever
audience needs to price against it. That's not specified as buildable in
Steps 1–3, and I did not build it. Reporting a false "PASS" on this specific
clause would be exactly the kind of overclaim this project's own standard
(honest severity, no unearned guarantees) exists to prevent.

## Summary against the five steps

| step | result |
|---|---|
| 1. hiding escrow | specified and built: `Pedersen(collateral‖r)` + solvency proof against `Pedersen(balance‖r_bal)` |
| 2. composition with the bracket | built: single shared `V_hi` wire; consistency confirmed by adversarial test A7 |
| 3. constraint count | **7,507** — no fixed target given, comfortably in the already-validated phone-provable range; `LtField`'s four calls (~6,000) dominate, not the Pedersen calls (~1,900) |
| 4. adversarial tests | **PASS** — 12/12 (7 Layer A, 2 Layer B, 3 Layer C — nullity 0, the strongest result in this project's spikes so far) |
| 5. leakage check | **PARTIAL, precisely bounded** — collateral/balance amounts and any excess over the sufficiency floor are hidden; `V_lo`/`V_hi` themselves are public by design (required by the mechanism) and therefore two different-bracket buyers ARE distinguishable — that clause of Step 5 does not hold and is not claimed to |

Open C1'' (minimax premium pricing) and the batch-clearing MPC were not
built, per instruction.
