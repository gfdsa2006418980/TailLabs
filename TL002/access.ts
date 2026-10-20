import '../src/tl002/style.css';

const SITE_PASSWORD = '3000';
const WRONG_PASSWORD_URL = 'https://www.youtube.com/watch?v=XqZsoesa55w';
const ACCESS_STORAGE_KEY = 'tl002.passwordAccepted';

const gate = document.getElementById('password-gate');
const form = document.getElementById('password-form');
const passwordInput = document.getElementById('site-password') as HTMLInputElement | null;
const gameShell = document.querySelector<HTMLElement>('.game-shell');

if (!gate || !(form instanceof HTMLFormElement) || !passwordInput || !gameShell) {
  throw new Error('Missing TL002 password gate elements.');
}

let unlocked = false;

const enterGame = (): void => {
  gate.hidden = true;
  gameShell.hidden = false;
  void import('../src/tl002/main');
};

try {
  unlocked = window.localStorage.getItem(ACCESS_STORAGE_KEY) === 'true';
} catch {
  // Continue to require the password when browser storage is unavailable.
}

if (unlocked) enterGame();

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (unlocked) return;

  if (passwordInput.value !== SITE_PASSWORD) {
    window.location.replace(WRONG_PASSWORD_URL);
    return;
  }

  unlocked = true;
  try {
    window.localStorage.setItem(ACCESS_STORAGE_KEY, 'true');
  } catch {
    // The current page still unlocks even when browser storage is unavailable.
  }
  enterGame();
});
