# gform-log

Google has no list of the Google Forms you have answered. The Forms API only opens forms you own or
can edit, and the owner of a form holds its responses. This repo builds that list yourself, from the
places a record actually exists: your browser.

## Form History (Chrome / Edge / Brave extension)

The extension lists every Google Form you have opened or submitted, and whether each one still
accepts responses.

- **Past forms.** On install it reads all the history this browser still has. Chrome keeps about 90
  days.
- **Future forms.** From then on it records each form as you open it, and marks it submitted when
  you reach the page Google shows after pressing Submit (or the "already responded" page).
- **Every desktop browser.** Records are kept in the browser's sync storage, so every desktop Chrome
  signed in to the same Google account (with sync on) shows one merged list. Edge does the same
  across Edge browsers signed in to one Microsoft account.
- **Chrome and Edge together.** Sign in with Google in each browser, and they share one list through
  a hidden file in your own Google Drive. See "Share between Chrome and Edge" below.
- **Phones.** Phone browsers cannot run extensions. Import a Google Takeout export of your Chrome
  history (below) to add what your phone's synced Chrome history still holds.
- **Open or closed, daily.** Once a day, starting a few minutes after install, it loads each form
  with your own sign-in and reports open, closed, sign-in needed, already responded, deleted or
  unknown. "Check now" runs the same check on demand. The list page shows when it
  last ran.
- **Export.** "Download CSV", under "More options", saves the list as it is filtered.

### The list

Each form shows two marks: **Submitted** or **Not submitted**, and **Open**, **Closed** or a grey
"not known yet" mark. Tabs filter to Open, Submitted or Closed, with a count on each. Open forms you
have not submitted come first, because those are the ones still worth acting on. Rescanning,
importing, exporting, renaming this browser and showing forms you made yourself are under
"More options".

### Devices

The **Devices** row lists every browser and device the list knows about, with how many items each
saw. Click one to show only what was seen there. A device gets there in one of four ways:

| shown as | what it is | how it gets there |
|---|---|---|
| This browser | the browser you are looking at | always |
| Form History installed | another browser running the extension | it reports in through Chrome sync (Chrome to Chrome) or the shared Google Drive file (any browser that signed in) |
| Open tabs via Chrome sync | any other Chrome on the account, phones included, even without the extension | Chrome's own list of synced devices (`chrome.sessions`). Forms and sent applications in its **open tabs** are added under its name |
| History via Chrome sync ("Synced from other devices") | every other Chrome on the account, phones included | Chrome's history includes visits synced in from your other devices, and marks them as not local. Chrome does not say which device, so they share one name |
| Named on items | a name found on items but not reporting in | an older version of the extension, or a browser renamed since |

History is read again every 30 minutes (the last three days) and once a day (all of it), because
Chrome fires no event when visits arrive from another device.

What it cannot see, and why:

- A Chrome without the extension shows up only through Chrome sync: its open tabs under its own
  name, and its history under "Synced from other devices". Both need Chrome sync of history turned
  on, on both devices. Chrome stops listing a device it has not heard from for a while.
- From a phone, a sent application is seen only when its address shows it (Greenhouse
  `/confirmation`, Lever `/thanks`). Ashby confirms on the same address, so an Ashby application sent
  from a phone cannot be seen. A Google Form sent from a phone shows as Submitted only if Chrome kept
  the response page in history, which is not yet verified.
- The Chrome-sync parts (open tabs, synced history) are tested with simulated data only. No real phone has been tried yet:
  open a Google Form on your phone's Chrome, then open the list on your computer and look for it.
- Safari on iPhone, Firefox, and in-app browsers (Instagram, Discord) never appear.
- Whether Edge reports synced devices to extensions the way Chrome does is not tested. Edge itself
  appears once the extension is installed there and signed in.
- Google's own list of signed-in devices (myaccount.google.com › Security › Your devices) has no
  API an extension can use.
