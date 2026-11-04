import { scoreRow, BONUS_VALUES } from '/skullking-logic.js';
import { focusTrap } from '/focus-trap.js';

const byId = (id) => document.getElementById(id);
const guide = byId('guide');
const state = { round: 5, bid: 2, won: new Set([0, 1]) };
let opener = byId('open-guide');
let trap;

function openGuide() {
  opener = document.activeElement === document.body ? byId('open-guide') : document.activeElement;
  trap = focusTrap(guide);
  guide.showModal();
  byId('guide-title').focus();
}

byId('open-guide').addEventListener('click', openGuide);
byId('close-guide').addEventListener('click', () => guide.close());
byId('done').addEventListener('click', () => guide.close());
guide.addEventListener('close', () => {
  trap?.destroy();
  trap = undefined;
  opener?.focus();
});
guide.addEventListener('click', (event) => {
  if (event.target !== guide) return;
  const rect = guide.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    guide.close();
});
byId('theme').addEventListener('click', () => {
  const light = document.documentElement.dataset.theme !== 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  byId('theme').textContent = light ? 'Dark' : 'Light';
  byId('theme').setAttribute('aria-label', `Switch to ${light ? 'dark' : 'light'} theme`);
});

function rebuildChoices() {
  byId('bid').replaceChildren(
    ...Array.from({ length: state.round + 1 }, (_, value) => {
      const option = document.createElement('option');
      option.value = String(value);
      option.textContent = String(value);
      return option;
    }),
  );
  byId('trick-choices').replaceChildren(
    ...Array.from({ length: state.round }, (_, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'trick-choice';
      button.dataset.trick = String(index);
      button.setAttribute('aria-label', `Trick ${index + 1}`);
      for (const [className, text] of [
        ['trick-number', String(index + 1)],
        ['trick-symbol', '+'],
        ['trick-state', 'Not won'],
      ]) {
        const span = document.createElement('span');
        span.className = className;
        span.textContent = text;
        span.setAttribute('aria-hidden', 'true');
        button.append(span);
      }
      return button;
    }),
  );
}

function render() {
  const actual = state.won.size;
  const score = scoreRow({ bid: state.bid, actual, bonus: 0 }, state.round, true);
  const signed = `${score >= 0 ? '+' : '−'}${Math.abs(score)}`;
  byId('round').value = String(state.round);
  byId('bid').value = String(state.bid);
  document.querySelectorAll('[data-trick]').forEach((button) => {
    const won = state.won.has(Number(button.dataset.trick));
    button.setAttribute('aria-pressed', String(won));
    button.querySelector('.trick-symbol').textContent = won ? '✓' : '+';
    button.querySelector('.trick-state').textContent = won ? 'Won' : 'Not won';
  });
  byId('comparison').textContent = `Bid ${state.bid} · Won ${actual}`;
  const unit = document.createElement('span');
  unit.textContent = ' points';
  byId('score').replaceChildren(document.createTextNode(signed), unit);
  byId('score').classList.toggle('negative', score < 0);
  const matched = state.bid === actual;
  byId('verdict').textContent = matched
    ? 'Bid matched'
    : state.bid === 0
      ? 'Zero bid missed'
      : `${Math.abs(actual - state.bid)} ${actual > state.bid ? 'over' : 'under'} your bid`;
  byId('equation').textContent =
    state.bid === 0
      ? `${matched ? '10' : '−10'} × round ${state.round} = ${signed}`
      : matched
        ? `${state.bid} × 20 = ${Math.abs(score)}`
        : `${Math.abs(actual - state.bid)} × −10 = ${signed}`;
  byId('clear-tricks').disabled = actual === 0;
}

byId('trick-choices').addEventListener('click', (event) => {
  const button = event.target.closest('[data-trick]');
  if (!button) return;
  const index = Number(button.dataset.trick);
  if (state.won.has(index)) state.won.delete(index);
  else state.won.add(index);
  render();
});
byId('bid').addEventListener('change', (event) => {
  state.bid = Number(event.target.value);
  render();
});
byId('round').addEventListener('change', (event) => {
  state.round = Number(event.target.value);
  state.bid = Math.min(state.bid, state.round);
  state.won = new Set([...state.won].filter((index) => index < state.round));
  rebuildChoices();
  render();
});
byId('clear-tricks').addEventListener('click', () => {
  state.won.clear();
  render();
});
byId('reset').addEventListener('click', () => {
  Object.assign(state, { round: 5, bid: 2, won: new Set([0, 1]) });
  rebuildChoices();
  render();
});

const topics = {
  zero: {
    title: 'Zero bids',
    body: '<p>Bid zero and win no tricks: <strong>+10 × the round number</strong>.</p><p>Win any tricks: <strong>−10 × the round number</strong>, regardless of how many you won.</p><p>In round 5, that is +50 or −50. Mark a trick in the example to compare.</p>',
  },
  bounties: {
    title: 'Bonus points',
    body: `<p>By default, bonuses only count when you meet your bid. This can be changed when setting up a game.</p><table><caption>Values used by Score King. Bonuses can vary by edition.</caption><thead><tr><th scope="col">Capture</th><th scope="col">Points</th></tr></thead><tbody><tr><td>Each colored 14 (yellow, green, purple)</td><td>+${BONUS_VALUES.fourteen}</td></tr><tr><td>Black 14 · Jolly Roger</td><td>+${BONUS_VALUES.jollyRoger}</td></tr><tr><td>Skull King captures a Pirate</td><td>+${BONUS_VALUES.pirate}</td></tr><tr><td>Mermaid captures the Skull King</td><td>+${BONUS_VALUES.mermaidCatchesSK}</td></tr><tr><td>Skull King over Mermaid</td><td>+${BONUS_VALUES.skOverMermaid}</td></tr></tbody></table><p>Use the Other field for edition-specific or house-rule bonuses.</p>`,
  },
  learn: {
    title: 'Learn to play',
    body: '<p>This shows the proposed lesson order. The full rules are not included in this prototype.</p><ol class="learning-list"><li><strong>1. Setup and dealing</strong><p>Not included yet. Edition-specific rules need verification.</p></li><li><strong>2. Playing a trick</strong><p>Not included yet. This would explain card order and special cards.</p></li><li><strong>3. Bidding and scoring</strong><button class="text-button" data-topic="bids">Open scoring example →</button></li><li><strong>4. Bonus points</strong><button class="text-button" data-topic="bounties">See bonus values →</button></li></ol>',
  },
};

function showTopic(topic) {
  const practiceOnly = topic === 'bids';
  if (practiceOnly) topic = 'reference';
  const reference = topic === 'reference';
  byId('content').dataset.topic = topic;
  byId('reference-view').hidden = !reference;
  byId('topic-view').hidden = reference;
  byId('practice').hidden = !['reference', 'zero'].includes(topic);
  document.querySelectorAll('.topic-nav [data-topic]').forEach((button) => {
    if (button.dataset.topic === topic) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (!reference) {
    byId('topic-title').textContent = topics[topic].title;
    byId('topic-copy').innerHTML = topics[topic].body;
  }
  if (topic === 'zero') {
    state.bid = 0;
    state.won.clear();
    render();
  }
  const heading = byId(
    practiceOnly ? 'practice-title' : reference ? 'reference-title' : 'topic-title',
  );
  heading.focus({ preventScroll: true });
  heading.scrollIntoView({ block: 'nearest' });
}
guide.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-topic]');
  if (button) showTopic(button.dataset.topic);
});

rebuildChoices();
render();
openGuide();
