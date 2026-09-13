// Honest witness + adversarial fixtures for the escrow-leak fix (Step 1-2).
//   node scripts/gen_input_wedge_escrow.mjs
//
// Builds real Pedersen-hash commitments (matching circomlib's Pedersen(n)
// bit-packing exactly -- verified against the compiled circuit, not assumed)
// and writes:
//   build/input_wedge_escrow.json                    -- honest witness
//   build/input_wedge_escrow_bad_sufficiency.json     -- collateral < V_hi*p*
//   build/input_wedge_escrow_bad_bracket.json         -- V outside [V_lo,V_hi]
//   build/input_wedge_escrow_bad_balance_open.json    -- balance/r_bal don't
//                                                        match C_bal
//   build/input_wedge_escrow_insolvent.json           -- balance < collateral
//     (buyer doesn't control enough to cover their own claimed collateral)
import { buildPedersenHash, buildBabyjub } from "circomlibjs";
import { writeFileSync, mkdirSync } from "fs";

const pedersen = await buildPedersenHash();
const babyJub = await buildBabyjub();
const F = babyJub.F;

mkdirSync("build", { recursive: true });

const NBITS = 128; // must match COLLATERAL_BITS() in wedge_escrow.circom

// little-endian byte packing of an NBITS-bit value -> matches Num2Bits' LSB-
// first bit ordering fed byte-by-byte (circomlibjs's buffer2bits reads LSB
// of the first byte first, ascending) -- this is the convention the circuit
// wires as ped.in[0..nBits-1] <== Num2Bits(nBits).out[0..nBits-1].
function toLEBytes(v, nBits) {
  const nBytes = nBits / 8;
  const buf = Buffer.alloc(nBytes);
  let x = BigInt(v);
  for (let i = 0; i < nBytes; i++) { buf[i] = Number(x & 0xffn); x >>= 8n; }
  return buf;
}

// C = Pedersen(value || r), value and r each NBITS bits, concatenated LSB-
// first-per-value exactly as wedge_escrow.circom's HidingCommit wires it.
function hidingCommit(value, r) {
  const buf = Buffer.concat([toLEBytes(value, NBITS), toLEBytes(r, NBITS)]);
  const packed = pedersen.hash(buf);
  const point = babyJub.unpackPoint(packed);
  return F.toObject(point[0]); // ped.out[0] == the x-coordinate
}

// --- the scenario ---
const V_lo = 800n, V_hi = 1200n;          // bracket: leaks log2(1200/800) bits
const p_star = 50n;                        // limit price
const V = 1000n;                           // buyer's true demand, in-bracket
const required = V_hi * p_star;            // 60000 -- the minimum sufficient collateral
const collateral = required + 5000n;       // honestly over-collateralized
const r_esc = 424242424242n;
const balance = collateral + 20000n;       // buyer controls more than they escrow
const r_bal = 131313131313n;

const C_esc = hidingCommit(collateral, r_esc);
const C_bal = hidingCommit(balance, r_bal);

const honest = {
  V_lo: V_lo.toString(), V_hi: V_hi.toString(), p_star: p_star.toString(),
  C_esc: C_esc.toString(), C_bal: C_bal.toString(),
  V: V.toString(), collateral: collateral.toString(), r_esc: r_esc.toString(),
  balance: balance.toString(), r_bal: r_bal.toString(),
};
writeFileSync("build/input_wedge_escrow.json", JSON.stringify(honest, null, 2));
console.log("wrote build/input_wedge_escrow.json (honest)");
console.log(`  required = V_hi*p_star = ${required}, collateral = ${collateral}, balance = ${balance}`);
console.log(`  C_esc = ${C_esc}`);
console.log(`  C_bal = ${C_bal}`);

const clone = (o) => JSON.parse(JSON.stringify(o));

