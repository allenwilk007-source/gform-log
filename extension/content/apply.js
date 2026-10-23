// Runs on Greenhouse, Lever and Ashby job pages (also when Greenhouse is embedded in a company's
// own careers page). It reports an application as sent when a thank-you message appears shortly
// after the person presses a Submit or Apply button.
//
// To avoid false alarms it only counts a thank-you message that is new: if the page already said
// "thank you for your interest" before the click, and the click just shows a validation error, the
// count of such messages does not go up and nothing is reported. Nothing is read or sent except the
// page address and title, and only for that one event.
(() => {
  const CONFIRMATION =
    /thank(?:s| you)[^.!\n]{0,40}\b(?:applying|application|applied)\b|application (?:has been |was |is )?(?:successfully )?(?:submitted|received|sent)|(?:we(?:'ve| have)|successfully) (?:received|submitted) your application|your application (?:has been|was) (?:submitted|received|sent)/gi;
  const SUBMIT_WORDS = /\b(submit|apply|send)\b/i;
  const ARMED_FOR_MS = 2 * 60 * 1000;

  let armedUntil = 0;
  let countAtArm = 0;
  let titleAtArm = '';
  let reported = false;
  let timer = 0;

  const pageText = () => document.body?.innerText ?? '';
  const countMatches = (text) => (text.match(CONFIRMATION) ?? []).length;
  const pageTitle = () =>
    document.querySelector('meta[property="og:title"]')?.content?.trim() ||
    document.title.trim() ||
    document.querySelector('h1')?.innerText?.trim() ||
    '';

  function arm() {
    armedUntil = Date.now() + ARMED_FOR_MS;
    countAtArm = countMatches(pageText());
    // The title before sending names the job; the thank-you page often does not. Tell the extension
    // now, in case Submit leads to a new page (Greenhouse, Lever) and this script never sees the result.
    titleAtArm = pageTitle();
    chrome.runtime.sendMessage({ type: 'applying', title: titleAtArm }).catch(() => {});
  }

  function check() {
    timer = 0;
    if (reported || Date.now() > armedUntil) return;
    if (countMatches(pageText()) <= countAtArm) return;
    reported = true;
    chrome.runtime.sendMessage({ type: 'applied', title: titleAtArm || pageTitle() }).catch(() => {});
  }

  document.addEventListener('submit', arm, true);
  document.addEventListener(
    'click',
    (e) => {
      const button = e.target instanceof Element ? e.target.closest('button, input[type="submit"], [role="button"]') : null;
      const label = button ? button.innerText || button.value || button.getAttribute('aria-label') || '' : '';
      if (SUBMIT_WORDS.test(label)) arm();
    },
    true,
  );
  // Reading the whole page on every change would be wasteful: look at most every 150 ms, and once
  // more if the person leaves the page straight after the thank-you message appears.
  new MutationObserver(() => {
    if (!timer && !reported && Date.now() <= armedUntil) timer = setTimeout(check, 150);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  addEventListener('pagehide', check);
})();
