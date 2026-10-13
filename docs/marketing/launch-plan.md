# Launch plan

Goal: get real riding groups onto real rides in India, learn fast, and earn trust before scaling.
Soft launch first (invite-only beta, then public). Safety product: honest claims over big claims.

## Pre-launch gates (must be done before week 1)

- Privacy policy and support page live (location, retention, deletion explained).
- Data safety (Play) and App Privacy (App Store) forms filled from `store-listing.md`.
- Play background-location declaration and demo video; App Review notes explaining background location during rides and the guest sign-in.
- SOS tested on real devices in a real group ride (the plan's own safety requirement).
- Rate limits / abuse protection on join and guest sign-in (plan item before public launch).
- Real screenshots captured (`screenshots.md`).

## Channels (India riding communities)

| Channel | Use | Notes |
|---|---|---|
| WhatsApp groups of riding clubs and office riders | Primary. Ride leaders invite their group; the ride code is naturally shareable on WhatsApp | Provide a share message: "Join my ride on Throttle Tribe: code 123456 or link" |
| Instagram Reels / YouTube Shorts | 20-30 s demos: "someone stopped, group knows in seconds"; tunnel/no-signal demo | Show real UI only |
| Moto-vlogger micro-influencers (10k-100k) | Seed to leaders of weekend and touring groups | Brief must repeat "Not claimed" rules; no crash-detection language |
| Facebook groups and Reddit (r/IndianBikes, r/motorcycles) | Honest founder post, ask for feedback | Follow community self-promo rules; reply to every comment |
| Royal Enfield / KTM / Himalayan owner clubs, local HOG/BMW chapters | Beta groups; sponsor a chapter ride | Do not use brand names in marketing assets |
| Ride events, brewery/cafe meets, Sunday breakfast-ride spots | QR code poster: "Riding as a group? Scan, share one code" | Print the 6-digit flow in 3 steps |
| Google Play / App Store listing | Evergreen; test two subtitles/short descriptions | Use A/B (store listing experiments) on Play |
| Hindi and regional versions of listing and posts | Phase 2 | Do after English copy stabilises |

## 4-week plan

| Week | Focus | Actions |
|---|---|---|
| 0 (prep) | Gates | Finish pre-launch gates; recruit 5-8 beta ride leaders |
| 1 | Closed beta (50-100 riders) | Seed 5-8 groups; each runs 2 rides; support channel on WhatsApp; daily review of crashes and SOS/alert false positives; collect 3 quotes (with permission) |
| 2 | Fix and film | Ship fixes; film 2-3 short demos from beta rides; finalise screenshots with real UI; submit to stores (allow review time) |
| 3 | Public soft launch | Go live on Play and App Store; founder post in communities; 5-10 micro-influencer seeds; QR posters at 2-3 meet spots |
| 4 | Amplify and measure | Publish ride stories; referral nudge ("Share your next ride code"); run store listing experiment; weekly metrics review; decide Hindi + roadmap (route planning, offline maps are future, not promised) |

## Success metrics (targets for week 4, adjust after week 1 baselines)

| Metric | Definition | Target |
|---|---|---|
| Rides created | Rides reaching "active" | 150 |
| Riders per ride | Median members at start | 4+ |
| Join success | Join attempts that succeed / attempts | 90%+ |
| Time to join | App open to in lobby (new guest) | under 60 s |
| Ride completion | Rides ended by leader / rides started | 70%+ |
| Repeat leaders | Leaders who run 2+ rides in 14 days | 40%+ |
| Alerts quality | Stop/lost-signal alerts rated "useful" in feedback; false-alarm reports | under 10% false |
| Crash-free sessions | Per store reporting | 99%+ |
| Store conversion | Listing views to installs | 25%+ (Play) |
| Rating | Store average after 50 ratings | 4.3+ |

Instrumentation: needs product decision (no analytics SDK declared today). If added, update the privacy
labels first.

## Messaging by audience

- Ride leader: "Stop counting heads at every halt."
- Rider: "Ride your own pace. Your group can see you."
- Pillion / family: avoid promises of "tracking family"; stay on the ride group.

## Risks

- Overclaiming safety: keep every asset consistent with the "Not claimed" list.
- Patchy data in hills: say "needs mobile data" in listing and FAQ; "No signal" state is a feature.
- Battery concerns: be ready with an FAQ; measure on real phones before making any battery claim (none made here).
