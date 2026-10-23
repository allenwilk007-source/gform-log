# Form History: the complete launch plan

This is the master plan. It covers every measure needed to take Form History from a working extension
to a public, trustworthy product that can earn money without a subscription. Plans 1–3 in this folder
go deeper on product, publishing steps and money; where they differ, this plan wins.

**How to read it.** Work happens in stages. Each stage ends in a **gate**: a short list of things that
must be true before the next stage starts. Every task names who does it: **You** (needs your accounts,
money or judgement) or **Claude** (code and documents). Nothing here is legal or tax advice; where a
decision has legal or tax consequences, the plan says to check with a professional.

**Where things stand:** version 0.5.1 is built and tested against fake sites. Google sign-in works in a
real Chrome. Not yet confirmed for real: Lever and Ashby detection, and Chrome-to-Edge sharing.

---

## Stage 1 — Make it correct (week 1)

Nothing goes public until the product works for real on the things it claims.

| # | Who | Task | Done when |
|---|---|---|---|
| 1.1 | You | Apply for one real job on Lever, one on Ashby, one on Greenhouse with 0.5.1 installed | Each appears as Submitted with the right title |
| 1.2 | You | If any is missing, save the page shown after Submit (Ctrl+S) and send it | Claude has the saved page |
| 1.3 | Claude | Fix detection from the saved pages; add each as a test | Tests pass against the real page copies |
| 1.4 | You | Sign in on Chrome and Edge; open a form in Edge; Sync now in Edge, then Chrome | The form shows in Chrome, named after the Edge browser |
| 1.5 | You | Use it daily for a week on your real forms and applications | A list of anything confusing or wrong |
| 1.6 | Claude | Fix everything from 1.5; merge the pull request into `main` | CI green on `main` |

**Gate 1:** every claim in the store listing is true on real sites, on Chrome and Edge, on Windows.

---

## Stage 2 — Lock down accounts and keys (week 1, about 1 hour)

A store listing, a Google sign-in client and a GitHub repo are all things an attacker could take over
to push a malicious update to every user. Protect them before there are users.

| # | Who | Task |
|---|---|---|
| 2.1 | You | Create a dedicated Google account for the product (e.g. a new Gmail) to own the Cloud project, the Chrome Web Store listing and the support inbox. Do not use your personal account: if it is locked or lost, the product goes with it. |
| 2.2 | You | Turn on 2-Step Verification, with a security key or authenticator app, on that account, your GitHub account and your Microsoft account. The Chrome Web Store requires 2-Step Verification to publish. |
| 2.3 | You | Add a second owner or backup admin to the Google Cloud project, so one lost account does not lock you out. |
| 2.4 | You | On GitHub, protect `main`: require pull requests and passing CI before merging (Settings › Branches). |
| 2.5 | You | Store the private key file (`forms-i-answered-key.pem`), the Client ID and every recovery code in a password manager. Never in the repo, email or chat. |
| 2.6 | Claude | Add a check to CI that fails if a client secret, private key or token is ever committed. |
| 2.7 | You | Never paste the client *secret* anywhere: the extension does not need it. If it ever leaks, reset it in Google Cloud. |

**Gate 2:** every account that can change what users install has 2-Step Verification and a backup.

---

## Stage 3 — Privacy, legal and trust (week 2)

| # | Who | Measure | Why |
|---|---|---|---|
| 3.1 | Claude | Privacy policy states exactly what is read, kept and sent, with Google's Limited Use statement | Required by the store and by Google for any app using Google user data. **Done** (`docs/privacy.html`). |
| 3.2 | Claude | Privacy policy says the product is not directed at children under 13 | Students are the audience; US children's privacy law (COPPA) applies to services aimed at under-13s. **Done.** |
| 3.3 | Claude | "Not affiliated with or endorsed by Google, Greenhouse, Lever or Ashby" on the website and listing | Using their names descriptively is normal; implying endorsement is not. **Done.** |
| 3.4 | You | Do not use Google's logo, Google Forms' icon, or any job site's logo anywhere | Trademark guidelines; also a common store rejection reason |
| 3.5 | Claude | Terms of use page: free software provided as is, no warranty that every form or application is detected | Sets expectations; needed later for any payment |
| 3.6 | Claude | An open-source licence (e.g. MIT) in the repo | The code is public; without a licence nobody may legally reuse it, and stores and contributors expect one |
| 3.7 | You | A support email on the product account (e.g. `formhistory.support@…`), shown in the listing | Stores require a contact; keeps your personal address private |
| 3.8 | — | No analytics, no tracking, no remote code | Keeps the privacy promise simple and true, and avoids consent banners and GDPR obligations for analytics |
| 3.9 | You | Before taking any money (Stage 8): check with a local accountant or small-business adviser about registering, taxes, and whether you need a business entity | Legal and tax rules depend on where you live |

