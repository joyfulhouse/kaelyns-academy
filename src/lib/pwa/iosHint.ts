export interface IosHintEnv {
  userAgent: string;
  maxTouchPoints: number;
  isStandalone: boolean;
  dismissed: boolean;
}

/** Show the A2HS hint only on iOS *Safari*, when not already installed or dismissed.
 *  iPadOS 13+ reports the macOS UA, so detect it via a touch-capable "Macintosh". */
export function shouldShowIosHint(env: IosHintEnv): boolean {
  if (env.isStandalone || env.dismissed) return false;
  const ua = env.userAgent;
  const iPhoneOrIpad = /iphone|ipad|ipod/i.test(ua);
  const iPadOnMac = /macintosh/i.test(ua) && env.maxTouchPoints > 1;
  if (!iPhoneOrIpad && !iPadOnMac) return false;
  // Exclude in-app WebKit wrappers that can't A2HS via Share (Chrome/Firefox/Edge on iOS).
  return /safari/i.test(ua) && !/(crios|fxios|edgios)/i.test(ua);
}