// --- adversarial 1: escrow INSUFFICIENT (collateral < V_hi * p_star) ---
// The prover has genuinely less collateral than the bracket requires, and
// commits honestly to that smaller amount (C_esc recomputed for it) --
// this is the "claims sufficiency it doesn't have" attempt: same public
// V_hi/p_star, an honestly-opened C_esc, but the sufficiency inequality
// itself is false.
{
  const badCollateral = required - 1n; // exactly 1 short
  const badC_esc = hidingCommit(badCollateral, r_esc);
  const bad = clone(honest);
  bad.collateral = badCollateral.toString();
  bad.C_esc = badC_esc.toString();
  writeFileSync("build/input_wedge_escrow_bad_sufficiency.json", JSON.stringify(bad, null, 2));
  console.log("wrote build/input_wedge_escrow_bad_sufficiency.json (collateral = required - 1)");
}

// --- adversarial 2: V outside the published bracket ---
{
  const bad = clone(honest);
  bad.V = (V_hi + 1n).toString(); // one above the upper bound
  writeFileSync("build/input_wedge_escrow_bad_bracket.json", JSON.stringify(bad, null, 2));
  console.log("wrote build/input_wedge_escrow_bad_bracket.json (V = V_hi + 1)");
}

// --- adversarial 3: balance opening does not match the published C_bal ---
// (claims to control a DIFFERENT balance than the one C_bal actually commits
// to -- i.e. the private (balance, r_bal) witness doesn't open the public
// commitment at all)
{
  const bad = clone(honest);
  bad.balance = (balance + 1n).toString(); // C_bal on file was for `balance`, not `balance+1`
  writeFileSync("build/input_wedge_escrow_bad_balance_open.json", JSON.stringify(bad, null, 2));
  console.log("wrote build/input_wedge_escrow_bad_balance_open.json (balance opening != C_bal)");
}

// --- adversarial 4: insolvent -- balance < collateral (doesn't control what
// they claim to have escrowed), with a HONEST C_bal for the smaller balance
{
  const smallBalance = collateral - 1n; // one short of covering their own escrow
  const badC_bal = hidingCommit(smallBalance, r_bal);
  const bad = clone(honest);
  bad.balance = smallBalance.toString();
  bad.C_bal = badC_bal.toString();
  writeFileSync("build/input_wedge_escrow_insolvent.json", JSON.stringify(bad, null, 2));
  console.log("wrote build/input_wedge_escrow_insolvent.json (balance = collateral - 1, honestly committed)");
}

// --- second bracket, same width, different V_hi -- for the leakage check ---
// (Step 5: two buyers with different V_hi but the same bracket WIDTH must be
// indistinguishable given only the public signals of the SAME public V_hi/
// V_lo -- this fixture instead demonstrates the complementary, expected
// case: a DIFFERENT bracket is, correctly, publicly distinguishable, because
// V_lo/V_hi are meant to be seen; see docs/open-a1-escrow.md §5.)
{
  const V_lo2 = 3800n, V_hi2 = 4200n; // width 400, same as [800,1200]
  const V2 = 4000n;
  const collateral2 = V_hi2 * p_star + 5000n;
  const r_esc2 = 909090909090n;
  const C_esc2 = hidingCommit(collateral2, r_esc2);
  const bal2 = collateral2 + 20000n;
  const r_bal2 = 171717171717n;
  const C_bal2 = hidingCommit(bal2, r_bal2);
  const second = {
    V_lo: V_lo2.toString(), V_hi: V_hi2.toString(), p_star: p_star.toString(),
    C_esc: C_esc2.toString(), C_bal: C_bal2.toString(),
    V: V2.toString(), collateral: collateral2.toString(), r_esc: r_esc2.toString(),
    balance: bal2.toString(), r_bal: r_bal2.toString(),
  };
  writeFileSync("build/input_wedge_escrow_same_width.json", JSON.stringify(second, null, 2));
  console.log("wrote build/input_wedge_escrow_same_width.json (different bracket, same width 400)");
}
