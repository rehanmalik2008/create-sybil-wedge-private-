# Blocks, Not Shuffles

### Bounded delegation completed, and why quorum shuffling defeats the whistleblower it was meant to protect

---

# PART I — Bounded delegation, completed

## 1. The cross-layer leak: safe, and here is why

The open concern was whether sharing the evaluation point `x = signalHash` between Layer A (per-agent, keyed to `s_agent`) and Layer B (per-human, keyed to `s`) creates a joint-reveal path.

It does not. The two polynomials have **independently sampled coefficients** and different constant terms. Recovering `s_agent` from `q+1` Layer-A points reveals nothing about Layer B's line, because Layer B's coefficients `b_1,\dots,b_{Q-1}` are independent of Layer A's and its constant term is `s`, not `s_agent`. Sharing `x` only means both lines are evaluated at the same abscissa — which is a public value anyway.

The remaining question is whether many leaked sub-keys compromise the root: given `s_{\text{agent},i} = \text{Poseidon}(s, \text{id}_i)` for many `i`, can `s` be recovered? This is a multi-target preimage problem against Poseidon with a shared secret input, and it is exactly the setting Poseidon is designed for. **State it as an explicit assumption rather than proving it here**, since it is the one place the construction leans on the hash's strength.

## 2. Three refinements that change the design

**2.1 The cap is per-`(ctx, epoch)`, not global — and this is load-bearing.** Layer B aggregates only where the shares can be *collected*. Since the nullifier is per-context, cross-context aggregation would require linking a human's actions across contexts, which is precisely what the protocol forbids. So `Q` bounds delegated actions **per context per epoch**, and a human with agents across `m` contexts has `Q \cdot m` total.

> **This must be folded into the economics.** The deterrence condition `γ ≥ β·m·E` becomes `γ ≥ β·(Q m)·E` for a delegating human, since delegation multiplies monetizable actions by `Q`. **Enabling delegation raises the required mint cost by a factor of `Q`** — that is the honest price of the feature and it was not previously stated.

**2.2 Agent-key copying is harmless.** A human can hand `s_agent` to a thousand bots. They then *share* the `q` budget: the `q+1`-th action across all of them burns the key. Layer A caps per-key, not per-process, and per-key is the correct granularity.

**2.3 Unlimited agent issuance is harmless, which is the construction's nicest property.** A human can mint arbitrarily many `agent_id`s. Each gets its own Layer-A budget, but **every one of them contributes to the same Layer-B line keyed to `s`**. Issuing more agents does not raise the aggregate ceiling. This is what makes the design robust: it does not need to police agent creation at all.

**2.4 Expiry.** Bind `agent_id` to a validity window in the commitment, so a delegation cannot outlive its intent: `s_{\text{agent}} = \text{Poseidon}(s, \text{id}, \text{epoch}_{\text{start}}, \text{epoch}_{\text{end}})`, with the circuit constraining the current epoch to the range.

## 3. Status

The construction is complete modulo the multi-target preimage assumption (§1) and the `Q`-into-economics update (§2.1). No new cryptography. Cost remains tens of constraints. **Frontier 1 is solved.**

---

# PART II — Frontier 4: the shuffle makes it worse

## 4. The proposed fix is backwards

Frontier 4 targets statistical attribution: over `T` rounds, a cartel correlates "which rounds had defections" with "who participated," and identifies the defector. The proposed remedy is orthogonal Latin-square quorum shuffling.

**Shuffling is what makes attribution possible.** Work the two extremes.

**Fixed quorum.** Attesters `\{1,2,3\}` always serve together. Defector is 2. Every defection round implicates exactly `\{1,2,3\}`. After a thousand rounds the cartel knows precisely what it knew after one: *the defector is one of three*. **Attribution never improves.**

**Shuffled quorums.** Round 1 draws `\{1,2,3\}`, round 2 draws `\{2,4,5\}`, round 3 draws `\{1,4,6\}`. Defections appear in rounds 1 and 2 but not 3. Intersecting: `\{1,2,3\} \cap \{2,4,5\} = \{2\}`. **Identified in three rounds.**

This is **non-adaptive group testing**: `n` items, `d` defective, pools of size `k`, and `T` tests. Identification needs roughly `T \approx d\log(n/d)` tests when pools vary — and *never* succeeds when pools are constant, because constant pools are non-separable by construction.

> **Result 1.** *Quorum shuffling is the mechanism that enables statistical attribution, not a defence against it. Implementing orthogonal Latin-square shuffling would accelerate the identification of whistleblowers, inverting the intent of Frontier 4.*