**Gate 3:** the website, privacy policy, terms and listing all say the same thing, and it matches the code.

---

## Stage 4 — Website and Google approval (week 2)

| # | Who | Task |
|---|---|---|
| 4.1 | You | Turn on GitHub Pages: Settings › Pages › Deploy from branch `main`, folder `/docs` |
| 4.2 | You | Optional but recommended: buy a short domain (about $10–20 a year), e.g. `formhistory.app`, and point it at GitHub Pages. A domain you own is easier to verify with Google, looks more trustworthy, and survives a move off GitHub. |
| 4.3 | You | Verify the site in Google Search Console (Google gives a tag; Claude adds it to `docs/index.html`) |
| 4.4 | You | Google Auth Platform › Branding: name "Form History", support email (3.7), homepage, privacy policy, terms, authorized domain. No logo for now: a logo triggers a branding review |
| 4.5 | You | Google Auth Platform › Data access: only `…/auth/drive.appdata`. Nothing else |
| 4.6 | You | Google Auth Platform › Audience › **Publish app** |
| 4.7 | You | Watch the Verification Centre page for anything Google asks; answer within days, not weeks |

Expectation: `drive.appdata` is a non-sensitive scope, so there is no paid security assessment. Google
may still ask to verify branding or the domain.

**Gate 4:** a Google account that is not yours can sign in to the extension without a warning screen.

---

## Stage 5 — Store submission (weeks 2–4)

Full click-by-click steps are in `2-publishing.md`. The measures that matter:

| # | Who | Measure |
|---|---|---|
| 5.1 | Claude | Build the client ID into `config.js`; build the store package from a tagged commit on `main` (`npm run zip:store`) |
| 5.2 | You | Register the Chrome Web Store developer account on the product account ($5); declare **non-trader** while it is free |
| 5.3 | You | Upload as a **draft**; send Claude the public key from the Package tab |
| 5.4 | Claude | Put the store's key in the manifest, so every copy shares the store's ID |
| 5.5 | You | Add `https://<store ID>.chromiumapp.org/` as a redirect URI on the Google client |
| 5.6 | You | Fill in the listing and privacy tab from `store/listing.md`; every permission has a written reason |
| 5.7 | You | Submit as **Unlisted**. Install from the store link on a clean browser profile and run the Stage 1 checks again |
| 5.8 | You | Switch to **Public** only after 5.7 passes |
| 5.9 | You | Repeat for Edge Add-ons (free), adding the Edge ID's redirect URI |
| 5.10 | — | If rejected: the email names the policy. Send it to Claude; fix; resubmit. Do not argue a rejection without changing anything |

**Gate 5:** installed from each store on a clean profile, it detects a form, signs in, and syncs.

---

## Stage 6 — Release process (every update after launch)

Every update reaches every user automatically, so each one must be deliberate.

1. **Version numbers:** 1.0.0 for the first public release; then x.y.z (z for fixes, y for features).
2. **Changelog:** one line per change in `CHANGELOG.md`, written for users.
3. **Checks before upload:** CI green on `main`; the manual checklist below passes on Chrome and Edge.
4. **Build:** only from a tagged commit (`v1.2.0`), only with `npm run zip:store`. Keep every released zip.
5. **Permissions:** an update that adds a permission disables the extension until each user approves it.
   Avoid adding permissions; when unavoidable, say why in the changelog and listing.
6. **Rollback:** the stores cannot roll back. Re-upload the previous good zip with a higher version number.
7. **Manual checklist per release** (15 minutes):
   - Fresh install: the history scan finds old forms.
   - Open a Google Form; submit a test form you own; it shows Submitted.
   - Check now: open and closed marks are right.
   - Sign in, Sync now, sign out.
   - The page renders in light and dark mode and at narrow width.

---

## Stage 7 — Launch, support and measurement (first 3 months)

**Launch:**
- Start where the audience is: your school's clubs, career-centre newsletters, student subreddits and
  Discords. One-sentence pitch: "A list of every form and job application you've sent, and which are still open."
- Put the store link on the website and in the README.

**Support:**
- Answer every review and support email within 2 days. Early reviews decide store ranking.
- A short FAQ on the website: why it asks for history, what is stored, how to delete everything,
  which sites are covered.
- An "Ideas or problems?" link in the extension, to GitHub issues or the support email.

