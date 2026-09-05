import { config } from './config'

// Phone mode targets touch-first screens: a coarse pointer with no hover on a
// small viewport. The hash parameter phone=1/0 overrides detection so the mode
// can be previewed on desktop and pinned in tests; without it, the mode
// follows the media query and updates when it flips (rotation, resize).
const PHONE_QUERY = '(pointer: coarse) and (hover: none) and (max-width: 1024px)'

export function initPhoneMode(forced: boolean | null): void {
  const mql = window.matchMedia(PHONE_QUERY)
  const apply = (on: boolean): void => {
    config.phoneMode = on
    document.body.classList.toggle('phone', on)
  }
  apply(forced ?? mql.matches)
  if (forced === null) {
    mql.addEventListener('change', (e) => apply(e.matches))
  }
}
