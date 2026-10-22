// Job applications on applicant-tracking sites. Pure logic, like forms.js: no chrome.* calls.
//
// Unlike a Google Form, a job posting is not worth listing just because it was viewed: people read
// dozens. A job is recorded only once the application is sent, which shows up in one of two ways:
//   - the address: Greenhouse sends you to .../jobs/<id>/confirmation (seen on many live boards);
//     Lever is believed to use .../<id>/thanks (not yet confirmed on a live board).
//   - the page: a thank-you message appearing right after you press Submit. Ashby keeps the same
//     address after submitting, so this is the only signal there. See content/apply.js.
//
// Keys look like "gh:acme/4012345678": site, company slug, posting id. Google Forms keys have no
// colon, so the two never collide.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GREENHOUSE_HOST = /^(?:job-boards|boards)(?:\.eu)?\.greenhouse\.io$/;

export const SITE_NAMES = { gh: 'Greenhouse', lv: 'Lever', lve: 'Lever', ab: 'Ashby' };

/** Host patterns for the manifest's content script and permissions, kept here so tests can check them. */
export const JOB_HOSTS = [
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'boards.eu.greenhouse.io',
  'job-boards.eu.greenhouse.io',
  'jobs.lever.co',
  'jobs.eu.lever.co',
  'jobs.ashbyhq.com',
];

function job(site, company, id, submitted) {
  const slug = decodeURIComponent(company).toLowerCase();
  if (!/^[\w.-]{1,100}$/.test(slug)) return null;
  return { key: `${site}:${slug}/${id.toLowerCase()}`, site, company: slug, id: id.toLowerCase(), submitted };
}

/** A job application page: { key, site, company, id, submitted } or null. */
export function parseJobUrl(url) {
  let u;
  try {
    u = new URL(String(url ?? ''));
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const parts = u.pathname.split('/').filter(Boolean);

  if (GREENHOUSE_HOST.test(u.hostname)) {
    // Embedded on a company's own careers page: /embed/job_app?for=<company>&token=<id>
    if (parts[0] === 'embed') {
      const company = u.searchParams.get('for');
      const id = u.searchParams.get('token') ?? '';
      return company && /^\d+$/.test(id) ? job('gh', company, id, parts.includes('confirmation')) : null;
    }
    // /<company>/jobs/<id> and, once sent, /<company>/jobs/<id>/confirmation
    if (parts[1] === 'jobs' && /^\d+$/.test(parts[2] ?? '')) return job('gh', parts[0], parts[2], parts[3] === 'confirmation');
    return null;
  }
  if (u.hostname === 'jobs.lever.co' || u.hostname === 'jobs.eu.lever.co') {
    // /<company>/<uuid>, /<company>/<uuid>/apply, and once sent /<company>/<uuid>/thanks
    if (!UUID.test(parts[1] ?? '')) return null;
    return job(u.hostname === 'jobs.lever.co' ? 'lv' : 'lve', parts[0], parts[1], parts[2] === 'thanks');
  }
  if (u.hostname === 'jobs.ashbyhq.com') {
    // /<company>/<uuid> and /<company>/<uuid>/application; the address does not change on sending.
    if (!UUID.test(parts[1] ?? '')) return null;
    return job('ab', parts[0], parts[1], false);
  }
  return null;
}

export const isJobKey = (key) => /^(?:gh|lv|lve|ab):/.test(String(key));

function splitKey(key) {
  const [, site, company, id] = /^(\w+):([^/]+)\/(.+)$/.exec(key) ?? [];
  return { site, company, id };
}

/** Where the posting lives, to open it or to check whether it is still up. */
export function jobLink(key) {
  const { site, company, id } = splitKey(key);
  const c = encodeURIComponent(company ?? '');
  switch (site) {
    case 'gh':
      return `https://job-boards.greenhouse.io/${c}/jobs/${id}`;
    case 'lv':
      return `https://jobs.lever.co/${c}/${id}`;
    case 'lve':
      return `https://jobs.eu.lever.co/${c}/${id}`;
    case 'ab':
      return `https://jobs.ashbyhq.com/${c}/${id}`;
    default:
      return '';
  }
}

/** { site: "Greenhouse", company: "acme" } for showing an application without a recorded title. */
export function jobLabel(key) {
  const { site, company } = splitKey(key);
  return { site: SITE_NAMES[site] ?? 'Job site', company: company ?? '' };
}

/** "Job Application for Data Analyst at Acme" reads better as "Data Analyst at Acme". */
export function cleanJobTitle(title) {
  return String(title ?? '').replace(/^\s*job application for\s+/i, '');
}

/**
 * Whether a posting is still up, from loading its page. A missing page, or being sent somewhere
 * else (Greenhouse sends closed postings back to the board), means closed. Ashby builds its pages
 * in the browser, so a page that loads proves nothing there.
 */
export function jobStatus(key, finalUrl, httpStatus) {
  if (httpStatus === 404 || httpStatus === 410) return 'closed';
  if (httpStatus >= 400) return 'unknown';
  const landed = parseJobUrl(finalUrl);
  if (!landed || landed.key !== key) return 'closed';
  return key.startsWith('ab:') ? 'unknown' : 'open';
}
