# Repo structure and why

Two repositories, one public and irrevocable, one private and reversible.
This document explains the boundary honestly, including the part of the
pitch that undersells itself if overstated: **the private code is a
head-start, not a moat.**

## What is public, and why

**`rehanmalik2008/Proof-of-Personhood`** (Apache License 2.0, cannot be
retracted — that grant is irrevocable by design and this document does not
touch it):

- The frozen protocol circuit (`wedge_membership.circom` and its Phase-1/
  Phase-2 family) and the whitepaper.
- The circomlib `LessThan` finding and the Picus non-termination finding
  (`docs/filings/*`, `docs/self-audit/picus-upstream-issue.md`) — these are
  filed (or filing-ready) as issues against third-party projects
  (`iden3/circomlib`, `0xPARC/zk-bug-tracker`, `chyanju/picus`). **Filing
  itself was intentionally left for explicit go-ahead in this session, not
  executed as part of this restructuring** — see the accompanying report.
  These build the public reputation an acquisition conversation depends on;
  they cost nothing to give away and buy credibility that a purely private
  codebase cannot.
- Theory papers, once the author chooses to publish each to ePrint for
  priority. None of the four private-theory notes in this repo are public
  yet; that decision is made per-paper, not automatically.

Public is the *credibility* layer: it proves the team finds real bugs in
real infrastructure and ships a working, audited circuit. It is not the
asset being sold.

## What is private, and why

**This repository (`sybil-wedge-private`)**, under `EVALUATION-LICENSE.md`
(proprietary, evaluation-only, all rights reserved — not a copy of
Apache-2.0, not open source):

- `circuits/`, `scripts/`, `docs/` — Open A1 (the private spending-policy
  circuit): `wedge_policy.circom`, `main_wedge_policy.circom`, its witness
  generator, and its adversarial-soundness harness. This is the first piece
  of *implemented, tested* new work built on top of the frozen public
  circuit that is not itself in the public circuit.
- `private-theory/` — the delegation two-layer RLN construction
  (`bounded-delegation.md`, completed in `blocks-not-shuffles.md`) and the
  payment-frontier research (`three-payment-frontiers.md`,
  `sealed-execution.md`). These are pre-publication drafts for planned
  ePrint submissions. They stay private until each is individually
  published — publishing one does not obligate publishing the others, and
  the implementation (circuits) can lag or lead the paper for any given
  result.

Private is the *asset* layer: the specific circuits, their constraint-level
engineering, and the unpublished results that let someone build the next
piece faster than re-deriving it from scratch.

## The honest limit of the moat

This is a **head-start**, explicitly not a permanent barrier, and the
acquisition pitch should say so plainly rather than imply otherwise:

- The public repo already discloses the *scheme* (RLN-based Phase-2
  membership, the delegation idea's shape is discoverable from
  `three-payment-frontiers.md`'s own published framing once that note is
  ever public, and cryptographic literature on RLN and rate-limiting
  nullifiers is itself public prior art). Nothing here is patentably novel
  cryptography — the constructions are compositions of known primitives
  (Poseidon, Merkle membership, Shamir/RLN shares), which is also *why* no
  new trust assumptions were introduced building Open A1.
- **Once a private-theory paper is published to ePrint, the corresponding
  circuit becomes re-derivable by a competent team within a similar
  timeframe to the one this session took** — the theory note contains the
  actual construction (the polynomial layering, the leaf/commitment
  design), and translating a fully-specified construction into circom is
  mechanical relative to inventing it. Publishing a paper and keeping its
  circuit private buys review credit and priority, not secrecy of the
  underlying idea.
- **What the private repo actually protects is time, not information
  monopoly**: the specific constraint-optimized circuit code, the
  adversarial test suite that already caught the classes of bug this
  project cares about (the null-space search, the Layer-A/B leak analysis),
  and the operational knowledge of which design choices were tried and
  rejected. An acquirer buying this repo is buying "skip N weeks of
  circuit engineering and a working test harness," not "skip inventing the
  idea." That is a real, quantifiable saving — the constraint-count and
  adversarial-test-pass work in `docs/open-a1-policy.md` took concrete,
  nontrivial effort to get right (the O2-vs-unoptimized constraint-count
  trap alone cost a full debugging pass) — but it is not exclusivity over
  the concept, and the pitch should never claim it is.
- The moat's clock starts ticking the moment any of the four theory notes
  is published. Sequencing which paper goes to ePrint when is therefore
  itself a decision with a shelf-life consequence for this repo's value,
  not a purely academic one — publish the papers whose circuits are already
  built and tested first if the private code's marginal value should be
  preserved longest; publish a paper whose circuit isn't built yet only
  when the head-start on THAT circuit is no longer the point.

## What is deliberately NOT done here

- Nothing in the public repo's history, license, or content was touched,
  relicensed, or retracted. The Apache-2.0 grant on every already-public
  file stands exactly as it was.
- The `EVALUATION-LICENSE.md` in this repo is drafted from scratch; it does
  not copy or adapt Apache-2.0 text.
- No GitHub issue was actually filed against `iden3/circomlib`,
  `0xPARC/zk-bug-tracker`, or `chyanju/picus` as part of this restructuring
  — those filing bodies already exist and are filing-ready in the public
  repo, but the act of posting them to third-party trackers is a distinct,
  externally-visible action this session did not take without a fresh,
  explicit go-ahead (a prior instruction in this same project asked to
  review filings before they go out; that instruction was not superseded
  clearly enough to act on silently here).
