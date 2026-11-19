# 500: what we've learned so far

This summarises the experiments run with the strategy test bench (Nov 2026), and exactly what
information each computer player uses for each decision. The command lines and code layout are
in [README.md](README.md).

## How things are measured

- **Duplicate deals.** Every deal is played twice with the partnerships swapped, so both strategies
  hold the same cards. This removes most of the luck of the deal.
- **Points per deal** (from 0–0): the main measure for bidding, kitty and play changes that don't
  depend on the score. The ± figures are 95% confidence intervals.
- **Win-probability gain per deal** ("win mode"): each deal starts from a real mid-game score
  sampled from self-play games, and is scored by how much it changes each side's chance of winning
  the game. It uses a win-probability table (below). This is the right measure once the score matters.
- **Full games to 500**, also duplicated (same sequence of deals, teams swapped): the final check.
- Every opponent so far is from our own family of players, so "better" means better against these
  players, not necessarily against people.

## The players, strongest last

| player | what it adds | result |
|---|---|---|
| `random` | legal moves at random | — |
| `heuristic` | rule-of-thumb bidding and play | +155 pts/deal vs `random` |
| `tuned` | bolder suit bids, strict misère, wary of opponents' suits | +13 pts/deal, 58% of games vs `heuristic` |
| `tuned2` | trumps in second seat when void, better kitty discards, 6-level signal bids | +11 pts/deal, 55.5% of games vs `tuned` |
| `tuned3` | game-score bidding rules | 57.1% of games vs `tuned2` |
| `tuned4` | trick estimate fitted to playouts, bidding re-tuned around it | +9.0 pts/deal, 55.7% of games vs `tuned3` |
| `tuned5` | bidder keeps the last trump in reserve | +3.6 pts/deal, 51.0% of games vs `tuned4` |
| `tuned6` | guarded discards, defenders lead partner's suit, slightly bolder 7-level bids | +6.9 pts/deal, 50.9% of games vs `tuned5` |
| `tuned7` | probe-derived play: ruff low, overtake partner's non-boss card, duck a doubleton boss, stop drawing trumps without the top one | +6.6 pts/deal (two seeds), +0.7 win-prob pts/deal vs `tuned6` |
| `tuned8` | defenders keep the Joker on an opponent's trump lead (unless last), late top-trump lead | +5.2 pts/deal (two seeds), +0.5 win-prob pts/deal vs `tuned7` |
| `tuned9` | misère defence that keeps its low cards (play high when you must win the trick anyway, discard high) | +1.5 pts/deal (two seeds), +0.1 win-prob pts/deal vs `tuned8` |
| `tuned10` | misère bidder: lead low from the shortest suit early, discard from the shortest suit | +1.0 pts/deal (two seeds), +0.1 win-prob pts/deal vs `tuned9` |
| `tuned11` | the bidder draws trumps with its highest trump when it lacks the top one | +9.3 to +9.8 pts/deal (two seeds), +0.9 win-prob pts/deal vs `tuned10` |
| `tuned12` | defenders on lead from trick 3 with only 1–2 trumps out lead a low trump | +0.5 to +0.6 pts/deal (two seeds), +0.0 win-prob pts/deal vs `tuned11` |
| `tuned13` | the bidding side stops leading trumps once both opponents are out of them (shown out, or inferred from a high trump dropped under a winner) | +1.0 ± 0.2 pts/deal (also against the weaker field), +0.1 win-prob pts/deal vs `tuned12` |
| `tuned14` | no no-trump bids without an ace (the Joker alone isn't enough) | −0.1 ± 0.3 pts/deal, +0.2 ± 0.1 win-prob pts/deal (three seeds) vs `tuned13` |
| `tuned15` | misère: the bidder doesn't throw cards that can never win; defenders count the open misère hand and don't lead into the bidder's voids | +0.1 ± 0.0 pts/deal vs `tuned14`; open misère made 85.6% → 84.1% |
| `tuned16` | jump bids: bid straight to the highest level we'd play, but no higher than the cheapest bid that wins the game | +5.0 ± 0.5 pts/deal, +0.6 / +0.5 ± 0.1 win-prob pts/deal (two seeds) vs `tuned15`; +4.4 ± 1.3 vs the field |
| `tuned17` | stop drawing trumps when one is out and partner bid the trump suit (it's probably partner's) | +0.1 ± 0.1, +0.1 ± 0.0 pts/deal (two seeds), +0.0 ± 0.0 win-prob vs `tuned16` |
| `tuned18` | defenders win an opponent's top trump lead with the Joker (still keeping it under lower trumps) | +3.2 ± 0.2 pts/deal, +0.3 ± 0.0 win-prob vs `tuned17`; ±0.0 vs the field |
| `tuned19` | ruff partner's winning side card only with the lowest trump that wins; cash side winners from the top (A before K) | +4.0 / +3.9 ± 0.2 pts/deal (two seeds), +0.4 ± 0.0 win-prob vs `tuned18`; +4.9 ± 0.5 vs the field |
| `tuned20` | partner support by level: 1.25 when partner bid the strain at 6, 1.75 when higher (was 1.5) | +0.4 ± 0.2 pts/deal (three seeds), −0.1 ± 0.1 win-prob (two seeds) vs `tuned19`; +0.7 ± 0.9 vs the field. Adopted on the argument plus weak evidence |
| `sim:policy=tuned2` | simulation card play on top of `tuned2` | +29.6 pts/deal vs `tuned2` |

## What goes into each decision (current best: `tuned20`, and `sim` for card play)

### Bidding (`tuned4`–`tuned6`)

`tuned4` bids like `tuned3` below, with two differences. It uses the **fitted trick estimate** (see
"Calibrating the trick estimate" under What we learned), and its offsets are re-tuned to that scale:
aggression −0.5, signal bids at 4, +1 trick against a game-winning opposing bid, +1 when trailing an
opponent on 300+. Kitty discards still use the classic estimate. `tuned6` adds 0.25 tricks for bids
at the 7 level (but not 8+), because the estimate's spread is narrower for strong hands.

### Bidding (`tuned3`)

1. **Trick estimate for each strain** from the hand alone (the "classic" estimate):
   - Trumps: each trump scores 1 trick if we hold enough trumps to protect it from the higher ones
     we're missing, 0.5 if one short, 0.5 for the 4th and later trumps, otherwise 0.1. (The ladder is
     Joker, right bower, left bower, A, K, Q, …)
   - Side suits: A ≈ 0.9 (0.6 in a 6+ card suit), K ≈ 0.6 with the A, 0.35 guarded, 0.1 bare.
     With 4+ trumps, a void is worth 0.6 and a singleton 0.3.
   - No-trumps: Joker 1; A 1; K 0.8 with A, 0.45 guarded; Q 0.7 with A-K; long suits headed by
     the A score 0.6 per card beyond 4; −0.7 for each suit with no stopper.
2. **Add expected help:** partner 1.5 tricks, kitty 0.5, plus 0.75 tricks of general aggression.
3. **Adjust for the auction:**
   - in a strain partner has bid: +1.25 tricks if partner bid it at 6, +1.75 if higher;
   - −1.5 tricks in a strain an opponent has bid.
4. **Adjust for the game score:**
   - If partner holds the bid and making it wins the game, pass.
   - If the opponents hold a bid that would win them the game, +2 tricks.
   - If an opponent is on 300+ and ahead of us, +1.5 tricks.
5. **Bid** the cheapest legal bid in the strain whose ceiling (rounded-down estimate) is worth most.
6. **Signal bid:** if we would otherwise pass on our first turn and partner hasn't bid, bid 6 in
   any suit where our own hand is worth 2.5+ tricks.