- The same computer can appear twice: once by the name you gave the extension ("Chrome on Windows")
  and once by the name Chrome sync gives it ("DESKTOP-4F2K"), seen from your other Chromes. Items
  are counted against device names, so two browsers left with the same default name count as one:
  give each a distinct name under "More options".

### Job applications (Greenhouse, Lever, Ashby)

The list also records job applications you send on three common hiring sites. A posting you only
read is not listed; an application appears once it is sent, marked Submitted, with the site's name.

| Site | How a sent application is spotted | Confirmed on the live site? |
|---|---|---|
| Greenhouse | the address ends in `/confirmation` | yes, it shows up across many companies' boards |
| Lever | the address ends in `/thanks` | not yet |
| Ashby | a thank-you message appears after you press Submit | not yet |
| Greenhouse inside a company's own careers page | a thank-you message, as for Ashby | not yet |

The thank-you check only counts a message that appears after you press a Submit or Apply button, and
only if it is new: a page that already says "thank you for your interest", followed by a Submit that
fails, is not counted. Past Greenhouse and Lever applications are also found in your history, since
their addresses show they were sent.

"Check now" also checks each posting: Open while it is still up, Closed once it is gone. Ashby builds
its pages in the browser, so its postings show as Unclear.

If an application you sent does not appear, save the page shown after Submit (Ctrl+S) and send it in,
so the matching rule can be fixed.

### Install

1. Download this repo (Code › Download ZIP) and unzip it.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and pick the `extension` folder.
4. Click the extension's toolbar icon to open the list.

Repeat on each computer. Each one adds its own history to the shared list.

The extension always has the same ID, `mganadollnpacccnbhcmnjcebjkcikek`, wherever it is unzipped.
The `key` in `manifest.json` fixes it. That matters because browser sync storage is keyed to the ID:
without it, each computer's copy got an ID from its folder path, and the lists never merged.

**Upgrading from version 0.1.0:** the old copy had a path-based ID, so the new copy starts with an
empty list. Click "Download CSV" in the old copy first if you want to keep it, then remove the old
copy and load the new one. The first scan re-reads your history, so most of the list comes back
anyway.

### Update

Unpacked extensions never update themselves. On Windows, `tools/update.ps1` downloads the latest
version from GitHub and replaces the files in your extension folder (your list is not stored there):

```powershell
powershell -ExecutionPolicy Bypass -File update.ps1 -Target "C:\path\to\your\extension\folder"
```

Add `-Branch <name>` for a version not yet merged into `main`. Then click the reload arrow on Form
History's card in `chrome://extensions` (and `edge://extensions`). The script refuses to touch a
folder that does not hold Form History.

### Add your phone

Phone browsers cannot run extensions, so phone history has to arrive another way. Try the first route
before the second.

**1. Chrome sync (automatic, if it works).** The extension reads the history Chrome gives it. If
Chrome includes history synced from your phone, phone forms appear with no extra steps. Whether it
does is not documented, so test it once:

1. On your phone, in Chrome: open Settings, tap your account, then Sync, and make sure **History**
   is on. The menu wording differs a little between Android, iPhone and Chrome versions.
2. On your computer, in Chrome: Settings › You and Google › Sync and Google services › Manage what
   you sync, and make sure **History** is on. Both must be signed in to the same Google account.
3. On your phone, open any Google Form. You do not need to submit it.
4. Wait a minute or two, then on the computer open **More options** and click **Rescan this
   browser's history**.

If the form appears, synced history reaches the extension and your phone is covered from now on,
back as far as Chrome keeps history. If it does not appear after a few minutes, use route 2.

**2. Google Takeout (manual, any time).**

1. Open https://takeout.google.com, click **Deselect all**, then tick **Chrome**.
2. Under Chrome, click **All Chrome data included** and leave only **History** ticked.
3. Export once, download, and unzip.
4. In the extension, open **More options**, click **Import Google Takeout history** and pick `Chrome/History.json`
   (named `BrowserHistory.json` in some exports).