## 5. But fixed quorums destroy grinding resistance

Fixed quorums cannot simply be adopted, because they demolish Theorem 5. If an enrollee's quorum is fixed, the attacker bribes exactly that `k` and is done: cost `k b`, no grinding, no `f^{-k}`.

The two goals are in direct opposition, and the opposition has a precise source:

> **Result 2 (the independence tension).** *The `f^{-k}` grinding advantage arises from **independent per-attester assignment** — the attacker needs `k` independent coin flips to land inside his bribed set. Statistical attribution arises from **exactly the same independence** — varying co-membership is what separates one attester from another. Grinding resistance and whistleblower anonymity are the same structural property read in opposite directions.*

## 6. The solution: block designs

Independence is the shared cause, so partial independence is the resolution. **Group attesters into fixed blocks of size `g`; assign whole blocks at random.**

A quorum of size `k` is composed of `k/g` blocks drawn randomly from the pool of blocks. Then:

**Grinding.** The attacker must have bribed every assigned block. With bribed-block fraction `f`, the probability is `f^{k/g}`, so the grinding cost is

$$f^{-k/g}$$

**Attribution.** Members of a block *always serve together*. No sequence of rounds ever separates them — their co-membership pattern is identical for all time. Attribution therefore terminates at the block:

$$\text{anonymity set} \;=\; g, \quad \text{independent of } T$$

> **Result 3 (the block-design trade).** *Fixed blocks of size `g` with randomly assigned blocks yield grinding cost `f^{-k/g}` and a **permanent** anonymity floor of `g` that does not decay with the number of rounds. The parameter `g` tunes continuously between the two extremes: `g=1` gives maximal grinding (`f^{-k}`) and zero anonymity; `g=k` gives minimal grinding (`f^{-1}`) and maximal anonymity (`1`-in-`k`).*

The decisive property is that the anonymity floor is **permanent**. Under individual assignment, attribution improves with `T` and the whistleblower is eventually exposed no matter what. Under block assignment, `g` is a hard floor that a thousand rounds cannot erode.

**Worked values at `f = 0.1`:**

| `k` | `g` | grinding cost `f^{-k/g}` | anonymity floor |
|---:|---:|---:|---:|
| 6 | 1 | 10⁶ | 1 (exposed) |
| 6 | 2 | 10³ | 2 |
| 6 | 3 | 10² | 3 |
| 6 | 6 | 10 | 6 |

**`k=6, g=2` is the interesting cell:** a thousandfold grinding penalty alongside permanent 1-in-2 ambiguity. Combined with the earlier `(1-\pi)^{c-1}` collective-punishment decay, an anonymity floor of even 2 or 3 is enough to make targeted punishment unavailable — the cartel cannot punish a defector it can only localize to a pair.

## 7. Falsification

1. **Result 3 fails** if blocks can be separated by a channel other than co-membership — timing, response latency, or signature ordering within a quorum. **Block members must be operationally indistinguishable**, which is a stronger requirement than merely serving together, and it is the most likely break.
2. **The grinding calculation fails** if the attacker can bribe *within* a block cheaply — blocks are natural collusion units, and a bribed block member may recruit their blockmates more easily than strangers. Blocks should therefore be composed across organizations and jurisdictions, which is the diversity predicate applied at block level.
3. **`g` must be derived, not chosen.** It should follow from the required grinding cost (economics) and the anonymity needed for the `(1-\pi)^{c-1}` argument to bite. Both constraints exist; neither has been written down.
4. Result 1 fails if some shuffling schedule is provably non-separable in the group-testing sense while still varying quorums — Latin squares specifically should be checked for this, since a well-chosen design might vary membership while keeping certain pairs perpetually confounded. **This is the one way the original proposal could be rescued**, and it is worth an hour before discarding it.

---

## The bottom line

Delegation is finished: two RLN layers, per-agent and per-human, with the human layer aggregating across the whole fleet so agent issuance can be unlimited without raising the ceiling. The cap is per-context, which means enabling delegation multiplies the required mint cost by `Q` — the honest price of the feature.

Frontier 4's proposed remedy is inverted: shuffling quorums is the mechanism that identifies whistleblowers, since varying pools are exactly what makes group testing separable. But fixed quorums destroy grinding resistance, because both properties trace to the same independence in assignment.

Block designs resolve it. Fixed blocks of size `g`, randomly assigned, give grinding cost `f^{-k/g}` and a permanent anonymity floor of `g` that does not erode with time. At `k=6, g=2` that is a thousandfold grinding penalty with irreducible 1-in-2 ambiguity — enough for the collective-punishment decay to do the rest.
