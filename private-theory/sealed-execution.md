# Sealed Execution

### Solving Open C1 — large-order protection via frequent batch auctions, and the exact limit of what cryptography can buy

---

## 1. The problem, stated so it can be solved

A large buyer wants to acquire `V` units at price `≤ p*` without the market learning `V` until the trade is irreversible. The world fails at this because continuous order books reveal demand incrementally: every partial fill signals a large buyer's presence, front-runners react, and the buyer pays more than the pre-order price.

The naive hope — "hide the order with zero-knowledge" — was already shown impossible in the three-payment-frontiers analysis: **market impact leaks through effect, not through the channel.** An order of size `V` against depth `D` moves the price by ~`V/D` no matter how the order is cryptographically concealed, because the price responds to liquidity consumed. So the target cannot be "hide `V` forever." It must be "hide `V` until the moment it no longer matters."

That reframing is the whole solution, and it is the observability-lag theorem applied to market structure.

---

## 2. Why continuous markets cannot solve this, structurally

**Proposition.** *In a continuous market, any execution of `V` that consumes liquidity incrementally reveals `V` incrementally, and no cryptographic layer prevents this.*

Continuous execution is a sequence of fills at successive price levels. Each fill is a public state change (liquidity removed at a level). An observer integrates these into an estimate of remaining demand. The information leaks through the *sequence*, and the sequence is intrinsic to continuous execution — you cannot fill a large order continuously without walking the book, and walking the book is the signal.

> **Result 1.** *Continuous execution and large-order privacy are incompatible, independent of cryptography. The leak is in the temporal structure of filling, not in any message. Therefore the solution must change the market structure, not add a privacy layer to the existing one.*

This is the same conclusion the auction analysis reached: the winner must be announced to allocate the good, so continuous allocation reveals the allocation.

---

## 3. The construction: frequent batch auctions with sealed commitment

The fix is to remove continuity. Instead of a continuous book, clear the market at **discrete intervals** — a frequent batch auction (FBA). Within each interval, orders are sealed; at the interval boundary, all orders clear together at a single uniform price.

**The mechanism:**

1. **Commit.** The buyer submits a hiding commitment to `(V, p*)` — a Pedersen commitment `C = g^V h^{r}` plus a committed limit price — with escrow proving ability to pay `V · p*`. The commitment reveals nothing about `V`.
2. **Batch.** All commitments in the interval accumulate. No partial information is released during the interval — no fills, no book updates, nothing.
3. **Clear.** At the boundary, an MPC computes the uniform clearing price from all committed orders and outputs *only each participant's fill*, not the order book. The buyer's `V` is revealed only through its contribution to the aggregate, mixed with every other order in the batch.
4. **Atomicity.** The order fills fully at `≤ p*` or not at all — there is no intermediate state where the market has seen `V` and can react before the fill completes, because the fill *is* the clearing event and it is instantaneous.

**Why this achieves what continuous markets cannot:** the batch interval *is* the atomicity window. Within it, `V` is cryptographically hidden (Pedersen commitment) and operationally invisible (no fills to observe). At the boundary, `V` clears in a single atomic event — the market learns the *aggregate* cleared quantity, but the buyer's individual `V` is hidden within the batch by the MPC, and by the time the position is inferable, the trade is done.

> **Result 2 (sealed execution).** *A frequent batch auction with committed orders and MPC clearing achieves guaranteed atomic execution of `V` at `≤ p*` with no intermediate state in which the market learns `V` and can react. The order is hidden cryptographically before clearing and mixed within the batch at clearing. This solves Open C1 to the extent the observability lag permits.*

---

## 4. The exact limit: the observability-lag theorem, again

Result 2 is not unconditional, and the condition is precisely Theorem 15.

The buyer's `V` is hidden *within the batch* at clearing, but its **market impact** — the price move from consuming `V` units of liquidity — is still visible in the cleared price. An observer comparing pre-batch and post-batch prices infers that *some* large order cleared. Whether they can attribute it to a specific buyer, and how quickly, is the observability lag `L`.

> **Result 3.** *The batch interval sets `L`. A single-order batch has `L = 0` — the buyer is fully exposed, since the only order in the batch is theirs. A batch with `n` orders of comparable size hides the buyer among `n`, and the anonymity is `n`-fold. The protection is exactly the batch's order-count diversity, and it is the same `n/k`-style bound that appeared in revocation cohorts.*

This yields the design law:

