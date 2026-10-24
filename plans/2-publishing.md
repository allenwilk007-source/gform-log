# Plan 2: Publishing — getting Form History into the Chrome Web Store and Edge Add-ons

Total hands-on time is about 3 hours across a week; the rest is waiting for reviews. "You" steps need
your accounts; "Claude" steps are code changes.

## Phase 0 — Make the build ready (before anything public)

| # | Who | Step |
|---|---|---|
| 0.1 | You | Send your Google **Client ID** (ends in `.apps.googleusercontent.com`). Never the client secret. |
| 0.2 | Claude | Put it in `extension/src/config.js`, rebuild, and send you the store package. |
| 0.3 | You | Real-world checks: apply once on Lever, once on Ashby; open a form in Edge and sync to Chrome. |
| 0.4 | Claude | Fix anything 0.3 finds; merge the pull request into `main`. |

## Phase 1 — Homepage and privacy policy (15 minutes)

1. On GitHub: repo **Settings › Pages** › Source **Deploy from a branch** › branch `main`, folder `/docs` › Save.
2. Within a few minutes these work:
   - https://allenwilk007-source.github.io/gform-log/
   - https://allenwilk007-source.github.io/gform-log/privacy.html

## Phase 2 — Let anyone sign in with Google (30 minutes, then possibly a few days)

In Google Cloud, project used for the client, **Google Auth Platform**:

1. **Branding:** app name `Form History`; your support email; homepage and privacy-policy links from
   Phase 1; authorized domain `allenwilk007-source.github.io`. Leave the logo empty: adding one makes
   Google review the branding first.
2. If Google asks you to prove you own that domain, it shows a verification tag in Search Console. Send
   it to Claude to add to `docs/index.html`.
3. **Audience › Publish app.** Until then only listed test users (up to 100) can sign in.
4. Expectation: the only permission is `drive.appdata`, which Google lists as non-sensitive, so there
   is no paid security assessment and no "unverified app" warning for it.

## Phase 3 — Chrome Web Store (1 hour, then review)

1. Open the **Chrome Web Store Developer Dashboard** with the Google account that should own the listing.
   Pay the one-time **$5** registration fee. Turn on **2-Step Verification** on that account if it asks.
2. It asks whether you are a **trader** (selling goods or services). Answer "non-trader" while it is free;
   if you add payments later, change it, and your contact details will be shown on the listing.
3. **New item** › upload `form-history-store.zip` (from 0.2). **Save as draft. Do not submit yet.**
4. **Package tab:** copy the **public key**. Send it to Claude, who puts it in the manifest so your own
   copies use the store's ID.
5. In Google Cloud › Clients › your client › **Authorized redirect URIs**, add
   `https://<store item ID>.chromiumapp.org/` (the ID is on the dashboard). Keep the old one.
6. Fill in the listing from `store/listing.md`: text, category, images from `store/`, privacy answers,
   permission justifications, privacy policy link.
7. **Distribution:** visibility **Unlisted**. **Submit for review.**
8. Review usually takes from a few days to a couple of weeks; the history permission can mean a closer
   look. If rejected, the email names the policy: send it to Claude.
9. Once approved: install it from its store link, sign in, check your list syncs back, then switch
   visibility to **Public**.

## Phase 4 — Edge Add-ons (free, 30 minutes, then review)

1. Register at **Microsoft Partner Center** for Edge (free).
2. Upload the same `form-history-store.zip`; reuse the listing text and images.
3. Edge assigns its own ID: add `https://<edge ID>.chromiumapp.org/` as another redirect URI.
4. Edge and Chrome store installs still share one list: the Drive file belongs to your Google Cloud
   project, not to an extension ID.

## Phase 5 — Launch and learn (first month)

- Post where your first users are: your school's clubs, career-centre channels, student forums.
  Explain it in one sentence: "a list of every form and job application you've sent".
- Watch the dashboards weekly: installs, weekly users, uninstalls. Read every review.
- Add an "Ideas or problems?" link to the GitHub issues page in the extension.

## What gets listings rejected, and how this one avoids it

| Risk | Mitigation already in place |
|---|---|
| Permissions broader than the purpose | One stated purpose; a written reason for every permission |
| Privacy policy that does not match the code | The policy lists exactly what is read, kept and sent |
| Remote code | None: every script is in the package |
| Misleading listing | Screenshots are the real interface with sample data, labelled as such in the repo |
