export interface GameControls {
  move: (direction: -1 | 1) => void;
  drop: () => void;
  reset: () => void;
}

export function bindControls(controls: GameControls): () => void {
  const actions = [
    ['move-left', () => controls.move(-1)],
    ['move-right', () => controls.move(1)],
    ['drop-button', controls.drop],
    ['reset-button', controls.reset],
  ] as const;
  const bindings = actions.map(([id, action]) => {
    const button = document.querySelector<HTMLButtonElement>(`#${id}`);
    if (!button) throw new Error(`Missing game control: ${id}`);
    button.disabled = false;
    button.addEventListener('click', action);
    return { button, action };
  });
  return () => bindings.forEach(({ button, action }) => {
    button.removeEventListener('click', action);
    button.disabled = true;
  });
}

export function showStartupError(message: string): void {
  const status = document.querySelector('#game-status');
  if (status) status.textContent = message;
}
