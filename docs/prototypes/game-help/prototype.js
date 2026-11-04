import { scoreRow, BONUS_VALUES } from '/skullking-logic.js';
import { focusTrap } from '/focus-trap.js';

const guide = document.querySelector('#guide');
const state = { round: 5, bid: 2, actual: 2 };
const byId = (id) => document.getElementById(id);
let opener = byId('open-guide');
let trap;

function openGuide() {
  opener = document.activeElement === document.body ? byId('open-guide') : document.activeElement;
  trap = focusTrap(guide);
  guide.showModal();
  byId('guide-title').focus();
}

function closeGuide() {
  guide.close();
}

byId('open-guide').addEventListener('click', openGuide);
byId('close-guide').addEventListener('click', closeGuide);
byId('done').addEventListener('click', closeGuide);
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
    closeGuide();
});

byId('theme').addEventListener('click', () => {
  const light = document.documentElement.dataset.theme !== 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  byId('theme').textContent = light ? 'Dark' : 'Light';
  byId('theme').setAttribute('aria-label', `Switch to ${light ? 'dark' : 'light'} theme`);
});

const compass =
  '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="24" cy="24" r="18"/><path d="m24 7 5 12 12 5-12 5-5 12-5-12-12-5 12-5Z"/><path d="m24 15 3 9-3 9-3-9Z" fill="currentColor"/></svg>';

function render() {
  const { round, bid, actual } = state;
  const score = scoreRow({ bid, actual, bonus: 0 }, round, true);
  const signed = (value) => `${value >= 0 ? '+' : '−'}${Math.abs(value)}`;
  byId('round').value = String(round);
  byId('round-caption').textContent = `${round} ${round === 1 ? 'trick' : 'tricks'} available`;
  byId('bid-token').textContent = String(bid);
  byId('bid-value').textContent = String(bid);
  byId('actual-value').textContent = String(actual);
  byId('score').replaceChildren(document.createTextNode(signed(score)));
  const unit = document.createElement('span');
  unit.textContent = ' pts';
  byId('score').append(unit);
  byId('score').classList.toggle('negative', score < 0);
  byId('footer-score').textContent = `${signed(score)} pts`;
  const hit = bid === actual;
  byId('verdict').textContent =
    bid === 0
      ? hit
        ? 'Zero tricks. Promise kept.'
        : 'One trick breaks a zero bid.'
      : hit
        ? 'Right on your bid.'
        : `${Math.abs(actual - bid)} ${actual > bid ? 'over' : 'under'} your bid.`;
  byId('equation').textContent =
    bid === 0
      ? `${hit ? '+' : '−'}10 × round ${round} = ${signed(score)} points`
      : hit
        ? `20 × ${bid} = ${signed(score)} points`
        : `−10 × ${Math.abs(actual - bid)} = ${signed(score)} points`;
  // Only fixed artwork and bounded numbers enter this illustrative, non-user-content markup.
  byId('trick-stacks').innerHTML =
    actual === 0
      ? '<div class="empty-tricks">No tricks<br>won</div>'
      : Array.from(
          { length: Math.min(actual, 4) },
          (_, index) =>
            `<div class="trick-card" style="--tilt:${(index - (Math.min(actual, 4) - 1) / 2) * 9}deg"><span>0${index + 1}</span>${compass}<span>✦</span></div>`,
        ).join('') + (actual > 4 ? `<span class="extra-tricks">+${actual - 4}</span>` : '');
  document.querySelectorAll('[data-change]').forEach((button) => {
    const [key, delta] = button.dataset.change.split(':');
    button.disabled = Number(delta) < 0 ? state[key] === 0 : state[key] === round;
  });
  document.querySelectorAll('[data-scenario]').forEach((button) => {
    const selected = button.dataset.scenario === (bid === 0 ? 'zero' : hit ? 'hit' : 'miss');
    button.setAttribute('aria-pressed', String(selected));
  });
}

document.querySelectorAll('[data-change]').forEach((button) => {
  button.addEventListener('click', () => {
    const [key, delta] = button.dataset.change.split(':');
    state[key] = Math.max(0, Math.min(state.round, state[key] + Number(delta)));
    render();
  });
});
byId('round').addEventListener('change', (event) => {
  state.round = Number(event.target.value);
  state.bid = Math.min(state.bid, state.round);
  state.actual = Math.min(state.actual, state.round);
  render();
});
document.querySelectorAll('[data-scenario]').forEach((button) => {
  button.addEventListener('click', () => {
    const scenario = button.dataset.scenario;
    state.bid = scenario === 'zero' ? 0 : Math.min(2, state.round);
    state.actual = scenario === 'miss' ? state.bid - 1 : state.bid;
    render();
  });
});
byId('reset').addEventListener('click', () => {
  Object.assign(state, { round: 5, bid: 2, actual: 2 });
  render();
});

