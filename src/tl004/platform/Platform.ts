/** Browser/shell detection used only for guidance (never to change rules). */
export const platform = (() => {
  const ua = navigator.userAgent;
  const iOS = /iP(hone|od|ad)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const inApp = /Line\/|FBAN|FBAV|FB_IAB|Instagram|Messenger/i.test(ua);
  const touch = window.matchMedia('(pointer: coarse)').matches;
  return { iOS, standalone, inApp, touch };
})();

/**
 * Keeps the stage exactly the size of the visible area (visualViewport), so browser
 * toolbars never overlap or scroll the game. Calls onResize after every change.
 */
export function fitStage(stage: HTMLElement, onResize: () => void): void {
  const apply = () => {
    const viewport = window.visualViewport;
    const width = viewport ? viewport.width : window.innerWidth;
    const height = viewport ? viewport.height : window.innerHeight;
    stage.style.width = `${Math.round(width)}px`;
    stage.style.height = `${Math.round(height)}px`;
    stage.style.transform = viewport ? `translate(${Math.round(viewport.offsetLeft)}px, ${Math.round(viewport.offsetTop)}px)` : '';
    document.documentElement.style.setProperty('--stage-height', `${Math.round(height)}px`);
    onResize();
  };
  apply();
  window.visualViewport?.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('scroll', apply);
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => window.setTimeout(apply, 250));
}

/** Android Chrome: full screen + landscape lock from the Start tap. iPhone has neither API, so this quietly does nothing there. */
export async function enterLandscapeFullscreen(): Promise<void> {
  if (!platform.touch || platform.iOS || platform.standalone) return;
  const root = document.documentElement;
  try {
    if (!document.fullscreenElement && root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
    const orientation = screen.orientation as ScreenOrientation & { lock?: (type: string) => Promise<void> };
    await orientation.lock?.('landscape');
  } catch {
    // Not allowed here: the rotate overlay still guides the player.
  }
}

export const portraitQuery = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
export const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
