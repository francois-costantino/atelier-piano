// keyboard.js — rendu d'un clavier de piano en DOM (aucune dépendance).
const IS_BLACK = new Set([1, 3, 6, 8, 10]);

export function renderKeyboard(container, low, high) {
  const whites = [];
  for (let m = low; m <= high; m++) {
    if (!IS_BLACK.has(m % 12)) whites.push(m);
  }
  const whitePct = 100 / whites.length;

  const frag = document.createDocumentFragment();
  const keyEls = new Map();

  let w = 0;
  for (let m = low; m <= high; m++) {
    if (IS_BLACK.has(m % 12)) continue;
    const el = document.createElement('div');
    el.className = 'key white';
    el.dataset.midi = m;
    el.style.left = `${w * whitePct}%`;
    el.style.width = `${whitePct}%`;
    if (m % 12 === 0) {
      const lab = document.createElement('span');
      lab.className = 'key-label';
      lab.textContent = `C${-1 + (m / 12 | 0)}`;
      el.appendChild(lab);
    }
    frag.appendChild(el);
    keyEls.set(m, el);
    w++;
  }

  for (let m = low; m <= high; m++) {
    if (!IS_BLACK.has(m % 12)) continue;
    const leftWhiteIndex = whites.filter((x) => x < m).length;
    const el = document.createElement('div');
    el.className = 'key black';
    el.dataset.midi = m;
    el.style.left = `${leftWhiteIndex * whitePct - whitePct * 0.31}%`;
    el.style.width = `${whitePct * 0.62}%`;
    frag.appendChild(el);
    keyEls.set(m, el);
  }

  container.replaceChildren(frag);
  return {
    container,
    keyEls,
    set(name, midi, on) {
      const el = keyEls.get(midi);
      if (el) el.classList.toggle(name, on);
    },
    clearAll(...names) {
      for (const el of keyEls.values()) names.forEach((n) => el.classList.remove(n));
    },
  };
}
