# Plan 3: Money — earning from Form History without a subscription

## Ground rules

- **Never sell or share browsing data.** Chrome Web Store policy forbids it, and the whole pitch is privacy.
- **No ads injected into other sites.** Also forbidden, and it would end the listing.
- **No subscription.** One-time payments, per-event payments and sponsorship only.
- **The core stays free:** the list, the open/closed marks, sharing between browsers. People pay for
  extras, never to get their own data back.

## The honest outlook

Most extensions earn little; the ones that earn have a clear audience with a recurring need. Students
applying for internships, scholarships and clubs are that audience, but only for a few months a year.
Revenue = active users × share who pay × price. Neither of us knows the middle number yet; it varies
widely between products. So the plan buys evidence before building payment features.

## Stage A — Grow and measure (months 0–3)

- Free, public, no payments.
- Add a "Support Form History" link (Ko-fi or GitHub Sponsors) in More options. Expect small amounts;
  its real value is showing who cares enough to pay.
- Decide on Stage B only if weekly users keep growing and people ask for features.

## Stage B — One-time "Pro" unlock (once there are steady users)

**Price:** test a one-time price in the $9–$19 range; a student audience is price-sensitive.

**What Pro adds** (none of it takes anything away from free users):

| Feature | Why people pay |
|---|---|
| Application stages (Applied, Interviewing, Offer, Rejected) and private notes | Turns the list into a real tracker |
| Deadline reminders | Prevents missed forms and applications |
| Export to Google Sheets, and a printable summary | Useful for career advisers and applications |
| Tags and folders (e.g. "Summer internships") | Helps once the list gets long |

**How to take payment:**

- **ExtensionPay** (built for browser extensions, on Stripe): one-time payments, handles the unlock.
  You are the seller, so you deal with sales tax yourself.
- **Lemon Squeezy** license keys: it acts as the merchant of record and handles sales tax for you;
  the extension checks a key.
- Either way: update the privacy policy (the payment provider receives the buyer's email), switch the
  Chrome Web Store trader declaration to "trader", and show the price before anyone clicks.

## Stage C — Organisations (the larger opportunity)

People who run forms and hiring rounds feel the pain more and have budgets: clubs, schools, career
centres, event organisers. That is the `form-board` project: an organiser dashboard showing who has and
has not responded, with a way to remind them.

- **Pricing without subscriptions:** pay per event or per form (e.g. a few dollars per tracked event),
  or a one-time licence per organisation.
- **Students bring organisers:** a student who sees their club's form in Form History is the opening
  for that club to use the organiser side.
- Requires consent on both sides: organisers see only responses people agreed to share.

## Stage D — Sponsorship (only with a real audience)

One clearly labelled "Sponsored" slot in the extension's own page, sold directly to one relevant
sponsor at a time (a résumé service, a campus job fair). Static image and link: no ad network, no
tracking. Ad networks are not an option anyway: extensions cannot load the remote code they need.

## What to ignore

- **Selling "anonymous" data.** Forbidden by store policy and breaks trust permanently.
- **Affiliate links rewritten into job sites.** Forbidden.
- **Mobile apps** before the desktop product has users.

## Milestones

| When | Signal | Decision |
|---|---|---|
| Launch + 1 month | First 100 weekly users | Keep going; add the support link |
| Launch + 3 months | Users asking for stages or reminders | Build Pro (Stage B) |
| After Pro | Organisers asking how to see responses | Start the organiser dashboard (Stage C) |