**Measurement, without tracking users:**
- The store dashboards give installs, weekly users, uninstalls and ratings: enough to steer by.
- An uninstall survey: Chrome can open a page when someone uninstalls. Point it at a two-question
  Google Form ("Why did you uninstall?") on the product account. It sends nothing about the person.
- Count support emails and review themes by hand each week.

**Watch for breakage:** job sites change their pages. Once a month, apply-test one posting per supported
site (or ask a few users to report misses). A missed application is the product's worst failure.

**Targets to decide on Stage 8:**

| Signal | Healthy | Worrying |
|---|---|---|
| Weekly users after 1 month | Growing week on week | Flat or falling |
| Uninstalls within a week of install | Under about a third | Most installs |
| Ratings | 4 stars or more | Repeated "didn't detect my application" |

---

## Stage 8 — Money, without a subscription (from month 3, only if Stage 7 looks healthy)

Details in `3-money.md`. Measures that must be in place **before the first payment**:

| # | Who | Measure |
|---|---|---|
| 8.1 | You | Professional advice on taxes and business registration where you live (3.9) |
| 8.2 | You | Choose a payment provider. **Merchant of record** (e.g. Lemon Squeezy, Paddle) collects and pays sales tax and VAT for you and is the simplest for one person. **Stripe-based** (e.g. ExtensionPay) has lower fees but you handle tax. |
| 8.3 | You | Switch the Chrome Web Store declaration to **trader**: your contact details become visible on the listing (EU rules), so use the product account and a business address if you have one |
| 8.4 | Claude | Update the privacy policy: the payment provider receives the buyer's email and payment details; Form History never sees card details |
| 8.5 | Claude | Terms of sale and a refund policy (e.g. full refund within 14 days, no questions) |
| 8.6 | Claude | Pro unlock that works offline once bought, never removes free features, and never locks people out of their own list |
| 8.7 | You | Price shown before anyone clicks; no dark patterns (no fake countdowns, no nagging) |

**What earns:** a one-time Pro unlock (application stages and notes, deadline reminders, export,
tags), a support link, later a single labelled sponsor slot, and the larger opportunity: per-event
pricing for organisers through form-board.

**Ruled out:** selling or sharing data, injected ads or affiliate links, subscriptions.

---

## Stage 9 — The organiser dashboard (only after Pro works)

Selling to clubs, schools and career centres means holding other people's data on a server. That
brings obligations the extension avoided:

- **Hosting and security:** a server, a database, encrypted backups, access controls, and someone
  responsible for patching them.
- **Consent:** respondents must opt in to sharing; organisers see only what was shared.
- **Schools:** US schools often require a student-data privacy agreement, and federal and state
  student-privacy laws (such as FERPA) may apply. Get legal review before selling to a school.
- **Data requests:** a way for anyone to see and delete what the dashboard holds about them.

Treat Stage 9 as a separate product with its own plan when the time comes.

---

## Risk register

| Risk | Likelihood | Impact | Measure |
|---|---|---|---|
| A job site changes its pages; applications are missed | High | High | Detection by both address and thank-you message; monthly apply-tests; saved-page tests; users can report misses |
| Store rejects or delays review | Medium | Medium | Single purpose, justified permissions, accurate privacy policy, Unlisted first |
| Google asks for verification changes | Medium | Medium | Only a non-sensitive scope; verified domain; quick replies |
| Account lost or hijacked; malicious update | Low | Severe | Product account, 2-Step Verification everywhere, backup admin, protected `main` |
| Users distrust the history permission | High | Medium | Plain explanation in listing and FAQ; no servers; open source |
| Google adds a "forms you answered" feature | Low | High | Job-application tracking and stages are the moat, not Google Forms alone |
| One maintainer; work stalls | Medium | Medium | Everything documented in the repo; tests guard behaviour; plans written down |
| Storage limits in browser sync | Low | Low | Overflow kept locally and reported; Drive sharing has no practical limit |

---

## Costs

| Item | Cost |
|---|---|
| Chrome Web Store registration | $5 once |
| Edge Add-ons, GitHub, GitHub Pages, Google Cloud (this usage) | Free |
| Own domain (recommended) | About $10–20 a year |
| Payment provider (Stage 8) | A percentage of each sale; merchant-of-record services cost more but handle tax |
| Professional tax/business advice (Stage 8) | Varies; one consultation is usually enough to start |

## Timeline at a glance

| Week | Stages |
|---|---|
| 1 | 1 (correctness) and 2 (accounts) |
| 2 | 3 (privacy and legal) and 4 (website, Google approval) |
| 2–4 | 5 (store review; waiting time varies) |
| 4–16 | 6 and 7 (launch, support, measure) |
| 16+ | 8 (money), then 9 (organisers) if the signals are there |