const topics = {
  bids: {
    title: 'The bid is the promise.',
    body: '<p>Bid how many tricks you will win. Match that number exactly and score <strong>20 × your bid</strong>.</p><p>For a bid of one or more, missing costs <strong>10 points per trick over or under</strong>. Being one over and one under cost the same.</p><p>Try both outcomes below. These are completed-hand examples, not predictions during play.</p>',
  },
  zero: {
    title: 'Nothing ventured. Everything at stake.',
    body: '<p>A zero bid has its own scoring rule. Take no tricks and earn <strong>10 × the round number</strong>. Take any tricks and lose that same amount.</p><p>In round 5, zero tricks earns +50. One trick or more scores −50. It is not a per-trick penalty.</p><p>Try zero below, then add a trick. Change the round to see the stakes change.</p>',
  },
  bounties: {
    title: 'A little extra treasure.',
    body: `<p>These are the bounty values in Score King’s current reference. Bounties vary by edition; they are not a universal rulebook.</p><table><caption class="eyebrow">Capture reference</caption><thead><tr><th scope="col">Capture</th><th scope="col">Points</th></tr></thead><tbody><tr><td>Each colored 14 (yellow, green, purple)</td><td>+${BONUS_VALUES.fourteen}</td></tr><tr><td>Black 14 · Jolly Roger</td><td>+${BONUS_VALUES.jollyRoger}</td></tr><tr><td>Skull King captures a Pirate</td><td>+${BONUS_VALUES.pirate}</td></tr><tr><td>Mermaid captures the Skull King</td><td>+${BONUS_VALUES.mermaidCatchesSK}</td></tr><tr><td>Skull King over Mermaid</td><td>+${BONUS_VALUES.skOverMermaid}</td></tr></tbody></table><p>The app’s Other field accommodates edition and house-rule extras. The bid example in this prototype excludes all bounties.</p>`,
  },
  settings: {
    title: 'Your table, your reference.',
    body: '<p>In the finished feature, help should reflect your game’s selected settings. This isolated preview has no connection to a saved game.</p><label class="setting-label"><input type="checkbox" id="sample-bounty-setting" checked>Sample setting: bounties require a met bid</label><p id="setting-explanation">Bounties count only when the bid is met. The practice hand has no bounties.</p><p class="muted">This control demonstrates contextual help only. It never changes your real settings.</p>',
  },
  learn: {
    title: 'Your first voyage starts here.',
    body: '<p>A quieter, ordered path for learning, without making experienced players follow a tutorial.</p><div class="lesson"><span class="lesson-number">1</span><div><strong>Set the table</strong><p>Deck, deal, and edition-specific setup. Content to be verified before implementation.</p></div></div><div class="lesson"><span class="lesson-number">2</span><div><strong>Play a trick</strong><p>A visual walkthrough of legal play and card interactions. Not implemented in this prototype.</p></div></div><div class="lesson"><span class="lesson-number">3</span><div><strong>Make a bid. Count the points.</strong><p>Explore the working scoring example.</p><button class="btn" data-topic="bids">Explore bid scoring →</button></div></div><div class="lesson"><span class="lesson-number">4</span><div><strong>Explore captures &amp; exceptions</strong><p>Use the current bounty reference.</p><button class="btn" data-topic="bounties">See capture values →</button></div></div><p class="muted small">Learning-path concept only. A complete, verified teaching guide is outside this prototype.</p>',
  },
};

function showTopic(topic) {
  const reference = topic === 'reference';
  byId('reference-view').hidden = !reference;
  byId('topic-view').hidden = reference;
  byId('practice').hidden = !['reference', 'bids', 'zero'].includes(topic);
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
    state.actual = 0;
    render();
  }
  const heading = byId(reference ? 'reference-title' : 'topic-title');
  heading.focus({ preventScroll: true });
  heading.scrollIntoView({ block: 'nearest' });
}

guide.addEventListener('click', (event) => {
  const button = event.target.closest('[data-topic]');
  if (button) showTopic(button.dataset.topic);
});
guide.addEventListener('change', (event) => {
  if (event.target.id !== 'sample-bounty-setting') return;
  byId('setting-explanation').textContent = event.target.checked
    ? 'Bounties count only when the bid is met. The practice hand has no bounties.'
    : 'Bounties can count even when the bid is missed. The practice hand has no bounties.';
});

render();
openGuide();