$$\text{buyer anonymity} \;=\; \frac{\text{batch aggregate volume}}{\text{buyer's } V}$$

A buyer whose order is a small fraction of batch volume is well-hidden; a buyer who *is* the batch is fully exposed. **This is the honest limit: sealed execution protects a large order only insofar as the batch contains comparable liquidity from others.** It cannot hide an order that dominates the market — because dominating the market is observable through impact, by Result 1.

---

## 5. What this composes with, from work already done

Three prior results plug in directly, which is the sign the frontier is correctly placed:

1. **The observability-lag theorem (Frontier 3 / auctions):** the batch interval is the tunable `L`, and Theorem 15's `δ ≥ (δ*)^{1/L}` governs whether a colluding set of market-makers can sustain price manipulation across batches.
2. **The latency–anonymity law (Frontier 2):** if batch *timing* is itself informative (a buyer who only trades in certain batches), padding applies — the same `1 + (L/σ)²` protection.
3. **The MPC clearing analysis (auctions):** the receipt-freeness and threshold-honesty requirements from that work apply verbatim to the batch-clearing MPC — the clearing must not let a market-maker prove which orders they saw.

> **Result 4.** *Sealed execution is not a new construction but the composition of three existing results — batch clearing (observability lag), timing padding (latency law), and receipt-free MPC (auction analysis) — applied to market microstructure. The novelty is the composition and the identification of the batch interval as the control parameter, not any new primitive.*

---

## 6. The genuinely open sub-problem

One piece does not reduce to prior work: **guaranteed atomic sourcing of `V`.**

The batch clears at a uniform price, but the liquidity to fill `V` must exist in the batch. If it does not — if the batch's sell-side is thinner than `V` — the order either partially fills (breaking atomicity) or fails (breaking the guarantee). The buyer wanted *guaranteed* execution.

> **Open C1′ (atomic sourcing).** *Construct a batch mechanism where a committed buy order of size `V` at `≤ p*` is guaranteed to fill fully or fail atomically, without revealing `V` to potential sellers before they commit their liquidity. The tension: sellers price their liquidity based on demand, but revealing demand to attract liquidity is the leak the mechanism exists to prevent.*

This is the residual hard core, and it is genuinely open. The likely direction is a **two-sided commitment** where sellers commit liquidity blind (compensated for the option they grant), and the buyer's fill is guaranteed against the committed sell-side — but pricing the blind seller option without revealing `V` is the unsolved piece, and it connects back to the information-floor results: the seller needs *some* bits about aggregate demand to price, and the question is the minimum bits that leak.

---

## 7. Falsification

1. **Result 2 fails** if the MPC clearing itself leaks intermediate state — a market-maker participating in the MPC who learns order sizes before clearing. This is the threshold-honesty assumption from the auction work, and it fails completely if the MPC quorum is controlled by adversarial market-makers.
2. **Result 3's anonymity fails** if batch composition is predictable — if a large buyer reliably trades in identifiable batches, the `n`-fold hiding collapses. Batch assignment must be unpredictable, which is the beacon-unbiasability requirement yet again.
3. **The whole construction fails** for a buyer who is a large fraction of total market volume, and this should be stated as a hard limit, not engineered around: **you cannot hide an order that moves the market, because the market move is the signal.** FBA protects the large-but-not-dominant order; it cannot protect the whale.
4. **Open C1′** may be impossible in the strong form — guaranteed fill without any demand revelation may reduce to the information floor, meaning some bits about `V` must leak to source liquidity. Proving that lower bound would be as valuable as a construction.

---

## 8. The bottom line

Large-order protection cannot be solved by hiding the order, because market impact leaks through effect. It can be solved by removing market continuity: a frequent batch auction with committed orders and MPC clearing gives atomic execution with no intermediate state the market can react to, and hides the buyer within the batch.

The protection is exactly the batch's liquidity diversity — `anonymity = batch volume / V` — which means the construction protects a large order embedded in comparable flow and is honestly powerless against an order that dominates the market. That limit is Result 1 restated: you cannot hide what moves the price.

The construction is a composition of three results already derived — observability lag, latency padding, receipt-free MPC — applied to microstructure, with the batch interval as the control parameter. The one genuinely open sub-problem is atomic sourcing: guaranteeing a full fill without revealing demand to the sellers who must supply it, which likely bottoms out at an information-floor lower bound on how many bits of `V` must leak to price the liquidity. That is the hard, publishable core, and it is the right place for the next depth.

And the recurring theorem holds a final time: across delegation, micropayments, and now macro execution, **effect is observable even when the channel is private.** Every payment frontier is bounded by the same wall, and the honest constructions all work by making the effect *irrelevant in time* — the observability lag — rather than by hiding it, which cannot be done.
