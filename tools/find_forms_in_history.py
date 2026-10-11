#!/usr/bin/env python3
"""
List every Google Form found in your Chrome, Edge and Brave history, on Windows, macOS or Linux.

Read-only: it copies each History file to a temp folder and reads the copy, so the browser's
own file is never touched. Nothing is sent anywhere. Output goes to the screen and google_forms.csv.

    python find_forms_in_history.py
"""
import csv, os, platform, re, shutil, sqlite3, sys, tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

home = Path.home()
system = platform.system()
if system == "Windows":
    local = Path(os.environ.get("LOCALAPPDATA", home / "AppData/Local"))
    ROOTS = {"Chrome": local / "Google/Chrome/User Data",
             "Edge": local / "Microsoft/Edge/User Data",
             "Brave": local / "BraveSoftware/Brave-Browser/User Data"}
elif system == "Darwin":
    sup = home / "Library/Application Support"
    ROOTS = {"Chrome": sup / "Google/Chrome",
             "Edge": sup / "Microsoft Edge",
             "Brave": sup / "BraveSoftware/Brave-Browser"}
else:
    cfg = home / ".config"
    ROOTS = {"Chrome": cfg / "google-chrome",
             "Edge": cfg / "microsoft-edge",
             "Brave": cfg / "BraveSoftware/Brave-Browser"}

# Chrome stores time as microseconds since 1601-01-01 UTC.
EPOCH_1601 = datetime(1601, 1, 1, tzinfo=timezone.utc)
def when(us):
    return (EPOCH_1601 + timedelta(microseconds=us)).astimezone().strftime("%Y-%m-%d %H:%M") if us else ""

# docs.google.com/forms/d/e/<published id>/viewform   (opened)
# docs.google.com/forms/d/e/<published id>/formResponse (submitted)
# docs.google.com/forms/d/<edit id>/...                 (a form you can edit)
FORM_RE = re.compile(r"docs\.google\.com/forms/(?:u/\d+/)?d/(e/)?([A-Za-z0-9_-]{20,})(?:/([A-Za-z]+))?")
SHORT_RE = re.compile(r"forms\.gle/([A-Za-z0-9]+)")

QUERY = """
SELECT url, title, visit_count, last_visit_time FROM urls
WHERE url LIKE '%docs.google.com/forms/%' OR url LIKE '%forms.gle/%'
"""

forms = {}   # key -> row
problems = []
for browser, root in ROOTS.items():
    if not root.is_dir():
        continue
    for hist in sorted(root.glob("*/History")):
        profile = hist.parent.name
        with tempfile.TemporaryDirectory() as tmp:
            copy = Path(tmp) / "History"
            try:
                shutil.copy2(hist, copy)
            except OSError as e:
                problems.append(f"{browser} / {profile}: could not copy ({e}). Close {browser} and run again.")
                continue
            con = sqlite3.connect(f"file:{copy}?mode=ro", uri=True)
            try:
                rows = con.execute(QUERY).fetchall()
            except sqlite3.DatabaseError as e:
                problems.append(f"{browser} / {profile}: could not read ({e}).")
                rows = []
            finally:
                con.close()
        for url, title, visits, last in rows:
            m = FORM_RE.search(url)
            if m:
                published, form_id, action = bool(m.group(1)), m.group(2), (m.group(3) or "")
                key = form_id
                link = f"https://docs.google.com/forms/d/{'e/' if published else ''}{form_id}/{'viewform' if published else 'edit'}"
                kind = "you can edit" if not published else "respondent"
            else:
                s = SHORT_RE.search(url)
                if not s:
                    continue
                key, link, action, kind = "gle:" + s.group(1), f"https://forms.gle/{s.group(1)}", "", "short link"
            f = forms.setdefault(key, {"title": "", "link": link, "kind": kind, "submitted": False,
                                       "visits": 0, "last": 0, "where": set()})
            # "Google Forms" and blank titles say nothing; keep the most specific one seen.
            if title and title.strip() not in ("Google Forms", "") and len(title) > len(f["title"]):
                f["title"] = title.strip()
            f["submitted"] |= action.lower() == "formresponse"
            f["visits"] += visits or 0
            f["last"] = max(f["last"], last or 0)
            f["where"].add(f"{browser}/{profile}")

for p in problems:
    print("!", p, file=sys.stderr)
if not forms:
    print("No Google Forms found in any Chrome, Edge or Brave profile on this computer.")
    sys.exit(0)

rows = sorted(forms.values(), key=lambda f: f["last"], reverse=True)
out = Path("google_forms.csv")
with out.open("w", newline="", encoding="utf-8") as fh:
    w = csv.writer(fh)
    w.writerow(["last opened", "submitted", "kind", "title", "link", "visits", "browser/profile"])
    for f in rows:
        w.writerow([when(f["last"]), "yes" if f["submitted"] else "", f["kind"], f["title"],
                    f["link"], f["visits"], "; ".join(sorted(f["where"]))])

for f in rows:
    mark = "SUBMITTED" if f["submitted"] else "opened   "
    print(f"{when(f['last'])}  {mark}  {f['title'][:60] or '(no title)':60}  {f['link']}")
print(f"\n{len(rows)} form(s), {sum(f['submitted'] for f in rows)} submitted. Saved to {out.resolve()}")