Takeout only has what Chrome sync uploaded, so your phone's Chrome needs history sync on (step 1
above). Takeout names devices by an opaque id, shown as "Takeout ab12cd". Repeat the export
whenever you want to bring the list up to date; importing the same file twice adds nothing twice.

### Share between Chrome and Edge

Chrome and Edge sync through different accounts, so on their own they keep separate lists. Signing
in with Google in each browser makes them share one list, kept as a hidden file in your own Google
Drive. There is no server to run.

- **What it can reach:** only Drive's app-data folder. That is a hidden folder that only this
  extension can see, so it cannot read, list or change any of your files.
- **When it syncs:** a minute after anything changes, every 30 minutes, when the browser starts, and
  when you press "Sync now".
- **How it merges:** nothing is lost when two browsers sync at once. "Forget everything" in one
  browser clears the others at their next sync.
- **Where the sign-in lives:** in memory only, for an hour at a time. It renews quietly while you
  stay signed in to Google in that browser.

**Installed from a store?** Skip this setup: the client ID is built in, so just click "Sign in with
Google". The steps below are for unpacked copies built without one (see Publishing).

**One-time setup in Google Cloud (about 10 minutes).** Google requires every app that signs people
in to have its own client ID. The project you made for form-board works, or create a new one.

1. Open https://console.cloud.google.com and pick the project.
2. Go to **APIs & Services › Library**, search for **Google Drive API**, and click **Enable**.
3. Go to **Google Auth Platform** (called **OAuth consent screen** in some versions).
   - If it asks you to get started, give the app a name, such as "Form History", and your email.
     Choose **External**.
   - Under **Data access**, click **Add or remove scopes**. Add
     `https://www.googleapis.com/auth/drive.appdata`, which Google lists as "See, create, and delete
     its own configuration data in your Google Drive".
   - Under **Audience**, either add your Google address as a test user, or click **Publish app**.
     While it is in testing, only test users can sign in.
4. Go to **Clients › Create client**. Choose **Web application** and name it anything. Under
   **Authorized redirect URIs**, add exactly:

   ```
   https://mganadollnpacccnbhcmnjcebjkcikek.chromiumapp.org/
   ```

   Click **Create** and copy the **Client ID**. You do not need the client secret; never paste it
   anywhere.
5. In the extension, open **More options**, paste the client ID under "Share this list between
   Chrome and Edge", and click **Save**. Then click **Sign in with Google**.
6. In Edge, do step 5 again. Edge does not receive Chrome's settings, so it needs the client ID once.

After that, the line under "Check now" reads "Shared through Google Drive. Synced …" in both
browsers. "Sign out" stops sharing. The browser keeps its own list, and the file in Drive stays for
your other browsers.

Not yet verified: this has been tested with two Chromium profiles against a fake Google Drive, but
not yet with a real Google client ID or in a real Edge.

### What it stores, and where

For each form: its title, the dates it was last seen, submitted and seen closed, and the names of the
browsers it was seen in. No answers, no page contents. It lives in your browser's own storage and,
through browser sync, in your Google (or Microsoft) account. Nothing is sent anywhere else. Sync
storage holds a few hundred forms. Past that, extra records stay in the browser that found them and the
list says so. "Forget everything" deletes the records from every synced browser.

### Permissions

| permission | why |
|---|---|
| history | read past visits to Google Forms |
| webNavigation | catch the page after Submit even if history leaves it out |
| storage | keep and sync the list |
| sessions | list this account's other Chrome devices and the forms open in their tabs |
| alarms | run the open/closed check once a day, and sync every 30 minutes |
| identity | open Google's sign-in window for sharing between browsers |
| www.googleapis.com, oauth2.googleapis.com | read and write the shared file in Drive's app-data folder; sign out |
| docs.google.com | read form titles, and load forms for the open/closed check |
| Greenhouse, Lever and Ashby job sites | spot a sent application, and check whether a posting is still up |

### Known limits

- Tested against fake Google Forms pages in Chromium, not yet against live Google Forms. Before
  relying on the "Submitted" column, submit a test form and check that it shows up.
