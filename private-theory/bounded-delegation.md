# Bounded Delegation

### A two-layer RLN construction solves Proof-of-Agency with no new cryptography

---

## 1. The two requirements, restated as circuit properties

From §9.1: (1) **visibility** — a verifier must always distinguish agent-action from human-action; (2) **a cap** — a per-human bound on total delegated actions, or delegation becomes a Sybil amplifier.

Both are already solved primitives in this project, just not composed at two levels. RLN with a message limit `Q` (a degree-`(Q−1)` Shamir polynomial instead of degree-1) already caps *any* actor to `Q` actions per `(ctx, epoch)` before self-doxxing. The missing piece is making the cap apply **across all of a human's agents jointly**, while each individual agent stays anonymous.

---

## 2. The construction: two independent RLN layers per action

Each delegated action produces **two** shares, evaluated at the same point but bound to different secrets:

**Layer A — per-agent cap `q` (visibility + individual throttling).**
$$y_A = s_{\text{agent}} + a_1 x + \cdots + a_{q-1}x^{q-1} + N_{\text{agent}}\, x^{q}, \qquad x = \text{signalHash}$$
where `s_agent = Poseidon(s, agent_id)` is a sub-key derived from the human's root `s`. Exceeding `q` actions from one agent in one epoch reveals `s_agent` — burns that agent, not the human.

**Layer B — per-human cap `Q` (the amplification bound).**
$$y_B = s + b_1 x + \cdots + b_{Q-1}x^{Q-1} + N_{\text{human-agg}}\, x^{Q}$$
bound to `s` itself, **shared across every agent this human has delegated to.** Any `Q+1` actions from the human's *entire agent fleet* in one `(ctx, epoch)`, regardless of which agents produced them, land `Q+1` points on the same degree-`(Q−1)` line and reveal `s` — burning the human's whole credential, not just one agent.

**Visibility.** The circuit outputs a public bit `is_agent`, bound into the nullifier hash so it cannot be flipped without invalidating the proof: `N = Poseidon(s, ctx, epoch, is_agent, agent_id_commit)`. A human proof and an agent proof are structurally distinct public statements; no verifier can mistake one for the other.

---

## 3. Why this satisfies both requirements

**Visibility (✓).** `is_agent` is a committed public signal. An agent cannot present itself as a human proof, because the nullifier derivation differs and the human-layer share `y_B` would be absent or malformed.

**The cap (✓), and it composes correctly.** Layer B's secret is the human's root `s`, identical across every agent. This is the mechanism that aggregates: RLN's degree-`(Q−1)` polynomial doesn't care which agent contributed a point, only that `Q+1` points landed on the shared line. **The human cannot escape the aggregate cap by spreading actions across many agents** — that is precisely what would defeat a naively per-agent-only limit, and Layer B closes it by construction.

**Layer A is not redundant.** Without it, a single compromised or careless agent can burn through the human's entire `Q` budget alone. Layer A throttles individual agents to `q ≤ Q` each, so no one agent can exhaust the shared budget unilaterally — a defense-in-depth property, not a duplicate of Layer B.

---

## 4. Cost

Each layer is a degree-`(Q−1)` polynomial evaluation: `Q−1` multiply-adds, negligible next to the circuit's existing 4,309 constraints. Two layers at `Q, q ≈ 5–20` add on the order of tens of constraints total — this is cheap, unlike almost everything else this project has had to fight for.

---

## 5. What is not solved, and must be built before trusting this

1. **Sybil-amplification proof.** Formally show `Q` bounds the *total* value a human can extract via delegation, tying `Q` into `γ ≥ β·m·E` — a delegated human effectively becomes `Q` actions instead of 1, so the economics need `Q` folded into `m`.
2. **Agent key compromise.** If `s_agent` leaks, the compromised agent is burnable (Layer A) but the human's root `s` is untouched — confirm this isolation holds under the shared-`x` construction; a shared evaluation point across layers must not leak `s` when `s_agent` is exposed.
3. **Revocation interaction.** An agent's individual burn should not cascade to the human's other agents; verify against the bulk-revocation machinery already built for Gate 6.

---

## Falsification

1. Fails if `s_agent = Poseidon(s, agent_id)` allows recovering `s` given several `s_agent` values across agents — check this is one-way in both directions.
2. Fails if sharing the evaluation point `x` across Layer A and Layer B creates a joint-reveal path (e.g. Layer A's leaked `s_agent` plus public `x` values reconstructing Layer B's line early). Model this explicitly before building.
3. The `Q` value chosen must be re-derived from Frontier 2's information floor and the economic `γ ≥ β·m·E`, not assumed — an untied `Q` is a design gap.

---

## The bottom line

Bounded delegation needs no new primitive — it is RLN's own message-limit generalization, applied twice: once per-agent (throttling, burnable individually) and once per-human (aggregate cap, shared secret across the whole agent fleet). The human-layer share is what stops delegation from amplifying a Sybil attack, because it aggregates regardless of which agent acted. Cost is negligible. The open work is tying `Q` to the economics and proving no cross-layer leak — both tractable, neither requiring new cryptography.
