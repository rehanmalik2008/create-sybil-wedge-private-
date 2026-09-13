# sybil-wedge-private

Source-available, **not** open source. See [`EVALUATION-LICENSE.md`](EVALUATION-LICENSE.md) —
read access alone grants no rights; use requires a separate written
agreement. See [`REPO-STRUCTURE.md`](REPO-STRUCTURE.md) for what lives here,
what lives in the public repo instead, and why.

## Layout

- `circuits/`, `scripts/`, `docs/` — the new implementation not yet in the
  public repo (currently: Open A1, the private spending-policy circuit).
- `private-theory/` — research notes (delegation, block-design, the
  payment-frontier analyses). Pre-publication drafts for planned ePrint
  papers; not yet public.
- `vendor/proof-of-personhood/` — a git submodule pointing at the **public**
  Apache-2.0 repo (`rehanmalik2008/Proof-of-Personhood`), pinned to a commit.
  This repo's circuits `include` the frozen membership gadgets from there
  (`wedge_membership.circom`) and its test scripts import the frozen
  soundness harness (`two_witness_search.mjs`, `nullspace_harness.mjs`)
  rather than duplicating that code under a different license. Run
  `git submodule update --init` after cloning.

## Build

```sh
git submodule update --init
npm install
node scripts/gen_input_wedge_policy.mjs
node -e "..." # compile circuits/main_wedge_policy.circom with circom2,
               # -l circuits -l vendor/proof-of-personhood/circuits
               # -l vendor/proof-of-personhood/node_modules/circomlib/circuits
node scripts/test_soundness_adversarial_policy.mjs
```

See `docs/open-a1-policy.md` for the full build/test walkthrough, constraint
counts, and adversarial-test results.
