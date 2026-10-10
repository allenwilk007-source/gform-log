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
- **Open or closed.** "Check which are still open" loads each form with your own sign-in and reports
  open, closed, sign-in needed, already responded, deleted or unknown.
- **Export.** "Download CSV" saves the list as it is filtered.

### Install

1. Download this repo (Code › Download ZIP) and unzip it.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and pick the `extension` folder.
4. Click the extension's toolbar icon to open the list.

Repeat on each computer. Each one adds its own history to the shared list.

### Add your phone with Google Takeout

1. Open https://takeout.google.com, click **Deselect all**, then tick **Chrome**.
2. Under Chrome, click **All Chrome data included** and leave only **History** ticked.
3. Export once, download, and unzip.
4. In the extension, click **Import Google Takeout history** and pick `Chrome/History.json`
   (named `BrowserHistory.json` in some exports).

Takeout only has what Chrome sync uploaded, so your phone's Chrome needs history sync on. Takeout
names devices by an opaque id, shown as "Takeout ab12cd".

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
| docs.google.com | read form titles, and load forms for the open/closed check |

### Known limits

- Tested against fake Google Forms pages in Chromium, not yet against live Google Forms. Before
  relying on the "Submitted" column, submit a test form and check that it shows up.
- Private windows and cleared history leave no record.
- Forms answered in another app's built-in browser (Instagram, Discord, Teams) never reach Chrome's
  history.
- The open/closed check reads Google's public form page, which Google can change without notice.

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