7. **Misère:** count cards at risk. A card is risky if more lower cards in its suit are out than we
   hold below it, with one card of slack. Each void cancels one risk. Bid misère with at most 1 net
   risk (it's only legal after a 7 bid). Bid open misère with 0 risks.

### Kitty (`tuned3`, `tuned4`)

- Suit and no-trump contracts: try every 3-card discard from the non-trump, non-ace cards, and keep
  the one that leaves the highest trick estimate. So it voids a short suit when the estimate credits
  the void, which happens with 4+ trumps.
- Misère: throw the Joker first, then the riskiest cards, preferring to empty short suits.

### Card play, heuristic (`tuned3`–`tuned7`)

The player works out, for any card, whether it's **boss**: the top card left in its suit, given every
card it has seen (own hand, cards played, own discards, the open misère hand).

- **Bidders leading:** lead a boss trump (or the Joker) while opponents may still hold trumps; with
  3+ trumps, lead a low trump. `tuned5` never leads its last trump while any trump is unseen.
  `tuned7` doesn't lead a low trump when it lacks the top trump and only one trump is out. Then cash boss side cards. Otherwise lead low from the longest side suit.
- **Defenders leading:** cash boss side cards; otherwise lead low from the longest side suit.
  `tuned6` first leads partner's bid suit (if neither opponent is known to be void in it).
- **Unable to follow, not winning** (`tuned6`): throw a side card, avoiding boss cards and the small
  cards guarding a K or Q (e.g. keep both cards of K-x). Otherwise, the cheapest card.
- **Partner winning the trick:** play the cheapest card, unless partner's card is weak (below a Q) and
  we hold a boss that beats it. `tuned7` (not last to play): overtake any non-boss card with a boss,
  or else with our highest card of the suit that beats it.
- **Opponent winning:**
  - Last to play: win as cheaply as possible.
  - Otherwise, play a boss winner if we have one.
  - In second seat with a possible but uncertain winner: play low when we can follow, trump when void.
  - `tuned7`: when trumping in second or third seat, use the lowest trump (not the cheapest boss trump).
  - `tuned7`, defender second to the bidder's side-suit lead, holding the boss and one other card of
    the suit, defence still needing 2+ tricks: play the low card.
  - `tuned8`, defender holding the Joker and another trump when an opponent leads trumps, not last
    to play: keep the Joker and play the lowest other trump.
  - In third seat: win as cheaply as possible.
- **Misère:**
  - Bidder: play the highest card that still loses.
  - Defenders: play low before the bidder plays, and under the bidder when the bidder is winning.
    Against open misère, lead suits where the bidder's lowest card is above ours.

**Blind spots:** a "boss" card ignores the risk of being trumped, and ignores the Joker in no-trumps.
Known voids are only used by the simulation player. Options to fix the ruff blind spot exist
(`ruffAwareBoss`, `avoidBidderVoid`, `avoidPartnerVoid`) but didn't help; see below.

### Card play, simulation (`sim`)

For each legal card:
1. Deal the unseen cards 40 ways. Each deal must respect hand sizes, suits players have shown out
   of, and the open misère hand. It should also fit the auction: of 20 candidate deals, keep the
   first in which every bid and pass makes sense under the trick estimate (with 1 trick of leeway).
2. Play each deal out with the base heuristic for all four seats.
3. Score the result by this hand's point difference (default), or by game-win probability
   (`objective=win`).
4. Pick the card with the best average.

## What we learned

### Bidding

- **Aggression:** the original estimate was too timid. Adding 0.75–1 trick was best (+9 pts/deal);
  beyond 1.5 tricks it fell off sharply.
- **Misère:** the original rule made only ~50% of misère bids, worse than never bidding it. A strict
  rule that rewards holding the low cards or being void makes ~80% and gains ~2.5 pts/deal.
- **Reading the auction:** marking down a suit an opponent bid helps (+2.1 to +2.5). Ignoring the
  auction entirely costs 1.5. Reading partner's pass as weakness hurts (−2.2), and giving every
  strain a lift because partner bid also hurts.
- **Signal bids:** in black suits only, they make no difference. In any suit at 2.5 tricks they gain
  +2.2, rising to **+4.0** when partner gives the signalled suit 1.5 tricks. The side declares more
  and makes fewer contracts but scores more, so occasionally playing a weak 6 is worth what partner
  learns.
- **Game score** (in win mode, percentage points of game-win probability per deal):
  - Passing when partner's bid already wins the game: +0.2 (it's a rare situation).
  - Extra aggression against a game-winning opposing bid: +0.8 / +1.2 / +1.1 at 1 / 2 / 3 tricks.
  - Extra aggression only when our pass would end the auction: about the same, a little less.
  - Bolder bidding when trailing an opponent near 500: best overall. With +1.5 tricks when an
    opponent on 300+ is ahead of us, the combination reaches **+2.5**.
  - Caution when we're near 500 ourselves: no gain.
  - Aggression scaled smoothly by our win probability: +2.2. No better than the simple threshold rule.
  - Over full games, these rules alone win **57%** against the same player without them.

### Calibrating the trick estimate

- **Method.** On 200,000 random deals, each seat was made to declare each strain at the 7 level
  (everyone else passing), and the hand was played out by `tuned3`, kitty discard included. That
  gives 1M records of hand → tricks the declaring side took. A linear model on 21 suit features
  (each top trump, trump length, side aces and kings, voids and singletons with 4+ trumps, …) and
  13 no-trump features was fitted to them, weighted to hands near the bidding range
  (`src/calibrate.ts`, `src/fit-estimate.ts`, `src/strategies/features.ts`).
- **The old estimate was mis-scaled.** Actual tricks ≈ 4.5 + 0.64 × old estimate. The hand's own
  cards were over-counted relative to each other, and partner plus kitty are worth about 3–4 tricks
  to an average hand, not the 2 assumed.
- **What the fit says each card is worth** to the side, in suit contracts (on top of a baseline of
  about 3.2 tricks): Joker 0.75 + 0.52 for being a trump, right bower 0.55 + 0.52, left bower
  0.38 + 0.52, trump A 0.21 + 0.52, K 0.11 + 0.52, any other trump 0.52 (less beyond 6 trumps). Side
  ace 0.52, side K with the A 0.39, guarded K 0.2, bare K 0.06. A void is worth about 0.24 and a
  singleton 0.16 with 4+ trumps, and almost nothing otherwise. In no-trumps the Joker is worth 1.5,
  aces 0.67, K with the A 0.66, guarded K 0.49, and each card beyond 4 in an ace-headed suit 0.41.
- **It only explains part of the result.** The typical error is about 1.5 tricks (1.6 with the old
  estimate) because partner's hand and the kitty are unknown. That's why bidding needs a margin.
- **Using it.** Swapping in the fitted estimate and re-tuning the offsets: aggression −0.5 (an
  expected 6.5 tricks to bid 6), signal bids at 4. That gives +9.0 ± 1.7 pts/deal against `tuned3`. Re-tuning
  the score rules on the new scale (desperation 1, trailing boost 1) gave +2.5 points of win
  probability per deal, and **55.7% ± 0.9 of full games**. Results are very sensitive to the offset:
  0 instead of −0.5 is −10 pts/deal.
- The simulation player gains about the same from it: `sim:policy=tuned4` vs `sim:policy=tuned3`
  +9.2 ± 8.1 pts/deal (2000 deals, so noisy, but in line with the heuristic result).
- **Extended calibration (with `tuned5`):**
  - *Refit with `tuned5`'s play:* every coefficient within about 0.04 of the first fit, so the
    embedded estimate stands.
  - *Simulation player:* playing all four seats on 2,000 of the same forced contracts, its
    declarers take −0.07 ± 0.06 tricks fewer than heuristic play. Better play helps defence as much
    as declaring, so the estimate is calibrated for simulation self-play too.
  - *Chance of making each level:* outcomes spread about ±1.6 tricks around a predicted 6, ±1.2
    around 8, and ±0.8 around 9, so strong hands need less margin. Separate offsets by level:
    7-level bids 0.25 tricks bolder gain +3.1 ± 1.2 pts/deal; 8-level changes don't help.
  - *What the auction adds* (39,335 real `tuned5` contracts, actual tricks minus the hand-only
    prediction):
    - partner bid this strain: +1.1 (the bidding uses 1.5, which the sweeps still prefer);
    - partner bid another strain: +0.16;
    - partner passed: 0 (the bidding correctly ignores it);
    - each strain the opponents bid: −0.11.
    
    Success by level: 86% at 6, 82.5% at 7, 81.6% at 8.
