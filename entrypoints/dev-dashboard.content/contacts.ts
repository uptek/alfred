// An app's installs list each store contact in a popover, with the email and
// phone as plain text. This links them (mail, call and WhatsApp) and gives
// each a copy button.

import { sendTrackEvent } from '@/utils/analytics';
import type { AnalyticsAction } from '@/utils/analytics-actions';

const svg = (body: string, viewBox = '0 0 20 20') =>
  `<svg width="16" height="16" viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;

const COPY_ICON = svg(
  '<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="7.25" y="7.25" width="9.5" height="9.5" rx="2"/><path d="M12.75 7.25v-2a2 2 0 0 0-2-2h-5.5a2 2 0 0 0-2 2v5.5a2 2 0 0 0 2 2h2"/></g>'
);
const CHECK_ICON = svg(
  '<path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="m5 10.5 3.25 3.25L15 7"/>'
);
// Simple Icons' WhatsApp mark, padded to sit at the stroke icons' visual size
const WHATSAPP_ICON = svg(
  '<path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.304-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>',
  '-2 -2 28 28'
);

/**
 * Starts the copy buttons and tracks clicks on every contact control. One
 * delegated listener, so controls in Turbo's cached page clones work too.
 */
export function initContacts() {
  document.addEventListener('click', (e) => {
    const control = (e.target as Element).closest?.<HTMLElement>('[data-alfred-track]');
    if (!control) return;
    sendTrackEvent(control.dataset.alfredTrack as AnalyticsAction);
    const value = control.dataset.alfredCopy;
    if (value === undefined) return;
    navigator.clipboard.writeText(value).then(() => {
      control.innerHTML = CHECK_ICON;
      setTimeout(() => (control.innerHTML = COPY_ICON), 1500);
    });
  });
}

/** Links the contact email and phone in install popovers. Runs on every DOM mutation, so done fields are skipped. */
export function syncContacts() {
  // The phone comes before the location it's read with, so a half-parsed popover waits
  if (document.readyState === 'loading') return;

  for (const dd of document.querySelectorAll<HTMLElement>('.altair-popover__surface dt + dd:not(.alfred-contact)')) {
    const label = dd.previousElementSibling!.textContent!.trim();
    const value = dd.textContent!.trim();
    if (!value || (label !== 'Email' && label !== 'Phone')) continue;
    dd.classList.add('alfred-contact');

    if (label === 'Email') {
      dd.replaceChildren(
        link(`mailto:${value}`, value, 'dev.contacts.email_click'),
        copyButton(value, 'Copy email', 'dev.contacts.email_copy')
      );
      continue;
    }

    const number = internationalNumber(value, fieldText(dd, 'Location'));
    dd.replaceChildren(
      link(number ? `tel:+${number}` : `tel:${value.replace(/[^\d+]/g, '')}`, value, 'dev.contacts.phone_click'),
      copyButton(value, 'Copy phone', 'dev.contacts.phone_copy')
    );
    if (number) {
      const whatsapp = link(`https://wa.me/${number}`, '', 'dev.contacts.whatsapp_click');
      whatsapp.target = '_blank';
      whatsapp.rel = 'noopener noreferrer';
      dd.append(asAction(whatsapp, WHATSAPP_ICON, 'Open in WhatsApp'));
    }
  }
}

function link(href: string, text: string, track: AnalyticsAction) {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  a.dataset.alfredTrack = track;
  return a;
}

function copyButton(value: string, title: string, track: AnalyticsAction) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.alfredCopy = value;
  button.dataset.alfredTrack = track;
  return asAction(button, COPY_ICON, title);
}

/** Makes a control an icon button, labeled by its title. */
function asAction(control: HTMLElement, icon: string, title: string) {
  control.className = 'alfred-contact__action';
  control.title = title;
  control.innerHTML = icon;
  return control;
}

function fieldText(dd: Element, label: string) {
  const dt = [...(dd.closest('dl')?.querySelectorAll('dt') ?? [])].find((el) => el.textContent?.trim() === label);
  return dt?.nextElementSibling?.textContent?.trim() ?? '';
}

/**
 * A phone number in international form, digits only, as WhatsApp links take
 * it. Merchants enter numbers in any format, so one without a + or 00 prefix is
 * read as a national number of `country`.
 * @param country The store's country, as the dashboard names it
 * @returns undefined when the number has no country code and `country` is unknown
 */
