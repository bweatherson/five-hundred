# 500 strategy test bench

For a summary of what has been learned and what each player uses, see [FINDINGS.md](FINDINGS.md).

A rules engine for 4-player, 43-card 500 (Avondale scoring) and a duplicate tournament
runner for testing computer strategies against each other.

## Commands

```bash
npm test                     # rules and engine tests
npm run typecheck
npm run match -- --list      # named strategies
npm run match -- --a bold --b cautious --deals 5000        # duplicate hands
npm run match -- --a heuristic --b jumper --games 500      # duplicate games to 500
npm run match -- --a "heuristic:partnerTricks=2,aggression=0.25" --b heuristic --deals 5000
npm run build-winprob -- tuned2 200000   # rebuild the game-win probability table
npm run sweep -- --base tuned2 --deals 60000 --jobs 8 --mode win tuned3   # score-aware comparison
npx tsx src/calibrate.ts tuned3 25000 101 > cal.jsonl   # forced-contract playouts for the trick estimate
npx tsx src/fit-estimate.ts cal.jsonl                    # fit it (coefficients go in src/strategies/features.ts)
npx tsx src/calibrate-auction.ts tuned5 40000 11        # what partner's/opponents' bids add to the estimate
npm run sweep -- --base tuned5 --deals 60000 --jobs 8 --mode near tuned6   # only positions with a side on 400+
npx tsx src/probe.ts run 50000 1 0 tuned7 > p0.jsonl   # single-decision probe (situations in src/probe-situations.ts)
npx tsx src/probe.ts run 500000 1 0 tuned10 tuned10 misere > m0.jsonl   # the same, misère hands only
npx tsx src/probe-draw.ts tuned13 20000              # trump leads after the opponents are out
npx tsx src/probe-nt.ts tuned14 50000                # no-trump contracts by the bidder's aces
npx tsx src/probe-discard.ts run 500000 1 0 tuned10 > k0.jsonl   # misère kitty-discard probe; report with: npx tsx src/probe-discard.ts report k*.jsonl
npx tsx src/probe.ts report p*.jsonl --min 300          # paired results by situation and sub-case
```

**Duplicate hands** plays each deal twice with the partnerships swapped, from 0–0, and reports
the points per deal that A gains over B. This is the most sensitive measure.
**Duplicate games** plays pairs of full games on the same sequence of deals and reports A's win rate.

## Parameter sweeps

`npm run sweep` plays several variants against one baseline on the same deals:

```bash
npm run sweep -- --base heuristic --deals 10000 "heuristic:aggression=0.5" "heuristic:aggression=1"
npm run sweep -- --base heuristic --deals 20000 --games 2000 tuned   # also full games
```

`src/field.ts` tests variants against a field of other players instead of the base itself. Each deal
is played by (variant vs opponent) and by (base vs opponent), with the opponent rotating through the field:

```bash
npx tsx src/field.ts --base tuned12 --deals 80000 --jobs 8 "tuned12:leadSingleton=true"
```

Findings so far (Nov 2026), all from 0–0 duplicate hands:

- **Suit-bid aggression**: best at about +0.75 to +1 trick over the default estimate.
  Beyond +1.5 it falls off sharply.
- **Misère**: the original rule made only ~50% of misère bids, so being strict gains about
  2.5 points/deal. The "gap" model (a card is risky if more lower cards in its suit are out than
  we hold below it; voids offset risks) with `misereDanger=1, misereSlack=1` makes ~80%.
- **Auction signals**: marking down a suit an opponent has bid helps (`opponentStrainPenalty`
  1.5–3, about +2.4/deal). Bigger raises for partner's suit, and marking down after partner
  passes, both hurt. Ignoring the auction entirely costs ~1.5/deal.
- `tuned` combines these: +13 points per deal and a 58% win rate in games against `heuristic`.

## Simulation player (`sim`)

For each card it could play, `sim` deals the unseen cards many plausible ways (consistent with
hand sizes, the open misère hand, and suits players have shown out of), plays each deal out with
`tuned` for all four seats, and picks the card with the best average result for its side,
scored with the real contract. Bidding and discards are `tuned`'s. Options:
`sim:worlds=40` (deals sampled per decision, default 40), `sim:voids=false`, `sim:infer=false`
(turn off auction inference, below), `sim:tol=1` (inference tolerance in tricks).

