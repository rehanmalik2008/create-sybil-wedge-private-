# Three Payment Frontiers

### What is genuinely open in agent payments, micropayments, and large-order execution — and what your existing machinery already solves

---

## 0. Framing: name the real problem in each, not the slogan

The complaint — "fees, latency, no privacy, no protection when a large fund buys" — bundles four distinct failures with different causes and different cures. Separating them is the whole task, because two are already largely solved, one has a clean partial solution from work in this project, and one is genuinely hard and connects to the auction results.

| frontier | the real problem | status |
|---|---|---|
| Agent payments | per-action fee floors make autonomous micro-spending uneconomic | **solvable** — the RLN-cap machinery amortizes |
| Micropayments | sub-cent transfers cost more in fees than they carry | **largely solved externally** (channels), with a real privacy gap |
| Macro payments | a large order moves the price against itself before it fills | **partially solvable** — the observability-lag result applies |

---

# FRONTIER A — Agent payments without per-action fees

## A.1 The real problem

An AI agent acting on a human's behalf may take thousands of small actions. If each carries a fee floor, the model breaks: `10,000` actions × `$0.01` fee = `$100` of pure overhead. The world processes this per-transaction because each transaction is settled independently.

## A.2 The solution is the delegation construction, reused

The bounded-delegation work already built the mechanism: a human delegates a budget `Q` to an agent, and RLN caps total actions at `Q` per `(ctx, epoch)`. **Attach a value budget the same way.**

Let the human commit to a total spend `B` at delegation time, escrowed once. The agent produces actions, each carrying a share of a degree-`(M−1)` polynomial keyed to `s`, where the `M`-th action reveals `s` (burn). Between the value escrow and the action cap:

> **Result A1.** *Agent spending is bounded by a single on-chain commitment (one fee) rather than per-action settlement. The human pays one settlement fee to open the budget and one to close it; the agent's `Q` actions in between cost zero on-chain, their integrity guaranteed by the RLN burn rather than by per-action verification.*

This is the channel idea (§B) specialized to delegation: **the fee is paid on the budget, not the action.** The agent-fee problem reduces to the micropayment problem, which is §B.

## A.3 What is actually open

The novel part is **conditional spending under delegation with privacy**: the human wants to bound not just *how much* the agent spends but *on what* — "up to `$B`, only on compute, never on transfers to new addresses" — without revealing the policy to the counterparty. This is a **predicate on the spend** proven in zero-knowledge.

> **Open A1 (private spending policy).** *Construct a ZK circuit where the agent proves each spend satisfies a human-committed policy predicate `P` (category, rate, destination allowlist) without revealing `P` to the recipient. The recipient learns only "this spend is authorized," not the constraints.*

This is tractable — it is a membership/range proof over the spend fields against a committed policy — and it is the genuinely new contribution available in agent payments. Everything else reduces to §B.

---

# FRONTIER B — Micropayments: the fee floor and the privacy gap

## B.1 The real problem, and what is already solved

Sub-cent payments cost more in fees than they carry. **This is largely solved by payment channels** (Lightning-style): open a channel once, transact off-chain at zero marginal fee, settle once. The fee floor is amortized across all transactions in the channel's lifetime.

So the fee problem is not open. **The privacy problem is.** In a standard channel, the two endpoints see every payment; in a routed network, intermediate hops see amounts and timing. The world processes micropayments with no privacy because the routing layer needs the amounts to forward them.

## B.2 The solvable part: amount hiding

Amounts can be hidden with **homomorphic commitments** — each channel balance is a Pedersen commitment, updates prove `new = old − payment` and `payment ≥ 0` in zero-knowledge, and no observer learns the amount. This is known (confidential transactions) and composes with channels.

> **Result B1.** *Micropayment amount-privacy is achievable by combining payment channels (fee amortization) with confidential-transaction commitments (amount hiding). The fee floor and amount privacy are both solved; neither is the frontier.*

## B.3 The genuinely open part: routing-privacy under the latency law

The hard problem is **timing correlation on the routing path** — exactly the channel this project already analyzed. An observer watching a routed micropayment sees the *timing* of forwards even when amounts are committed, and correlates sender to receiver.

**This is the latency–anonymity law (Frontier 2 earlier).** The routing-privacy problem is a timing-deanonymization problem, and the result already derived applies directly: padding delay of mean `L` against natural jitter `σ` multiplies the observer's detection threshold by `1 + (L/σ)²`.

> **Result B2.** *Micropayment routing-privacy is governed by the latency–anonymity law: `M_crit ∝ 1/d²`, with padding buying quadratic protection. The open engineering question is the throughput cost of the required `L` at micropayment volumes — a payment that must wait `870 ms` for privacy (the earlier worked figure) may be unacceptable at high frequency, exactly as that analysis predicted.*

