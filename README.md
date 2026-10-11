# gform-log

Google has no list of the Google Forms you have answered. The Forms API only opens forms you own or
can edit, and the owner of a form holds its responses. This repo builds that list yourself, from the
places a record actually exists: your browser.

## Forms I Answered (Chrome / Edge / Brave extension)

The extension lists every Google Form you have opened or submitted, and whether each one still
accepts responses.

- **Past forms.** On install it reads all the history this browser still has. Chrome keeps about 90
  days.
- **Future forms.** From then on it records each form as you open it, and marks it submitted when
  you reach the page Google shows after pressing Submit (or the "already responded" page).
- **Every desktop browser.** Records are kept in the browser's sync storage, so every desktop Chrome
  signed in to the same Google account (with sync on) shows one merged list. Edge does the same
  across Edge browsers signed in to one Microsoft account. Chrome and Edge do not share a list.
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
| alarms | run the open/closed check once a day |
| docs.google.com | read form titles, and load forms for the open/closed check |

### Known limits

- Tested against fake Google Forms pages in Chromium, not yet against live Google Forms. Before
  relying on the "Submitted" column, submit a test form and check that it shows up.
- Private windows and cleared history leave no record.
- Forms answered in another app's built-in browser (Instagram, Discord, Teams) never reach Chrome's
  history.
- The open/closed check reads Google's public form page, which Google can change without notice.

### The signing key

`manifest.json` holds only the public half of the key. The private half is not in this repo and must
never be committed (`*.pem` is ignored). You need it once: when first uploading to the Chrome Web
Store, put it in the root of the zip, named `key.pem`, and the store keeps the same ID. If it is
lost, the store assigns a new ID; replace `key` in the manifest with the one the store shows, and
update `EXTENSION_ID` in `tests/manifest.test.js`.

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
npm run test:browser   # loads the extension into Chromium against fake Google pages
npm run zip            # packs extension/ into forms-i-answered.zip
```

GitHub Actions runs both test suites on every pull request and every push to main, and keeps the
browser test's screenshots as a build artifact.