It is slow (about 0.1–0.3 s per hand), so use `--jobs 8` to spread a sweep across cores:

```bash
npm run sweep -- --base tuned --deals 2000 --jobs 8 sim:worlds=20 sim:worlds=40
```

Results against `tuned`, over 2000 duplicate deals:

| variant | pts/deal |
|---|---|
| `sim:worlds=10` | +1.0 ± 5.0 |
| `sim:worlds=20` | +20.1 ± 5.2 |
| `sim:worlds=40` | +26.3 ± 5.0 |
| `sim:worlds=20,voids=false` | +11.5 ± 5.1 |

Nearly all of the gain is in declarer play: `sim` makes 92% of its contracts, against about 85% for
`tuned` on the same cards. As a defender it only cuts `tuned`'s success to 84%. A likely reason is
that the sampled deals ignore the auction, so a defender "imagines" the bidder holding random cards
rather than a strong trump hand.

### Auction inference (on by default)

Each bid implies "my hand is worth at least this", and each pass implies "my hand wasn't worth the
cheapest bid available". Both are judged with the same trick estimate the heuristic bidder uses.
For each sampled world, `sim` draws up to 20 candidate deals and keeps the first one consistent with
the auction (or the closest). As a defender, this cuts the error in the bidder's sampled trump count
from 2.2 to 1.7 cards.

Against plain `sim` (no inference): +3.7 ± 2.9 points per deal (5000 deals, seed 2), and +4.1 ± 4.6
in a separate 2000-deal run. The gain is concentrated in higher contracts:

| contracts made | 6-level | 7-level | 8+ |
|---|---|---|---|
| inferring declarer vs plain defenders | 91.5% | 84.6% | 70.4% |
| plain declarer vs inferring defenders | 91.3% | 81.7% | 68.5% |

Tolerance 0–1 trick works; 2 is too loose. The constraints model opponents who bid roughly like
`tuned`, so they may need retuning against players who bid differently.

### Exact endgames in rollouts (`sim:endgame=N`)

`src/strategies/endgame-fast.ts` solves the last N tricks of a sampled deal exactly (alpha-beta
with a transposition table, move ordering and bound pruning; checked against brute force).
Solve times: 4 tricks left 0.6 ms, 5 tricks 3 ms, 6 tricks 18 ms. It made no clear difference:
`endgame=3` +1.3 ± 4.2 and `endgame=4` +5.3 ± 6.0 points per deal against plain `sim`. Off by default.

## Bidding, kitty and play experiments (`tuned2`)

All against the previous best heuristic, 40,000 duplicate deals unless noted.

**Card play**

| change | pts/deal |
|---|---|
| bidders never lead trumps | −44 |
| bidders don't cash side winners | −22 |
| defenders never cash side winners | −9.8 |
| defenders cash only from trick 2 / 3 / 5 | −0.2 / −0.3 / −1.1 |
| bidders always lead trumps (even with 1–2) | −5.0 |
| **second seat trumps in when void** (`secondHandRuff`) | **+5.6** |
| second seat tries to win when it can follow (no "second hand low") | −1.6 vs playing low |
| defenders lead trumps when they have nothing to cash | −2.9 |
| lead singletons to set up a ruff | +0.2 |
| steer leads by known voids | −0.8 |
| throw from the shortest suit when you can't follow | −1.0 |

**Kitty**: `eval` (try every 3-card discard, keep the best trick estimate) +0.8; a stronger pull
toward voiding short suits (weight 5) +0.7, weaker at 8–12; allowing aces to be discarded −6.5.

**Bidding signals**: a 6-level bid you would not otherwise make, to show partner a suit.

| setting | pts/deal |
|---|---|
| black suits only, 1.5–3 tricks of own strength | −2.2 to +0.2 |
| any suit, 2.5 tricks | +2.2 |
| any suit, 2.5 tricks, partner's suit worth 1.5 tricks (was 1) | **+4.0** |
| any suit, 2.5 tricks, partner's suit worth 2 tricks | +1.7 |

With signals the side declares more often (55% vs 47% of hands) and makes fewer contracts
(85% vs 87%), but scores more. After adding them, re-tuning aggression, opponent-suit penalty,
partner-pass penalty and misère thresholds found nothing better (all within about ±3).

