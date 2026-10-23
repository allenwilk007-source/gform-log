# Plan 1: Product — from form list to application tracker

**Goal:** one place that knows every form you answered and every application you sent, wherever it
happened, and tells you what still needs doing.

## Where it stands (version 0.5)

| Area | Status |
|---|---|
| Google Forms: opened, submitted, open or closed | Working; checked on a real Chrome |
| Greenhouse applications | Built; its confirmation address is confirmed on live boards |
| Lever applications | Built; not yet confirmed on a live board |
| Ashby applications | Built; not yet confirmed on a live board |
| Sharing between Chrome and Edge through Google Drive | Built; Chrome sign-in works; Chrome-to-Edge not yet confirmed |
| Phones | Only through a Google Takeout import |

## Next, in order

Each step is small enough to ship on its own. Each new site follows the same recipe: you save the
page shown after a real application (Ctrl+S), I write the rule against it, and a test keeps it working.

1. **Confirm what is built.** Apply once on Lever and once on Ashby; open a form in Edge and sync.
   Nothing else is worth building until these three work for real.
2. **Application stages.** Let each application move through Applied, Interviewing, Offer, Rejected,
   with a private note. This is what turns a list into a tracker, and the strongest reason to pay later.
3. **Workday.** Very common for large employers. Every company has its own address
   (`company.wd5.myworkdayjobs.com`), so detection uses the thank-you message, like Ashby.
4. **Handshake.** The student niche. Needs saved pages from you, because it is behind a sign-in.
5. **SmartRecruiters, iCIMS, Jobvite.** Cheaper once Workday's approach exists.
6. **Reminders.** A browser notification for forms and postings that are open, unanswered, and closing
   soon (when the page states a deadline).
7. **LinkedIn and Indeed: last, maybe never.** LinkedIn works against extensions that read its pages,
   and both change often. Revisit only if users ask for them repeatedly.

## What not to build

- **A job board or job search.** That is a different, crowded product. Form History tracks what you did.
- **Automatic applying.** It breaks the job sites' terms and would put the store listing at risk.
- **Reading your email.** Google's permission for that needs a paid annual security assessment.
