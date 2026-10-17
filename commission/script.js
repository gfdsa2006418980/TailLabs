const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
function closeMenu() {
  navigation.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', '開啟導覽選單');
}
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  navigation.classList.toggle('open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? '關閉導覽選單' : '開啟導覽選單');
});
navigation.addEventListener('click', (event) => {
  if (event.target.closest('a')) closeMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
    closeMenu();
    menuButton.focus();
  }
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.nav-wrap')) closeMenu();
});
window.matchMedia('(min-width: 821px)').addEventListener('change', closeMenu);

const remixButton = document.querySelector('#remix');
const heroStage = document.querySelector('.toy-stage');
const heroToys = [...heroStage.querySelectorAll('.toy')];
const spriteNames = ['w50-01', 'w50-02', 'w50-03', 'w50-04', 'w50-05', 'w20-01', 'w20-03', 'w1-01'];
let remixCount = 0;
remixButton.addEventListener('click', () => {
  remixCount++;
  heroStage.classList.toggle('remixed', remixCount % 2 === 1);
  heroToys.forEach((toy, index) => {
    toy.src = `./assets/serpentela-${spriteNames[(index + remixCount) % spriteNames.length]}.webp`;
  });
});

const tabs = [...document.querySelectorAll('[role="tab"]')];
const art = document.querySelector('.showcase-art');
const exampleContact = document.querySelector('#example-contact');
const examples = {
  basic: { label: '基本方案示例', plan: '基本方案', chips: ['核心玩法', '堆疊與計分', '失敗後重來'] },
  advanced: { label: '進階方案示例', plan: '進階方案', chips: ['操作引導', '難度變化', '音樂與動態'] },
  deluxe: { label: '豪華方案擴充構想', plan: '豪華方案', chips: ['多種模式', '特殊蛇貂', '升級與成就'] },
};
function selectExample(mode, moveFocus = false) {
  if (!examples[mode]) return;
  tabs.forEach((tab) => {
    const selected = tab.dataset.mode === mode;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    if (selected && moveFocus) tab.focus();
  });
  art.dataset.mode = mode;
  document.querySelector('#example-status').textContent = examples[mode].label;
  art.querySelectorAll('.example-chip').forEach((chip, index) => { chip.textContent = examples[mode].chips[index]; });
  exampleContact.dataset.plan = examples[mode].plan;
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectExample(tab.dataset.mode));
  tab.addEventListener('keydown', (event) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      selectExample(tabs[next].dataset.mode, true);
    }
  });
});
document.querySelectorAll('[data-example]').forEach((link) => {
  link.addEventListener('click', () => selectExample(link.dataset.example));
});

const quoteInput = document.querySelector('#quote-input');
const progressInput = document.querySelector('#progress-input');
const amountFormatter = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 });
function updateCancellation() {
  const progress = Number(progressInput.value);
  const quote = Number(quoteInput.value);
  const rate = 30 + 0.4 * progress;
  const validQuote = quoteInput.value.trim() !== '' && Number.isFinite(quote) && quote >= 1 && quote <= 10000000;
  document.querySelector('#progress-output').textContent = `${progress}%`;
  document.querySelector('#fee-rate').textContent = `（報價的 ${Number(rate.toFixed(1))}%）`;
  document.querySelector('#fee-amount').textContent = validQuote ? `NT$${amountFormatter.format(quote * rate / 100)}` : '請輸入有效報價';
}
quoteInput.addEventListener('input', updateCancellation);
progressInput.addEventListener('input', updateCancellation);
updateCancellation();

const briefDialog = document.querySelector('#brief-dialog');
const briefPlan = document.querySelector('#brief-plan');
const briefMessage = document.querySelector('#brief-message');
const copyStatus = document.querySelector('#copy-status');
briefMessage.value = `Hi，浣熊拉芙，我想聊聊遊戲委託！\n\n委託方案：${briefPlan.value}\n遊戲想法／參考作品：\n預算範圍：\n期望完成時間：\n目前準備好的美術素材：\n其他想討論的內容：`;
function setBriefPlan(plan) {
  if (![...briefPlan.options].some((option) => option.value === plan)) return;
  briefPlan.value = plan;
  const line = `委託方案：${plan}`;
  briefMessage.value = /^委託方案：.*$/m.test(briefMessage.value)
    ? briefMessage.value.replace(/^委託方案：.*$/m, line)
    : `${line}\n${briefMessage.value}`;
}
function openBrief(plan) {
  if (plan) setBriefPlan(plan);
  copyStatus.textContent = '';
  if (!briefDialog.open) {
    briefDialog.showModal();
    document.body.classList.add('dialog-open');
  }
}
document.querySelector('#open-brief').addEventListener('click', () => openBrief());
document.querySelectorAll('[data-plan]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    openBrief(link.dataset.plan);
  });
});
briefPlan.addEventListener('change', () => { setBriefPlan(briefPlan.value); copyStatus.textContent = ''; });
briefMessage.addEventListener('input', () => { copyStatus.textContent = ''; });
document.querySelector('.dialog-close').addEventListener('click', () => briefDialog.close());
briefDialog.addEventListener('click', (event) => {
  if (event.target === briefDialog) {
    const rect = briefDialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) briefDialog.close();
  }
});
briefDialog.addEventListener('close', () => document.body.classList.remove('dialog-open'));
document.querySelector('#copy-brief').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(briefMessage.value);
    copyStatus.textContent = '複製好了，到 Discord 貼上就可以。';
  } catch {
    briefMessage.focus();
    briefMessage.select();
    try {
      const copied = document.execCommand('copy');
      copyStatus.textContent = copied ? '複製好了，到 Discord 貼上就可以。' : '已選取訊息，請手動複製後貼到 Discord。';
    } catch {
      copyStatus.textContent = '已選取訊息，請手動複製後貼到 Discord。';
    }
  }
});