export function internationalNumber(phone: string, country: string): string | undefined {
  const digits = phone.replace(/\D/g, '');
  if (phone.trimStart().startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  const code = callingCode(country);
  if (!code) return;
  // ponytail: an 11+ digit number led by the calling code is taken to include
  // it, so a national number that long and starting with it is misread.
  // Per-country number lengths (libphonenumber) if that bites.
  if (digits.length >= 11 && digits.startsWith(code)) return digits;
  // National numbers drop their trunk 0, except in Italy, where landlines keep it
  return code + (code === '39' ? digits : digits.replace(/^0/, ''));
}

// ITU calling codes, each followed by the regions that use it
const CALLING_CODES = `1 US CA AG AI AS BB BM BS DM DO GD GU JM KN KY LC MP MS PR SX TC TT UM VC VG VI
7 RU KZ
20 EG
27 ZA
30 GR
31 NL
32 BE
33 FR
34 ES
36 HU
39 IT VA
40 RO
41 CH
43 AT
44 GB GG IM JE
45 DK
46 SE
47 NO SJ
48 PL
49 DE
51 PE
52 MX
53 CU
54 AR
55 BR
56 CL
57 CO
58 VE
60 MY
61 AU CC CX
62 ID
63 PH
64 NZ PN
65 SG
66 TH
81 JP
82 KR
84 VN
86 CN
90 TR
91 IN
92 PK
93 AF
94 LK
95 MM
98 IR
211 SS
212 MA EH
213 DZ
216 TN
218 LY
220 GM
221 SN
222 MR
223 ML
224 GN
225 CI
226 BF
227 NE
228 TG
229 BJ
230 MU
231 LR
232 SL
233 GH
234 NG
235 TD
236 CF
237 CM
238 CV
239 ST
240 GQ
241 GA
242 CG
243 CD
244 AO
245 GW
246 IO
247 AC
248 SC
249 SD
250 RW
251 ET
252 SO
253 DJ
254 KE
255 TZ
256 UG
257 BI
258 MZ
260 ZM
261 MG
262 RE YT
263 ZW
264 NA
265 MW
266 LS
267 BW
268 SZ
269 KM
290 SH TA
291 ER
297 AW
298 FO
299 GL
350 GI
351 PT
352 LU
353 IE
354 IS
355 AL
356 MT
357 CY
358 FI AX
359 BG
370 LT
371 LV
372 EE
373 MD
374 AM
375 BY
376 AD
377 MC
378 SM
380 UA
381 RS
382 ME
383 XK
385 HR
386 SI
387 BA
389 MK
420 CZ
421 SK
423 LI
500 FK GS
501 BZ
502 GT
503 SV
504 HN
505 NI
506 CR
507 PA
508 PM
509 HT
590 GP BL MF
591 BO
592 GY
593 EC
594 GF
595 PY
596 MQ
597 SR
598 UY
599 CW BQ
670 TL
672 NF
673 BN
674 NR
675 PG
676 TO
677 SB
678 VU
679 FJ
680 PW
681 WF
682 CK
683 NU
685 WS
686 KI
687 NC
688 TV
689 PF
690 TK
691 FM
692 MH
850 KP
852 HK
853 MO
855 KH
856 LA
880 BD
886 TW
960 MV
961 LB
962 JO
963 SY
964 IQ
965 KW
966 SA
967 YE
968 OM
970 PS
971 AE
972 IL
973 BH
974 QA
975 BT
976 MN
977 NP
992 TJ
993 TM
994 AZ
995 GE
996 KG
998 UZ`;

const REGION_CODES = CALLING_CODES.split('\n').flatMap((line) => {
  const [code, ...regions] = line.split(' ');
  return regions.map((region) => [region, code!] as const);
});

const REGION_NAMES = new Intl.DisplayNames('en', { type: 'region' });
const SHORT_REGION_NAMES = new Intl.DisplayNames('en', { type: 'region', style: 'short' });

/** Matches a country name to its calling code through the CLDR region names the dashboard uses. */
function callingCode(country: string) {
  const normalize = (name: string) => name.toLowerCase().replaceAll('’', "'");
  const wanted = normalize(country);
  let qualified: string | undefined;
  for (const [region, code] of REGION_CODES) {
    const short = normalize(SHORT_REGION_NAMES.of(region)!);
    if (short === wanted || normalize(REGION_NAMES.of(region)!) === wanted) return code;
    // The dashboard qualifies a few names, e.g. "Hong Kong SAR", which start with the short name ("Hong Kong")
    if (wanted.startsWith(`${short} `)) qualified ??= code;
  }
  return qualified;
}