The frontier is therefore not "can micropayments be private" (yes) but "at what latency, and is that latency tolerable for the use case" — which is the honest, quantified version, and it is answered by the law already in hand.

---

# FRONTIER C — Macro payments: protection when a large fund buys

## C.1 The real problem, stated precisely

When a large fund buys an asset, its own order moves the price against it — **market impact**. The world processes this badly: on a public order book, the order is visible before it fills, so front-runners and the market price react, and the fund pays more than the pre-order price. "No protection when a big fund buys assets" is the market-impact and front-running problem.

This is the hardest of the three and it connects directly to the auction/collusion results.

## C.2 Why it is hard: the same tension as auctions

The fund wants to buy `V` units without the market learning `V` until execution completes. But **execution reveals demand** — every fill removes liquidity, and the order book's response signals that a large buyer is present. This is Corollary 14.1 and the observability-lag result in a new guise: **the allocation becomes visible through its effect on the market.**

> **Result C1.** *Large-order privacy is bounded by market-impact observability. An order of size `V` against depth `D` moves the price by roughly `V/D` regardless of how the order is hidden cryptographically, because the price change is a function of liquidity consumed, not of what the observer was told. Cryptographic hiding of the order does not hide its footprint.*

This is the macro-payment analogue of the revocation-cohort leak: the information escapes through *effect*, not through the *channel*, and no amount of ZK on the order itself closes it.

## C.3 What is actually solvable

Two partial protections, both real, both already in this project's toolkit:

**C.3.1 Batch clearing hides *individual* orders (the dark pool).** The MPC order-clearing analysis (observability-lag frontier) applies directly. Aggregate many orders, clear them together via MPC, reveal only fills. An individual large order is hidden *within the batch* — the observability lag `L` is the time until the fund's resulting position becomes inferable, and Theorem 15 gives the protection.

> **Result C2.** *Batch MPC clearing protects a large order for the observability lag `L` — the interval between execution and the position becoming inferable from public data. For a fund, `L` is bounded by position-reporting requirements, not by the cryptography. The construction works exactly where reporting is delayed, and fails where fills are immediately public — which is the same partition the auction analysis found.*

**C.3.2 Temporal splitting under the latency law.** Split `V` into `V/T` slices over `T` periods so each slice's market impact stays below the detection floor. This is the staged-revocation construction (Frontier 3 earlier) applied to order execution: the required `T` is `T ≳ V/(D · d_min)` where `d_min` is the impact the market cannot distinguish from noise.

> **Result C3.** *Splitting a large order over time reduces per-slice impact below the noise floor, at the cost of execution latency `T` and exposure to adverse price moves during `T`. This is the direct analogue of staged revocation, and it inherits the same tension: privacy versus timeliness, quantified by the ratio of order size to market depth.*

## C.4 The genuinely open part

The novel frontier is **guaranteed execution at a committed price without pre-revealing size** — the fund wants to commit to buying `V` at price `≤ p*` without the market seeing `V` until the trade is irreversible.

> **Open C1 (sealed guaranteed execution).** *Construct a mechanism where a large buyer commits (with escrow) to `(V, p*)`, the commitment is hiding until execution, and execution is atomic — either the full `V` fills at `≤ p*` or nothing does — with no intermediate state in which the market learns `V` and can react before the fill completes.*

This is hard because atomicity across a large fill fights liquidity: the market must supply `V` units, and sourcing them is not atomic in a continuous market. The likely form is a **frequent batch auction** (clearing at discrete intervals rather than continuously), where the batch interval *is* the atomicity window and the observability lag is one batch. This connects the macro-payment frontier back to the observability-lag theorem: **the batch interval is the tunable `L`.**

---

# What is open, ranked

1. **Open A1 (private spending policy)** — most tractable, genuinely novel, directly buildable as a ZK predicate over spend fields. **Start here.**
2. **Open C1 (sealed guaranteed execution via frequent batch auctions)** — hardest, highest-value, connects the observability-lag and auction results to real market structure.
3. **B2's throughput question** — quantified, not conceptually open; an engineering measurement of the latency law at micropayment volume.

Everything else reduces to machinery already built: agent fees → channels (B); amount privacy → confidential transactions; individual-order hiding → MPC batch clearing (observability lag); temporal splitting → staged revocation (latency law).

---

## The honest boundary across all three

Every one of these frontiers hits the same wall in its hardest case: **effect is observable even when the channel is private.** An agent's spending pattern, a micropayment's routing timing, a large order's market impact — each leaks through consequence rather than through the message. This is the recurring theorem of the entire body of work (revocation cohorts, auction allocations, timing channels), and it bounds all three payment problems identically. The solvable parts are real and substantial; the unsolvable core is the same one, and it should be disclosed rather than promised away.