- The fitted estimate did not help kitty discards (−0.7), and partner's-suit support is still best
  at 1.5 tricks (1: +5.7, 2: −14.8, against +9.0).

### Kitty

- Discarding is mostly obvious, as expected. Trying every discard and keeping the best estimate gains
  +0.8. A moderate pull toward voiding short suits gains +0.7. Allowing aces to be discarded costs 6.5.

### Card play

- **Big essentials:** bidders must draw trumps (−44 if they never do) and cash side winners (−22).
  Defenders should cash their winners (−9.8 if they never do).
- **Second seat:**
  - Playing low when you can follow is right: about 1.6 pts/deal better than trying to win, and the
    simulation player plays low 62% of the time there.
  - Trumping in when you're void is worth **+5.6**. The original rule wrongly played low there.
- **No help:** defenders leading trumps (−2.9), leading singletons (+0.2), steering leads by known
  voids (−0.8), throwing from the shortest suit (−1.0), or delaying when defenders start cashing.
- **Holding back aces:** the simulation player holds back a lot (it cashes only 25% of the time in the
  first four tricks), but forcing it to cash early made no measurable difference (−2.1 ± 4.2). It's a
  wash on average. The idea only makes sense against high bids, as discussed: against 6–7, holding an
  ace rarely turns into enough control to set the contract, and against 9 you just take the trick.

### Voids, ruffs and defenders' leads

The hypothesis: defenders should never lead a suit the bidder has shown out of (while trumps are
still out), and rarely one the bidder's partner has shown out of. A "boss" card in a suit an
opponent is void in isn't really boss.

- It's common: about 16% of defenders' side-suit leads by `tuned3` go into a suit the bidder may
  ruff. When the defender had a safe alternative, `tuned3` led into the void 49% of the time, and the
  simulation player 44–54% (183 cases).
- Avoiding the bidder's void entirely: −0.5 ± 0.3 pts/deal. Also avoiding the partner's void adds nothing.
  Avoiding it only when cashing a winner: −0.3. Not treating such cards as boss when leading: −0.9.
  When following: +0.1 (neutral). All 40,000 deals against `tuned3`.
- So in this engine the rule doesn't help. Possible reasons:
  - Making the bidder ruff costs them a trump, which matters with only 5–6 between the bidder and partner.
  - The safe alternative is often a suit where the defender's lead gives away a trick (leading away from a K).
  - The simulation player's playouts use the same heuristic, so its agreement is only partial evidence.
  
  A targeted test would compare the two leads directly in the positions where both are possible.
- **Is it because the bidder has run out of trumps?** Mostly no. These leads come late (almost all
  at tricks 6–10). The bidder ruffs 71–74% of them, and is out of trumps in about 20% of cases,
  mostly at tricks 9–10.
- **Bidder holding back a trump.** Prompted by that, bidders were stopped from leading their last
  trump(s) while trumps are out:
  - keeping 1: **+3.6 ± 0.6 pts/deal** and 51.0% ± 0.4 of games against `tuned4` (now `tuned5`);
  - keeping 2: +1.2;
  - keeping 1 only while 2+ trumps are unseen: +1.1. Drawing the "last" outstanding trump is worse,
    perhaps because unseen trumps may be partner's.

  With the reserve, the bidder is out of trumps for only 12% of void leads (from 21%). Even so,
  defenders avoiding the bidder's void adds nothing on top (+0.2).

### Defence

- **Guarded discards:** +1.9 pts/deal when defenders use them, +3.0 when both sides do. When you
  can't follow and aren't winning, keep boss cards and the guards of a K or Q, rather than throwing
  the cheapest card.
- **Lead partner's bid suit:** +0.6 after cashing winners, +0.8 before. With signal bids, partner's
  6-level bid often shows a suit rather than a contract, so it pays to listen. With guarded discards
  as well: +3.7 ± 0.6.
- **No help:** avoiding the suits partner has discarded from (−0.3), or preferring them (+0.2).
- Over full games these play changes are worth about +0.3 points of win probability per deal.

### Single-decision probes

`src/probe.ts` finds decision points in real `tuned` self-play that match a situation described
in `src/probe-situations.ts`. At each one it tries every candidate card on the same deal. Each line
is then played out by the same player in all four seats. Everyone sees only their own cards; the
hidden cards are the real ones. The result is points for the deciding side. Each comparison is
paired: same deal, same position, one card different. It is cheap: 400k deals give about 460k
positions in under two minutes. The tables below come from 400k deals with `tuned7` for both the
decision and the play-out (`npx tsx src/probe.ts report …` prints them in full).

**Your case: defender on lead, bidder void in X (not out of trumps), I hold A + small of X.**

| | low X vs boss of X | n |
|---|---|---|
| bidder plays 2nd, any trick | +1.0 ± 0.8 | 12,335 |
| bidder plays 2nd, trick 5–6 | +2.4 ± 1.7 | 3,403 |
| bidder plays 2nd, trick 5–6, A + 9 or lower | +5.5 ± 4.3 | 605 |
| bidder plays 4th, any trick | −6.1 ± 1.1 | 19,280 |
| bidder plays 4th, trick 5–6, A + 9 or lower | −6.4 ± 5.9 | 1,138 |

- With the bidder on your left (playing 2nd), the low card is slightly better. The bidder ruffs
  either way, and the Ace survives to win later. With the bidder on your right, cash the Ace. The
  bidder's partner plays second and may win a low lead cheaply.
- Leading a low card of another suit instead is no better on average (−5 vs the boss of X).
  Leading a trump is clearly worse (−12). So "never lead into the bidder's void" isn't right as it
  stands. The bidder ruffs, but it costs the bidder a trump, and the alternatives give tricks away.
- Bidder's partner void (bidder not): boss of X beats low X by 6.6 ± 2.2.

**What the bidder does when void, playing second** (111k positions):

| | discard vs ruff low | ruff high vs ruff low |
|---|---|---|
| boss led (e.g. the Ace) | −35 to −150 in most sub-cases | −2 to −18 |
| low card led (e.g. the 9) | −14 to −95 in most sub-cases | −1 to −15 |
| low led, bidder's last trump, 1–2 trumps out | −22 to +7 (not significant) | — |

- Ruff with the **lowest** trump, whatever was led. Discarding is almost never right, even with the
  last trump. The one near-even case is a low card led when the bidder holds one trump and one or
  two are still out.
- `tuned6` often ruffed with its cheapest *boss* trump, which cost about 10 points in those spots.