- Private windows and cleared history leave no record.
- Forms answered in another app's built-in browser (Instagram, Discord, Teams) never reach Chrome's
  history.
- The open/closed check reads Google's public form page, which Google can change without notice.

## Publishing

What is ready in this repo: the homepage and privacy policy in `docs/`, the listing text and images in
`store/`, and `npm run zip:store`, which builds the package the stores want. The steps below need your
accounts, in this order.

1. **Turn on GitHub Pages.** In the repo's Settings › Pages, set Source to "Deploy from a branch",
   branch `main`, folder `/docs`. The site appears at https://allenwilk007-source.github.io/gform-log/
   within a few minutes. Both the store and Google need its privacy page.
2. **Build in the client ID.** Put your Google client ID (it ends in `.apps.googleusercontent.com`)
   in `extension/src/config.js`. It is public by design; the client *secret* never goes in the repo.
   Store users then only see "Sign in with Google".
3. **Get Google's approval to go public.** In Google Auth Platform:
   - Branding: app name "Form History", your support email, homepage
     `https://allenwilk007-source.github.io/gform-log/`, privacy policy
     `https://allenwilk007-source.github.io/gform-log/privacy.html`, and authorized domain
     `allenwilk007-source.github.io`. Leave the logo empty: a logo makes Google review the branding.
   - Audience: click **Publish app**. While it is "Testing", only listed test users can sign in.
   - `drive.appdata` is a non-sensitive scope, so there is no security assessment. If Google asks you
     to prove you own the domain, it gives you a tag to add to `docs/index.html`.
4. **Upload a draft to the Chrome Web Store.** Register at the Chrome Web Store Developer Dashboard
   (a one-time $5 fee). Run `npm run zip:store`, choose New item, upload `form-history-store.zip`,
   and fill in the listing from `store/listing.md`. **Save it as a draft; do not submit yet.**
5. **Adopt the store's ID.** The store assigns the extension a new ID. On the item's Package tab, copy
   the public key, put it in `extension/manifest.json` as `key` (one line, no BEGIN/END lines), and
   update `EXTENSION_ID` in `tests/manifest.test.js` and the IDs in the browser tests. Unpacked
   copies then share the store's ID.
6. **Allow sign-in from the store's ID.** In Google Auth Platform › Clients, open your client and add
   `https://<store ID>.chromiumapp.org/` to Authorized redirect URIs. Keep the old one while you
   still use unpacked copies.
7. **Submit for review**, with visibility **Unlisted** first. Install it from the store, sign in,
   and check that your list comes back. It is kept in your Drive, not under the old ID.
   Then switch to Public.
8. **Edge Add-ons (free).** Upload the same zip at Microsoft Partner Center. Edge gives it its own
   ID: add that ID's `https://<edge ID>.chromiumapp.org/` redirect URI as well. Edge and Chrome
   installs still share one list, because the Drive file belongs to your Google Cloud project, not
   to an extension ID.

The private key from the earlier unpacked setup (`forms-i-answered-key.pem`) is not needed for the
store, which issues its own. Keep it anyway until the store ID is in the manifest.

## tools/find_forms_in_history.py

A one-off alternative to the extension. It reads the History files of every Chrome, Edge and Brave
profile on one computer and writes `google_forms.csv`. Needs only Python 3.

```bash
python tools/find_forms_in_history.py
```

## Development

```bash
npm install
npm test               # unit tests for the parsing and merging logic
npm run test:browser   # loads the extension into Chromium against fake Google pages, runs two
                       # browser profiles that share one list through a fake Google Drive, and
                       # applies to jobs on fake Greenhouse, Lever and Ashby pages
npm run zip            # packs extension/ into form-history.zip, for loading unpacked
npm run zip:store      # the store package: no "key" field, and requires a built-in client ID
node tools/store-screenshots.mjs   # re-renders the store images in store/ from sample data
```

GitHub Actions runs both test suites on every pull request and every push to main, and keeps the
browser test's screenshots as a build artifact.
