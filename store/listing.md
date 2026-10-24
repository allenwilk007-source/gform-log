# Chrome Web Store listing: Form History

Paste these into the Developer Dashboard. Edge Add-ons asks for the same things.

## Store listing tab

**Name:** Form History

**Summary** (at most 132 characters):

> See every Google Form you've answered and every job application you've sent, and whether each is still open.

**Description:**

> Form History keeps one list of the Google Forms you have opened or answered, and the job applications you have sent, so you can find them again and see which are still open.
>
> • Google Forms: every form you open is listed, and marked Submitted once you send it.
> • Job applications: applications sent on Greenhouse, Lever and Ashby are recorded with the job title and date. Postings you only read are not listed.
> • Still open? Once a day it checks whether each form still takes responses and each posting is still up. "Check now" does it on demand.
> • Every computer: sign in with Google in Chrome and Edge, and all your browsers share one list.
> • Past forms: on install it finds the forms already in your browser history. A Google Takeout export adds your phone's Chrome history.
> • Filters for Open, Submitted and Closed, search, and CSV export.
>
> Form History is not affiliated with or endorsed by Google, Greenhouse, Lever or Ashby.
>
> Private by design: there is no Form History server. Your list stays in your browser and, if you sign in, in a hidden file in your own Google Drive that only this extension can open. No ads, no tracking, nothing sold. Open source: https://github.com/allenwilk007-source/gform-log

**Category:** Productivity, then Workflow & Planning (or the closest Productivity category offered).

**Language:** English

**Images** (all in this folder):

| Field | File |
|---|---|
| Store icon, 128×128 | `extension/icons/icon-128.png` |
| Screenshots, 1280×800 | `screenshot-1-list.png`, `screenshot-2-open.png`, `screenshot-3-sharing.png` |
| Small promo tile, 440×280 | `promo-tile-440x280.png` |

To re-render the images after changing the page: `node tools/store-screenshots.mjs`. They use made-up sample data.

**Homepage URL:** https://allenwilk007-source.github.io/gform-log/

**Support URL:** https://github.com/allenwilk007-source/gform-log/issues

## Privacy tab

**Single purpose:**

> Keep a list of the Google Forms a person has opened or submitted and the job applications they have sent, and show whether each is still open.

**Permission justifications:**

| Permission | Justification |
|---|---|
| history | Finds the Google Forms and job applications already in the browser's history when the extension is installed, and notices new ones. Every other page is skipped and nothing else is stored. |
| webNavigation | Records the page shown after a Google Form or job application is submitted, including pages that change their address without loading a new page, which history alone can miss. |
| storage | Keeps the list in the browser and syncs it between the user's browsers. |
| sessions | Lists the user's other Chrome devices on the same account, so the list can show every device it covers, and adds any Google Form or sent job application open in their tabs. Other tabs are ignored and nothing about them is stored. |
| alarms | Runs the once-a-day check of whether each form and posting is still open, and the half-hourly sync. |
| identity | Opens Google's sign-in window when the user chooses to share the list between browsers through their own Google Drive. |
| Host permission: docs.google.com | Reads the titles of Google Forms the user opens, and loads each listed form to check whether it still accepts responses. |
| Host permissions: Greenhouse, Lever and Ashby job sites | Detects that a job application was sent, and loads each listed posting to check whether it is still up. |
| Host permissions: www.googleapis.com, oauth2.googleapis.com | Reads and writes the one shared file in the Drive app-data folder, and revokes sign-in when the user signs out. |
| Content script on the job sites | After the user presses Submit, checks the page for a thank-you message. The page text is not stored or sent. |

**Remote code:** No, I am not using remote code. Every script is in the package.

**Data usage**, under "What user data do you plan to collect from users now or in the future?". The data stays on the user's devices and in their own Google Drive; tick what the extension handles:

- [x] Personally identifiable information: the signed-in Google email address, shown as "Signed in as …" and kept in the browser only.
- [x] Web history: addresses and titles of Google Forms and job application pages.
- [x] Website content: the text of a job site page just after Submit, checked for a thank-you message and not stored.
- Everything else: not collected.

Tick all three certifications:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://allenwilk007-source.github.io/gform-log/privacy.html

## Distribution tab

**Visibility:** start with **Unlisted**, so only people with the link can install it while you check the store build; switch to **Public** once it works.
**Regions:** all regions.
