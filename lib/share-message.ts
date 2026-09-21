/**
 * Sending a share link to somebody.
 *
 * A share link IS the permission — anyone holding it can see a live position
 * until it expires. So the route it travels matters as much as the token
 * itself, and this file deliberately avoids the obvious option.
 *
 * `https://wa.me/?text=...` is the usual way to open WhatsApp from the web. It
 * is a redirect hosted by Meta: the browser makes a real HTTPS request to
 * wa.me with the message in the query string. That would hand a working
 * location-share token to a third party on every send. For a normal marketing
 * link that is nothing; for this link it is the whole secret.
 *
 * So the order here is:
 *   1. navigator.share() — the OS share sheet. WhatsApp appears in it, the
 *      text goes straight to the app, and nothing touches a server.
 *   2. whatsapp://send?text=... — the app's own URL scheme. Also local; no
 *      request leaves the device.
 *   3. Copy, and paste it wherever they like.
 *
 * Every one of these is the user pressing send themselves. Nothing in this
 * file delivers a message on its own.
 */

/**
 * The words that go with a link.
 *
 * It must not read like an emergency alert. Nobody has been contacted, no
 * service is watching, and the recipient is being asked to look at a page —
 * not to respond to an incident.
 */
export function shareMessage(url: string, senderName?: string): string {
  const who = senderName?.trim() ? `${senderName.trim()} is` : "I'm";
  return (
    `${who} sharing a Mwhite SafeCircle activity with you. ` +
    `The link shows my location while the activity is running and stops working when it expires: ${url}`
  );
}

/** WhatsApp's own scheme. Local to the device — no server sees the token. */
export function whatsappDeepLink(text: string): string {
  return `whatsapp://send?text=${encodeURIComponent(text)}`;
}

/** The phone's SMS composer, prefilled. Also local. */
export function smsDeepLink(text: string): string {
  return `sms:?&body=${encodeURIComponent(text)}`;
}

/**
 * True when the OS share sheet is available AND will accept plain text.
 * Checked at call time, never at module load: the app is rendered on the
 * server, where `navigator` does not exist.
 */
export function canUseShareSheet(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare === 'function') {
    try {
      return navigator.canShare({ text: 'x' });
    } catch {
      return false;
    }
  }
  return true;
}

export type ShareOutcome = 'shared' | 'dismissed' | 'unsupported' | 'failed';

/**
 * Opens the OS share sheet. Returns what actually happened rather than a
 * boolean, because "the user closed the sheet" and "sharing is not available"
 * need different things said to them — and a safety app must never leave
 * someone believing a link went out when it did not.
 */
export async function openShareSheet(text: string, title = 'Mwhite SafeCircle'): Promise<ShareOutcome> {
  if (!canUseShareSheet()) return 'unsupported';
  try {
    await navigator.share({ title, text });
    return 'shared';
  } catch (error) {
    // AbortError is the user closing the sheet. It is not a failure and must
    // not be reported as one.
    if (error instanceof DOMException && error.name === 'AbortError') return 'dismissed';
    return 'failed';
  }
}