`tuned2` combines second-seat ruffing, `eval` discards and any-suit signals with 1.5-trick support:
+11.0 ± 1.1 points per deal and 55.5% of games against `tuned`; +25.4 against `heuristic`.
`sim:policy=tuned2` beats `tuned2` by +29.6 ± 5.6 and plain `sim` by +10.9 ± 5.6.

**What the simulation player does** (480 hands as `sim:policy=tuned2` vs `tuned2`):
a defender on lead with a side winner cashes it only 50% of the time (25% in the first four
tricks); in second seat with a possible winner and a low card it plays low 62% of the time;
in second seat and void in a side suit it trumps 76% of the time. Forcing it to cash early
instead (`sim:policy=tuned2,forceCash=true`) scored −2.1 ± 4.2 points per deal over 3000 deals:
holding back and cashing early come out about even.

## Layout

- `src/cards.ts`, `src/rules.ts`: deck, bids, trumps/bowers, legal plays, trick winner, scoring.
  House rules are in `RulesConfig` / `DEFAULT_RULES`.
- `src/game.ts`: the auction (no re-entry after passing), the kitty, play, full games.
- `src/player.ts`: the `Strategy` interface and the views a player sees (no hidden information).
- `src/strategies/`: `random` (baseline), `heuristic` (tunable rule-of-thumb player),
  `simulation` (sampling player) with `sampling`, `inference` and `endgame-fast`.
- `src/sweep.ts`, `src/parallel.ts`, `src/shard.ts`: parameter sweeps, optionally across processes.
- `src/tournament.ts`, `src/cli.ts`, `src/registry.ts`: duplicate matches and the command line.

## Writing a strategy

Implement `Strategy` (`bid`, `discard`, `play`, and optionally `jokerSuit`), then add it to
`src/registry.ts`.

## Playing in the browser

`web/` is a playable version. On your own, you sit South with the computer (`tuned14`) as your
partner and both opponents. You can also play with friends. It uses the same rules engine and
strategies as the test bench.

```bash
npm run web
```

Then open http://localhost:5173. Open the page with `#cards` to see every card face and the back.

**Playing with friends.** One person chooses *Host a game with friends* and gets a five-letter room
code (and an invite link, `…#join=CODE`). Others choose *Join a friend's game* and type the code.
The host picks who sits where; empty seats are played by the computer. The host's browser runs the
game and sends each player only what their seat can see. If a guest drops out, the computer plays
their seat until they rejoin under the same name. If the host closes the page, the game ends.
Browsers find each other through PeerJS's free public broker and then connect directly, so no
server of our own is needed. Anyone with the code can join a table before it starts.

**House rules.** *House rules* on the opening screen sets when misère and open misère may be bid
(misère: after a 7 bid, any time, or never; open misère: any time, after an 8 bid, or never) and
whether taking all ten tricks scores at least 250. The defaults are the standard rules: misère after
a 7 bid, open misère any time, all ten tricks at least 250. A host can change them in the lobby, and
guests see them there. The computer was tuned on the standard rules.

**Review.** At the end of each hand, *Review* lists every bid, discard and card where the computer
would have chosen differently in your place. Plays with only one legal card aren't counted.

**Publishing.**

- GitHub Pages: push this folder to a GitHub repository, then in the repository's Settings → Pages,
  set the source to "GitHub Actions". `.github/workflows/pages.yml` then tests, builds and publishes
  the site on every push to `main`. `npm run web:build` makes the same static site in `web/dist/`,
  which works from any static host and any sub-path.
- claude.ai: `npm run web:artifact` builds `web/dist-artifact/page.html` and its assets for an
  Artifact page. claude.ai pages can't make outside connections, so that copy is solo play only.

Files:

- `web/src/game/table.ts` runs a hand one step at a time, so people can take seats; it also
  records the review and makes each seat's view of the table.
- `web/src/game/session.ts` runs the computer players and the pacing (on the host's screen).
- `web/src/net/peer.ts` is hosting and joining.
- `web/src/ui/Card.tsx` draws the cards as SVG.
- `web/src/ui/App.tsx` is the table, bidding panel, kitty and score screens; `Home.tsx` is the
  opening screen and lobby; `Rules.tsx` and `game/houseRules.ts` are the house rules; `Review.tsx` is the end-of-hand review.