**Other situations** (relative to the first option; ✓ = now `tuned7`'s rule):

| situation | finding |
|---|---|
| bidder on lead with the top trump, 1–2 trumps out | lead the top trump: low trump −25 to −30, side winner −3 to −7 |
| bidder on lead without the top trump, 1 out | lead a side card instead of a low trump: +10 to +23 ✓ |
| … 2 out, no side winner | side card +7, not yet a rule (the blanket version, `noBossTrumpLead=2`, was −0.2) |
| defender second to the bidder's lead, holding the boss + one other | duck: +6 to +10 when defence needs 2+, +10 to +28 if the bidder's partner is void ✓; with 3+ cards, about even; needing 1 trick, win it (−54 to −77 for ducking) |
| defender third, partner's card winning but not boss | overtake with the highest: +13 vs playing low ✓ |
| bidder's partner on lead | a boss side card beats the top trump by about +6; low trump −4 |

**Turning these into rules** (each vs `tuned6`, 40k deals): `ruffLow=1` (2nd seat) +2.4, `ruffLow=2`
(2nd and 3rd) +3.4; `overtakePartner=1` +1.5, `=2` +2.2; `secondHandDuck=1` +0.8 (`=2` same);
`noBossTrumpLead=1` +0.3 (`=2` −0.2, `=99` −8.6). All four together are `tuned7`: +6.6 ± 0.8 on seed 1
and seed 2, and +0.7 ± 0.1 win-probability points per deal.

**Discards while the bidder draws trumps** (`tuned7`, 400k deals; 208k defender and 114k
bidder's-partner positions). Out of trumps, holding 2+ side suits, compared with throwing the
lowest card:

| discard | defender | bidder's partner |
|---|---|---|
| from the shortest suit | −2.4 ± 0.2 | −2.4 ± 0.2 |
| from the longest suit | +0.4 ± 0.2 | +0.5 ± 0.1 |
| lowest non-boss card | 0.0 | 0.0 |
| from a suit an opponent is void in | +1.4 ± 0.4 | −0.2 ± 0.3 |
| from a suit partner threw / partner didn't throw | −0.5 / 0.0 | −0.9 / +0.1 |
| `tuned7`'s own choice (guarded discards) | +0.7 ± 0.1 | +0.4 ± 0.1 |

- Shortening a short suit (the "make a void" instinct) is the one clear mistake. The other options
  are within about a point of each other.
- Two rules built from this did nothing against `tuned7`: prefer suits an opponent is void in
  (`discardOppVoid` 3/6/15: +0.2, +0.2, +0.1) and prefer the long suit (`discardLong` 0.5/1.5: −0.1,
  −0.5). The guarded-discard rule is already about as good as a simple discard rule gets.

**The no-trumps Joker** (84k lead positions, 89k follow positions).

- *Leading it:* hold it. Leading the Joker early instead of a side winner or a low card costs
  36–90 points, whatever suit is named. Even late in the hand it is never clearly better.
  `tuned7` never leads it until it is the last card, which is right.
- *Naming a suit* (when it is led): name your **longest** suit. That strips the others of your suit
  and sets up your remaining cards. On the same positions the order is longest > shortest held >
  an opponent's void > a suit you're void in. The default naming (the suit you hold fewest of,
  often a void) is the worst. In the heuristic this almost never matters, since the Joker is only
  led as the last card.
- *Following, void in the led suit:* if an opponent is winning, play the Joker. The bidder loses
  25–70 by discarding instead. For a defender it's roughly even (−12 to +1), because the defence
  often wins the trick later anyway. If partner is winning, discard: playing the Joker on
  partner's trick costs 10–250, mostly from wasting the Joker and taking the lead from partner.
  `tuned7` already does all of this.

**The Joker in trump contracts, and defenders leading trumps** (`tuned7`, 400k deals, seed 4).
Points for the defenders.

*The bidder leads a trump; a defender holds the Joker and another trump* (60k positions):

| Seat, cards | low trump vs Joker | cheapest non-Joker winner vs low trump | `tuned7` played the Joker |
|---|---|---|---|
| 2nd, another trump could win | +53.1 ± 2.1 | −6.5 ± 0.9 | 90–96% |
| 2nd, only the Joker can win | +69.4 ± 6.2 | – | 90–96% |
| 4th, another trump wins | +68.4 ± 3.0 | +45.4 ± 2.1 | 29% (policy +116 vs Joker) |
| 4th, only the Joker wins | +11.6 ± 2.8 | – | (policy +19.5 vs Joker) |

Spending the Joker second hand on the bidder's trump lead was `tuned7`'s biggest remaining
mistake. The Joker beats the bidder's top trumps later anyway, so taking a low trump with it
throws away a trick. `tuned7` played it because a Joker is always a "boss winner". Rule
`jokerDuck` (not last to play: keep the Joker, play the lowest other trump): +4.9 ± 0.5 on its own
(`=1`, bidder's lead only, and `=2`, either opponent's lead, are the same).

*Ruffing with the Joker available* (defender void, opponent winning, 5.7k positions): ruff with
the lowest trump that wins (+61 vs the Joker, +30 vs discarding). `tuned7` already does.

*Leading the Joker* (defender on lead, 20k positions): hold it. Leading it costs 35 on average
(−45 to −75 with other trumps held, early), and so does leading a low trump. `tuned7` already holds it.

*Defender on lead holding trumps, no Joker* (126k positions), vs "cash a side boss, else lead low
from the longest side suit":

| Case | low trump | top trump |
|---|---|---|
| tricks 1–3, 1 trump | −3.5 ± 1.3 | same card |
| tricks 1–3, 2 trumps | −15.0 ± 1.6 | −16.5 ± 1.6 |
| tricks 1–3, 3+ trumps | −23.6 ± 2.5 | −31.7 ± 2.6 |
| tricks 4–6, 1 trump, need 3+ | +5.9 to +10.6 | same card |
| trick 7+, 1 trump, need 2+ | +22 to +38 | same card |
| trick 7+, 1 trump, need 1 | −43 ± 8 | same card |
| trick 7+, 2 trumps, need 3+ | +44.5 ± 12.0 | +61.8 ± 12.0 |

Early on, defenders shouldn't lead trumps; that just does the bidder's drawing. Late, with the
defence needing 2+ tricks, leading a last trump or two pulls the bidder's remaining trumps so the
side-suit cards can make. Rule `lateTrumpLead=7` (from trick 7, defence needing 2+, 1–2 trumps,
no Joker: lead the top trump): +0.4 ± 0.2 (`=8` +0.3). Leading the shortest side suit instead of the
longest was −1.5 overall, never clearly better.

`tuned8` = `tuned7` + `jokerDuck=2` + `lateTrumpLead=7`: +5.2 ± 0.6 on seeds 1 and 2, +0.5 ± 0.1
win-probability points per deal (seed 3, win mode).

*Re-tuning the bidding for `tuned8`.* Since defenders now keep the Joker, contracts might be harder to
make, so the bidding thresholds might need to change. They don't (40k duplicate deals each, vs `tuned8`):

| Change | pts/deal |
|---|---|
| `aggression` −0.75 / −0.6 / −0.4 / −0.25 / 0 (now −0.5) | −1.4 / −0.3 / −2.2 / −9.6 / −33.0 |
| `aggression7` 0 / 0.15 / 0.35 / 0.5 (now 0.25) | −1.7 / −0.6 / −1.1 / −7.6 |
| `aggression8` −0.5 / 0 (now −0.25) | −1.4 / −0.2 |
| `signalBid` 3.5 / 4.5 (now 4) | −1.3 / −2.1 |
| `misereDanger` 0.5 / 1.5 (now 1) | −0.9 / 0.0 |
| `partnerSupport` 1 / 1.25 / 1.75 (now 1.5) | −2.0 / +1.0 ± 0.6 (two seeds) / −7.2 |

Only `partnerSupport=1.25` is plausibly better, and it's within noise: +1.0 ± 0.6 pooled over two
seeds, +0.1 ± 0.1 win-probability points. `tuned8` keeps the `tuned7` bidding. The aggression
optimum is sharp: a quarter-trick bolder costs 10 points a deal.

**Misère defence** (`tuned8`, 4M deals, misère hands only: 375k lead, 324k follow and 143k discard
positions; several per hand). Points for the defenders. A defender's *bottom* card is one with no
unseen card below it in its suit; it is *live* if the bidder may still hold that suit.

The weapon is the bottom card: lead it when the bidder has to follow, and the bidder must win.
`tuned8` was wasting it, by always following and discarding with its lowest card.

*Following suit*, vs playing the lowest card:

| Position | highest card | note |
|---|---|---|
| bidder led, I'm 2nd, can't go under its card, hold a bottom, tricks 1–3 | **+108** | I win the trick anyway: win it high, keep the bottom |
| same, no bottom | +13 | |
| bidder led, I'm 2nd, *can* go under, hold the bottom, tricks 1–3 | **+81** | ducking with the bottom only works if partner can duck too |
| 3rd, bidder winning, can't go under, hold a bottom, tricks 1–3 | **+124** | as above |
| 3rd, partner already beating the bidder, hold a bottom, tricks 1–3 | **+79** | shed high cards |
| same, no bottom | +22 | |
| 3rd, bidder winning, can go under | −284 to −328 | of course: highest-under keeps the bidder winning (`tuned8` does) |
| partner led, bidder last, can't go under partner's card | −8 to −60 | keep the trick's top card low so the bidder can't duck (`tuned8`'s lowest is right) |

From trick 4 on, the differences are mostly within ±7.

*Discarding (void):* the highest card beats the lowest by +31 (partner winning, early, holding a
live bottom), +11 to +14 in other early cases, about 0 later. Keeping live bottoms out of the
discard made no further difference, since the highest card is almost never a bottom.

*Leading*, vs the lowest card:

| Option | bidder plays 2nd | bidder plays last |
|---|---|---|
| bottom card of a live suit | +1.6 (tricks 1–3), +4.4 (4–6) | +0.4, +2.2 |
| strip: top card of a live suit where I hold the bottom | −30 (tricks 1–3) | **+9 to +11** (tricks 1–6) |
| top card of a suit where I hold the 2nd-lowest | −16 to −31 | −12 to −20 |
| low in a suit partner is void in | −26 early, +7 late | −21 early, +8 late |
| highest card | −11 to −24 | −2 to −14 |
| low in shortest / longest suit | −13 / −13 | −7 to −15 / −4 |

When the bidder plays directly after me, the bottom card is a sure kill if the bidder has the suit:
the bidder must play above it. When the bidder plays last, partner plays in between and can spoil
it by having to play high. There it pays early on to lead the *top* of the suit first. The bidder
ducks under it, using up a low card, and that sets up the bottom card for later.

As rules (`misereDef` bit flags; 80k duplicate deals, vs `tuned8`):

| Rule | pts/deal |
|---|---|
| 1: when you must beat the bidder's card anyway, or partner already has, play your highest; when the bidder leads and you hold the bottom, play your highest | +1.4 ± 0.2 |
| 2: discard your highest | +0.1 ± 0.1 |
| 4: lead the bottom card of a live suit | +0.1 ± 0.0 |
| 8: bidder last, tricks 1–6: lead the top of a live suit where you hold the bottom | +0.0 ± 0.1 |
| 1+2+4 (= `tuned9`) | +1.6 ± 0.2 (seed 1), +1.5 ± 0.2 (seed 2); +0.1 ± 0.0 win-prob |

Misère is only about 2% of hands, so +1.5 a deal is a large gain per misère hand. Misère bidding
didn't need re-tuning for the stronger defence: `misereDanger` 0.5/1.5 and `misereSlack` 0.5/1.5 were
all no better.

**The misère bidder's own play** (`tuned9` everywhere, 4M deals, misère hands only: 105k lead,
82k follow and 242k discard positions). Points for the bidder. A card's "below" count is the
number of unseen cards in its suit lower than it. Against `tuned9`'s defence, `tuned9`'s misères made only 60%
(76% against `tuned8`'s).

*Leading*, vs the lowest card:

| Option | tricks 1–3 | tricks 4–6 | tricks 7+ |
|---|---|---|---|
| low in the shortest suit | **+24 to +33** | −0.5 to −1.5 | ≈0 |
| low in the longest suit | −6 to 0 | +0.4 to +1.8 | +1 |
| safest card (most unseen below it) | −80 to −226 | +4 to +8 | +3 to +6 |
| unblock: highest card with 2+ / 3+ unseen below | −115 to −238 | +7 to +10 | +4 to +5 |

Early on, shorten a suit so that you can discard into it later. Getting rid of high cards
early is a disaster, because the defenders still hold the low cards to lead under them.
From trick 4, getting rid of a high card while 2+ cards are still out below it gains 4 to 10.

*Following suit* with 2+ cards under the winning card: the highest of them (the current rule)
beats the lowest by 2 to 22 and the second-highest by 1 to 10. It's right everywhere.

*Discarding (void)*, vs the highest card: the top card of the shortest suit is +14 to +18 in
tricks 1–3, +3 to +6 in tricks 4–6, and 0 later. Throwing the most dangerous card (fewest below)
costs 20, and throwing the lowest costs 23. So again, emptying a short suit is what matters.

As rules (`misereBid` bit flags; 80k duplicate deals, vs `tuned9`):

| Rule | pts/deal | misères made |
|---|---|---|
| none (`tuned9`) | – | 60% |
| 1: tricks 1–3, lead low from the shortest suit | +0.6 ± 0.2 | 66% |
| 2: from trick 4, lead the highest card with 2+ unseen below | +0.0 ± 0.0 | 60% |
| 4: discard the top card of the shortest suit | +0.3 ± 0.1 | 63% |
| 1+4 (= `tuned10`) | +1.0 ± 0.2 (seeds 1 and 2); +0.1 ± 0.0 win-prob | 70–71% |

Misère bidding was re-checked for `tuned10` and doesn't need to change:

| Change | pts/deal (vs `tuned9`) | misères bid |
|---|---|---|
| `tuned10` as is | +1.0 | 1590 |
| `misereDanger=2` | +0.5 ± 0.5 | 4258 |
| `misereSlack=2` | −1.1 ± 0.5 | 5239 |
| `misereDanger=0.75` | +0.6 ± 0.3 | 468 |
| `misereSlack=0.75` | +0.6 ± 0.3 | 290 |
| `misereVoidCredit` 0.5 / 1.5 | +0.8 / +0.9 | 650 / 1624 |

**The misère kitty discard** (`src/probe-discard.ts`; `tuned10`, 4M deals, 78k misère hands).
Each hand is played out once per discard rule, on the same cards. Bidder's points, vs `tuned10`'s
discard. That rule throws the Joker first, then the cards with the most "excess" (lower cards of the
suit held by others, minus lower cards we hold), with ties broken toward short suits.

| Discard rule | all hands | open misère |
|---|---|---|
| the same, without the short-suit tiebreak | +0.6 ± 0.8 | +20 to +42 (n≈1.5k, ±15–18) |
| excess, with a strong short-suit bias | −9.4 ± 0.7 | −11 to −17 |
| most unseen cards below (raw danger) | −34.6 ± 1.4 | |
| top card of the shortest suit, repeatedly | −38.5 ± 1.3 | |
| highest, then short suits | −69.1 ± 1.7 | |
| void a suit of ≤3 cards, then the highest | −89.3 ± 1.7 | |
| three highest cards | −117.0 ± 1.9 | |
| best of all eight, chosen with hindsight | +46.6 ± 1.0 | |

The current discard is already the best of these. Voiding a suit with the discard is a large
mistake (−89), even though making voids *in play* is right (`tuned10`'s leads and discards). A
void made in the kitty costs low cards you need, while a void made in play costs cards that
were going to be discarded anyway. The one hint is open misère, where dropping the short-suit
tiebreak looks better, but that's too few hands to act on. No new player.

**The bidder's trump drawing, and the bidder's partner's Joker** (`tuned10`, 400k deals, seed 8).

*Bidder on lead with 3+ trumps (the Joker counts) and 4+ trumps out* (288k positions, almost all
in tricks 1–3), vs leading the top trump:

| Bidder's trumps | low trump | second-highest | side boss or low side | `tuned10` |
|---|---|---|---|---|
| hold the boss trump | −21 to −53 | −3 to −10 (0 when holding 2+ bosses) | −2 to −10 | leads the top: right |
| **no boss trump** | **−23 to −36** | −7 to −13 | −26 to −41 | **leads the lowest: wrong** |

Without the top trump, `tuned10` led its lowest trump. Leading its highest is better by 23–36.
That forces out the defenders' top trump early, while the bidder still has trumps to spare, so
the bidder's remaining trumps become boss. Rule `drawHigh`: +9.8 ± 1.0 (seed 1), +9.3 ± 1.0
(seed 2), +0.9 ± 0.1 win-probability points (seed 3, win mode). It's the largest single gain since
the trick-estimate fit. Bidding needed no change: `aggression` −0.4 gave +8.7 and −0.25 gave +3.5,
and `aggression7=0.35` gave +9.9 ± 1.4, against +9.3 for `drawHigh` alone on the same seed.

*The bidder leads a lower trump; the bidder's partner holds the Joker and another trump* (34k):

| Situation | Joker vs low trump | cheapest winning non-Joker vs low trump | `tuned10` |
|---|---|---|---|
| bidder winning, but not with the boss | **+75 ± 4** | +13 ± 2 | plays low 90% |
| opponent winning | +73 ± 3 | +32 ± 2 | plays the Joker 89%: right |

Rule `partnerJoker` (play the Joker on the bidder's non-boss trump lead): +2.3 ± 0.4 alone, but
with `drawHigh` it adds nothing (−0.3 to −0.4). The bidder now leads its top trump, so this
situation rarely comes up. It is left off.

*The bidder's partner on lead with the Joker* (9.6k): leading it is +11 to +28 against a side
card. `tuned10` already does that.

**Trump drawing later in the hand** (`tuned11`, 400k deals, seed 9). The bidder is on lead after
trick 1 with trumps and side cards, and 1–3 trumps are still out. This probe fires once per hand
for each of 1, 2 and 3 trumps out (339k positions). The table is relative to leading the top trump:

| Bidder's trumps | low trump | side boss or low longest side | low shortest side | `tuned11` |
|---|---|---|---|---|
| hold the boss trump (any count ≥ 2) | −28 to −50 | −3 to −17 | −1 to −26 | leads the top (or another boss): right |
| no boss, 3+ trumps, 2–3 out | −3 to −5 | −1 to −5 | −7 to +2 | leads the top: right |
| no boss, 3+ trumps, 1 out | 0 | +5 to +15 | +4 to +19 | holds, leads side: right |
| no boss, 1–2 trumps | −5 to 0 | +8 to +107 | 0 to +107 | leads side: right |
| a single trump, even the boss | – | +10 to +71 (−9 with 3 out, n.s.) | similar | leads side: right |

`tuned11` already picks the best play, or one within noise of it, in every sub-case. With a side
winner, cashing it beats a low card from the shortest suit by up to 12. Without one, the shortest
suit is +1 to +4 better than the longest, which is within noise. No new rule.

**The defenders' first lead** (`tuned11`, 400k deals, seed 10). The first time a defender is on
lead in a trump contract (222k positions). Relative to leading a side winner, else the low card
of the longest side suit:

- `tuned11` is best, or within noise of the best, in nearly every sub-case. It cashes a side winner
  when it has one, otherwise leads low from its longest suit, or partner's bid suit.
- Top of the longest suit: −1 to −17. Low shortest (looking for a ruff): −16 to +10, never clearly
  better. Partner's bid suit: −9 to +10, about level overall (+1.9 ± 0.8).
- **A low trump** is bad early, with 3+ trumps out (−8 to −29). But **from trick 5 on, with only
  1–2 trumps out, it beats everything else by about 25 to 45**, even when the defender holds a
  side winner (+30 ± 8 to +45 ± 15). `tuned11` led a trump there only 0–27% of the time.

Rule `fewTrumpsLead=N`: a defender on lead from trick N, holding a non-Joker trump, with 1–2 trumps
still out, leads its lowest trump, before cashing side winners. It applies to every defender lead,
not just the first. Sweeps against `tuned11`:

| variant | seed 1 | seed 2 |
|---|---|---|
| from trick 5 | +0.3 ± 0.2 | |
| from trick 5, after cashing side winners | −0.3 ± 0.2 | |
| from trick 5, highest trump | +0.4 ± 0.2 | |
| from trick 3 | **+0.5 ± 0.3** | **+0.6 ± 0.2** |
| from trick 3, highest trump | | +0.6 ± 0.2 |
| from trick 1 (low or high) | | +0.6 ± 0.2 |
| from trick 7 | +0.3 ± 0.2 | |

`tuned12` = `tuned11` + `fewTrumpsLead=3`. In win mode (seed 3) the gain is +0.0 ± 0.0: the
positions are rare, so the effect is real but small. Leading the trump only after cashing side
winners loses the gain (−0.3). A likely reason is that the trump lead pulls two bidder-side trumps
for one, so they can't ruff the defenders' winners later, but that hasn't been tested directly.

### Neutral rules against weaker opponents

Rules that tested neutral against the best player might still help against weaker ones. If so,
adding them would be weakly dominant. `src/field.ts` tests this: each deal is played in duplicate
by (variant vs opponent) and by (`tuned12` vs opponent), with the opponent rotating through
`heuristic`, `tuned` … `tuned10`. The difference is paired on the same cards. Below: 80k deals
against the field (seed 1), and 60k against `tuned12` itself, in pts/deal.

| rule added to `tuned12` | whole field | `heuristic`–`tuned5` | `tuned6`–`tuned10` | vs `tuned12` |
|---|---|---|---|---|
| `leadSingleton` | −0.3 ± 0.5 | −0.2 ± 0.6 | −0.3 ± 0.7 | −0.1 ± 0.5 |
| `ruffAwareBoss=2` (following) | −0.1 ± 0.1 | −0.1 ± 0.2 | −0.2 ± 0.2 | −0.1 ± 0.1 |
| `ruffAwareBoss=3` (also leading) | −1.1 ± 0.3 | −1.4 ± 0.4 | −0.7 ± 0.4 | −0.6 ± 0.3 |
| `avoidBidderVoid=100` | −0.4 ± 0.2 | −0.7 ± 0.3 | −0.1 ± 0.4 | −0.0 ± 0.3 |
| `avoidPartnerVoid=2` | +0.1 ± 0.1 | +0.1 ± 0.2 | +0.1 ± 0.2 | +0.1 ± 0.2 |
| `avoidPartnerDiscards=-2` (prefer them) | +0.1 ± 0.2 | +0.1 ± 0.2 | +0.1 ± 0.3 | −0.0 ± 0.2 |
| `discardOppVoid=3` | −0.0 ± 0.2 | +0.0 ± 0.2 | −0.0 ± 0.3 | −0.1 ± 0.2 |
| `discardLong=0.5` | −0.2 ± 0.1 | +0.0 ± 0.2 | −0.4 ± 0.2 | −0.1 ± 0.2 |
| `partnerJoker` | −0.3 ± 0.2 | −0.3 ± 0.3 | −0.2 ± 0.3 | −0.3 ± 0.2 |
| `misereDef=15` (strip lead) | −0.1 ± 0.1 | −0.1 ± 0.2 | −0.0 ± 0.2 | +0.1 ± 0.2 |
| `misereBid=7` (unblock from trick 4) | 0.0 | 0.0 | 0.0 | 0.0 |
| `noBossTrumpLead=2` | −0.7 ± 0.3 | −0.4 ± 0.4 | −1.1 ± 0.5 | −1.0 ± 0.4 |
| `partnerSupport=1.25` | −0.9 ± 0.6 | −0.9 ± 0.9 | −0.8 ± 0.9 | −1.3 ± 0.7 |
| `misereVoidCredit=1.5` | −0.1 ± 0.1 | −0.1 ± 0.1 | −0.1 ± 0.1 | −0.1 ± 0.1 |
| `secondHandDuck=2` | 0.0 | 0.0 | 0.0 | 0.0 |

None is weakly dominant. Against the weaker field each rule does about what it does against
`tuned12`, and the weakest opponents don't change the picture. Avoiding the bidder's void is
slightly *worse* against weak players (−0.7). The two +0.1s (`avoidPartnerVoid`, preferring
partner's discarded suits) are too small to separate from zero. `misereBid=7` and
`secondHandDuck=2` never change a card on top of `tuned12`'s other rules. Some former neutrals
(`noBossTrumpLead=2`, `partnerSupport=1.25`, `partnerJoker`) are now mildly negative, since
`tuned12` already covers those spots differently.

### Stopping the trump draw (`tuned13`)

Spotted in play: the bidding side kept leading trumps after both opponents had shown out. The
check for "trumps still out" counted every unseen trump, including partner's. Over 20,000 deals
of `tuned12` self-play (`src/probe-draw.ts`), at bidding-side leads holding a trump:

| situation | leads | led a trump | opponents really had a trump |
|---|---|---|---|
| both opponents shown out of trumps | 7,251 | 21% | 0% |
| ...or one dropped a losing trump with no unseen trump above it | 2,698 | 35% | 0% |
| ...the same with one unseen trump above it | 13,259 | 32% | 59% |
| everything else | 46,336 | 72% | 94% |

The inference works because a defender who can't win the trick plays its lowest card, so any trumps
it has left must outrank the one it dropped. Allowing one higher unseen trump is too loose.
`drawStopVoid` (stop once both opponents are out) gains +0.6 ± 0.2 pts/deal; adding the inference
(`drawInferOut=1`) makes it +1.0 ± 0.2 against `tuned12`, +1.0 against `heuristic`–`tuned5` and +0.9
against `tuned6`–`tuned10` (60k deals each), and +0.1 win-prob pts/deal in win mode. Against people,
who sometimes drop a high trump to mislead, the inference can be wrong; a low trump never triggers it.

### No-trumps without an ace (`tuned14`)

Spotted in play: the computer suggested 6NT on the Joker and two kings with no aces. The fitted NT
estimate is linear, so the Joker (+1.5 tricks) and guarded kings (+0.5 each) can add up to a 6-level
bid without any ace. Over 50,000 deals of `tuned13` self-play (`src/probe-nt.ts`), no-trump contracts
by the bidder's hand before the kitty:

| bidder held | contracts | made | avg score | tricks over the bid |
|---|---|---|---|---|
| Joker, no aces | 1,156 | 69% | +63 | +0.17 |
| Joker, 1 ace | 4,300 | 82% | +106 | +0.79 |
| Joker, 2 aces | 3,158 | 87% | +121 | +1.21 |
| no Joker, 1 ace | 817 | 70% | +85 | +0.18 |
| no Joker, 2 aces | 1,722 | 75% | +105 | +0.53 |

Requiring a real ace for any NT bid (`ntMinAces=1`) is neutral on points (−0.1 ± 0.3 against
`tuned13`, −0.2 and −0.1 against the two halves of the weaker field) but gains +0.2 ± 0.1 win-prob
pts/deal in win mode on each of three seeds. Requiring two aces with the Joker counting as one was
neutral on points (+0.0 ± 0.5).

### Misère fixes from play (`tuned15`)

Three things spotted in play, measured with `src/probe-misere.ts`. It deals hands until a seat
holds one the computer would bid misère (or open misère) on, gives that seat the contract and kitty,
and plays each hand once per bidder/defender pairing on the same cards.

- **The bidder threw a singleton 4 instead of an ace** (`misereBid` 8). When void, the rule was the
  top card of the shortest suit. A card with no unseen card below it can never win, so throwing it
  gains nothing. Skipping such suits: misères made +0.3 ± 0.2 (5,000 hands; 71.0% vs 70.7% over
  2M duplicate deals).
- **Open misère defenders led into the bidder's void.** The defence's "suits the bidder still holds"
  check used only unseen cards, and the open hand isn't unseen, so it was always empty: the
  targeted leads never fired and the fallback led the lowest card in any suit. With the open hand
  counted, and no leads into a suit the bidder is known to be out of (`misereDef` 16): open misère
  made 85.6% → 84.1% (−1.5 ± 0.6, 3,000 hands), closed misère −0.7 ± 0.3.
- **The bidder's lead of the 7 from J-7 looked reckless** (`misereLeadBelow`, off). Only leading from
  suits whose lowest card has at most *k* unseen cards below it, vs low from the shortest suit
  (5,000 closed misère hands): *k* = 0 −2.7 ± 0.9, 1 −1.0 ± 0.5, 2 −0.3 ± 0.4; only when already void
  (`misereBid` 32): −2.0 / −0.8. Emptying a short suit is worth more than the safe lead.

Open misère is still made far too often (84%). The defenders can see the bidder's hand and could
plan to put the partner with the low card on lead; nothing does that yet. A search-based defence (`sim`, 20 worlds, every world
solved exactly to the end) cut it to 80% against the heuristic's 90% on 60 hands (−10 ± 8), but took
about 30 seconds of computing per hand: too slow for the web game as it stands.

### Jump bids and not pushing the opponents up (`tuned16`; partner support by level, `tuned20`)

Spotted in play: the computer never opened above 6. It found the highest level it would play in its
best strain, then made the cheapest legal bid there, and only climbed if outbid. A player could
compete cheaply, or pass to avoid pushing a low opener into a higher contract it would make.

Bidding straight to that maximum (`jump=true`), vs `tuned15`:

| Variant | pts/deal (200k, two seeds) | win-prob pts/deal (60k) | near 500 (30k) |
|---|---|---|---|
| `jump` | +5.0 ± 0.5, +5.1 ± 0.5 | −0.0 ± 0.1 | −1.1 ± 0.3 |
| `jump` + `jumpToWin` (stop at the cheapest bid that wins the game) | +5.0 ± 0.5 | +0.6 ± 0.1, +0.5 ± 0.1 (two seeds) | +0.4 ± 0.2 |

Contracts made fall from 82.1% to 79.5%, but each is worth more, and the opponents get fewer cheap
overcalls. Against the field: +4.4 ± 1.3 (+4.9 against `heuristic`–`tuned5`, +3.9 against
`tuned6`–`tuned10`). Opening one level below the maximum (`jumpOpen`) gained only +0.6.

The opposite worry, "don't overcall, or the opener will raise and make it" (`noPush`): pass instead
of overcalling an opponent when the estimate clears the bid by less than *m* tricks. Even against
`tuned15`, whose 6-level openings could hide much more:

| *m* | always | only when partner has passed |
|---|---|---|
| 0.5 | −25.6 ± 0.6 | −13.0 ± 0.4 |
| 1 | −37.6 ± 0.7 | −17.8 ± 0.5 |

Competing is right. Against jump bidders the worry shrinks anyway: a 6-level opening shows no more.

With jump bids, partner's 6-level bid means "and no higher", so it might deserve less support
than a bid that could hide more. Re-testing `partnerSupport` against `tuned19` (200k deals, seed 15):

| Variant | pts/deal |
|---|---|
| `partnerSupport` 1.25 for all bids | −1.1 ± 0.3 |
| `partnerSupport6` 1.25 (6-level bids only; others 1.5) | −0.1 ± 0.3 |
| `partnerSupport6` 1 | −2.0 ± 0.4 |
| `partnerSupport6` 0.75 | −4.5 ± 0.4 |
| `partnerSupport6` 1.25, `partnerSupport` 1.75 | +0.5 ± 0.4 |

Follow-up on seeds 16 and 17 (400k deals each):

| Variant (6-level / higher) | seed 16 | seed 17 |
|---|---|---|
| 1.25 / 1.75 | +0.3 ± 0.3 | +0.4 ± 0.3 |
| 1.75 / 1.75 | −4.5 ± 0.3 | −4.4 ± 0.3 |
| 1.5 / 1.75 | −0.3 ± 0.2 | −0.3 ± 0.2 |
| 1.25 / 2 | −1.1 ± 0.3 | −1.1 ± 0.3 |
| 1.5 / 2 | −3.2 ± 0.3 | −3.2 ± 0.3 |

Only 1.25 / 1.75 is ahead: about +0.4 ± 0.2 pooled over three seeds. That is small but consistent.
More support at either level loses. (Earlier, flat values: 0.5 −8.9, 1 −3.5, 2 −19.5.)
But 1.25 / 1.75 doesn't help win games: −0.1 ± 0.1 win-prob pts/deal on both seeds (60k), −0.1 ± 0.1
near 500 (30k), and +0.7 ± 0.9 against the field. Weak evidence, but nothing clearly against, and the
argument for it is strong: adopted as `tuned20`.

### Partner's trumps (`tuned17`)

Spotted in play: 6♦ by us, 7♦ by partner, 8♦ by us. Two rounds of trumps, everyone followed, one
trump out. Partner wouldn't raise with two diamonds, so the last trump is almost surely partner's,
and leading the Joker would only pull it. `drawStopVoid`'s inference already covers the case where
the missing trump is low (an opponent with it would have played it first). The new rule
(`drawPartnerHolds`=*k*): stop drawing when at most *k* trumps are out, partner bid the trump suit,
and partner hasn't shown out. *k* = 1: +0.1 ± 0.1 and +0.1 ± 0.0 pts/deal (200k and 400k deals),
+0.0 ± 0.0 win-prob. *k* = 2 was the same as 1.

### The defenders' Joker against a top trump lead (`tuned18`)

Spotted in play: East bid 6♥ and led the right bower; we held the Joker, left bower, A♥ and small
hearts. The computer would have kept the Joker (playing the 5♥) and gone off trumps next. Two ideas,
vs `tuned17` (200k deals, seed 11):

- **Play like the bidder when you hold the trumps** (`defControl`=*n*, `defControlMax`=*m*): with the
  Joker and *n*+ trumps against a contract of at most *m*, win the trump lead with the Joker and lead
  boss trumps after. *n* = 4/5 at *m* = 6: +0.2 / +0.1; *m* = 7: +1.4 / +0.4; *n* = 1–3 at *m* = 10:
  +2.4 to +2.6. The gain grew as the rule got broader, which pointed at the Joker play.
- **Never keep the Joker** (`jokerDuck=0`): +3.5 ± 0.2 and +3.4 ± 0.2 (seed 12), +0.3 win-prob, but
  −4.2 ± 0.5 against the field. `jokerDuck` was worth +4.9 in `tuned8`, when bidders led low trumps.
  Since `tuned11` the bidder leads its top trump when it lacks the Joker, and ducking under a right
  bower just gives that trick away. The old players still lead low.
- **Keep the Joker, except under a top trump** (`jokerDuck=3`: nothing unseen but the Joker beats the
  card winning the trick): +3.2 ± 0.2 pts/deal, +0.3 ± 0.0 win-prob, ±0.0 against the field (their
  bidders never lead a top trump). Adopted.
- Adding the trump-drawing lead to either Joker rule: +2.6, worse than the Joker rule alone. Once
  the Joker has won, leading boss trumps from the defence still does the bidder's drawing for it.

### Ruffing partner's winner, and cashing from the top (`tuned19`)

Spotted in play: at 7♥, after two rounds of trumps, partner led the K♦ from A-K; East followed. We
were out of diamonds and the computer would have ruffed with the right bower. From our seat the K
wasn't a sure winner (the A♦ was unseen), so the overtake rule (`overtakePartner`) took it with our
cheapest *boss* winner, which here was the right bower. Two fixes, vs `tuned18` (200k deals, seed 13):

| Variant | pts/deal |
|---|---|
| `partnerRuff=1`: never ruff partner's winning side card | −0.1 ± 0.2 |
| `partnerRuff=2`: ruff it only with the lowest trump that wins | +1.7 ± 0.2 |
| `cashTop`: when cashing side winners, lead the top one (A before K) | +1.6 ± 0.1 |
| `cashTop` + `partnerRuff=2` | +4.0 ± 0.2 |

Cashing from the top helps on its own: it gives partner (and the overtake rules) a card they can read.
The combination: +3.9 ± 0.2 on seed 14, +0.4 ± 0.0 win-prob, +4.9 ± 0.5 against the field.

### Near 500

A new benchmark mode (`--mode near`) only uses score positions where either side has 400+
(7,215 of the 30,005 sampled positions).

- **Raising the bid to stop the opponents.** If the opponents need *n* more tricks to reach 500, the
  bidders need 11 − *n*. So when making our bid wouldn't take us to 500, a lower bid looks
  dominated: it loses the game in the same cases and scores less when it makes.
  - Applied whenever we bid: −0.8 points of win probability per deal.
  - Applied only when our bid is final: no effect (the situation almost never arises).
  
  The dominance argument holds for the final contract, not for a bid early in the auction. A low
  bid leaves the opponents room to overcall, and if they stretch and fail, we gain. Jumping also
  shuts out partner.
- **Card play by game-win chance.** Near 500, the simulation player chose cards to maximise its
  chance of winning the game rather than this hand's points (`sim:objective=win`). Result: −0.1 ± 0.9
  points of win probability per deal over 2000 near-500 deals. Even where the two goals can
  differ, they almost always pick the same card, so there's nothing to gain from score-aware play
  here.
- **Re-checks near 500:**
  - More desperation (−1.5) and dropping the pass-when-partner's-bid-wins rule (−1.0) both hurt.
  - The bolder 7-level bids are neutral there (0.0).

### Simulation player

- **Sampled deals per decision matter:** 10 is too noisy to beat the heuristic at all, 20 gives
  +20 pts/deal, and 40 gives +26.
- **Using known voids** when sampling is worth about 9 pts/deal.
- **Most of its edge is in declarer play:** it makes 92% of contracts where the heuristic makes 85%.
  As a defender it only cut the heuristic's success to 84%.
- **Auction inference:** making sampled deals fit the bidding gains +3.7 ± 2.9, mostly in 7- and
  8-level contracts.
- **Exact endgames:** solving the last 3–4 tricks perfectly made no clear difference.
- **A better base heuristic helps it directly:** using `tuned2` instead of `tuned` gained +10.9 pts/deal.
- **Game-win objective** (`objective=win`, choosing cards to maximise game-win probability instead of
  hand points): −0.3 ± 0.7 percentage points per deal against the points objective, over 2000 deals
  in win mode. No measurable difference. Hand points and win chances mostly agree on the best card,
  and where they disagree (near 500) the cases are rare, so detecting a gain would need far more deals.

- **Auction inference with the fitted estimate.** For opponents who bid like `tuned4`–`tuned6`
  (`sim:imodel=fit,tol=0`), the sampled deals match the bidder's real hand better. Average error in
  the bidder's trump count: 1.31 cards, against 1.54 with the old inference and 2.05 with none.
  It made no measurable difference in play, though: −0.1 ± 6.5 pts/deal over 2000 deals. Simulation
  tests at this size can't detect gains below about 6 points.

### Game-win probability table

- Now built from 400,000 hands of `tuned5` self-play: the distribution of hand results, solved for
  every score pair by value iteration. (The first version used `tuned2`; it is kept in
  `data/winprob-tuned2.json`.)
- **Seat effects.** The table now also depends on which team deals next, since the deal passes left
  every hand and the team to the dealer's left bids first.
  - The non-dealing team wins the auction 52.9% of the time, worth about 0.8 pts/hand.
  - At level scores this is worth about 1 point of win probability near the end (400–400: 48.8% vs
    51.2%). At 0–0 it's worth almost nothing.
- Examples: level scores → 50%; 300–0 → 80%; 450–0 → 92.5% (94% in the `tuned2` table, which bid
  less boldly); −300 vs 0 → 27%.
- Re-tuning the score-aware bidding against the new table found nothing better: the `tuned3`
  settings (as re-scaled in `tuned4`) stand.

## Where the next refinements might come from

0. **More probes.** The single-decision probe found +6.6 pts/deal in an afternoon. The trialled rule
   changes before it had mostly come out at ±1, and the Joker probe found another +5.2 (`tuned8`).
   Discards, the NT Joker, the trump-contract Joker, defenders leading trumps and misère defence
   (`tuned9`) and the misère bidder's play (`tuned10`) are done. The bidder's trump-drawing
   order (`tuned11`, +9.5) and the partner's Joker are done too. Trump drawing later in the hand
   and the misère kitty discard are probed too: both already right. The defenders' first lead is
   probed: right, except that with 1–2 trumps out a low trump is better (`tuned12`, +0.6).
   (Bidding was re-tuned for `tuned8` and needed no change.)

1. **Bidding by simulation, or by an explicit expected-value model.** The calibration is now about
   as good as a hand-only estimate gets. What remains is the spread caused by partner's unseen hand
   and the competitive auction. Those are the trade-offs the aggression offsets approximate.
2. **Defence by simulation.** The heuristic defence gains are small. The simulation player's
   defence still trails its declarer play (see Simulation player).
3. **Simulation-based bidding.** The simulation player still bids like the heuristic. Sampling
   partner's and opponents' hands and simulating the play of each candidate contract would take over
   the trade-offs the bidding rules currently approximate.
4. **Boss blind spots.** Treating ruffable cards as non-boss didn't help (see Voids, ruffs and
   defenders' leads). The NT Joker is still ignored.
5. **Test against different opponents** (deliberately deferred: for now the aim is to keep beating
   the best player we have).
