import {
  BONUSES,
  STATUS_BITS,
  WEAPONS,
  isBonusId,
  type BonusId,
  type CharacterDetail,
  type PlayerView,
  type RunStateView,
  type WeaponType,
} from '@rpg/shared';
import { h } from '../ui/dom';
import type { BossInfo } from './entities';

const STATUS_ICONS: [number, string][] = [
  [STATUS_BITS.burn, '🔥'],
  [STATUS_BITS.poison, '☠️'],
  [STATUS_BITS.slow, '🐌'],
  [STATUS_BITS.freeze, '❄️'],
  [STATUS_BITS.stun, '💫'],
];

/** Texte du bandeau de phase. */
export function phaseText(s: Pick<RunStateView, 'phase' | 'wave' | 'phaseTime' | 'remaining'>, ready: boolean): string {
  if (s.phase === 'break') {
    if (ready) return `Vague ${s.wave + 1} imminente…`;
    return `Répit · ${Math.ceil(s.phaseTime)} s · Entrée : lancer la vague ${s.wave + 1}`;
  }
  if (s.phase === 'wave') return `Vague ${s.wave} · ${s.remaining} monstre${s.remaining > 1 ? 's' : ''}`;
  return 'Fin de la run';
}

export function bonusSummary(bonuses: Iterable<string>): string[] {
  const counts = new Map<BonusId, number>();
  for (const b of bonuses) if (isBonusId(b)) counts.set(b, (counts.get(b) ?? 0) + 1);
  return [...counts].map(([id, n]) => (n > 1 ? `${BONUSES[id].label} ×${n}` : BONUSES[id].label));
}

export function createHud(root: HTMLElement) {
  const bar = h('div', { class: 'weapon-bar' });
  const prompt = h('div', { class: 'prompt', hidden: true });
  const hpFill = h('div', { class: 'fill' });
  const hpText = h('span', { class: 'label' });
  const status = h('span', { class: 'status' });
  const phase = h('div', { class: 'phase' });
  const bossName = h('div', { class: 'boss-name' });
  const bossFill = h('div', { class: 'fill' });
  const boss = h('div', { class: 'boss', hidden: true }, bossName, h('div', { class: 'bar' }, bossFill));
  const wallet = h('div', { class: 'wallet' });
  const bonuses = h('div', { class: 'bonuses' });
  const hurt = h('div', { class: 'hurt' });
  const el = h(
    'div',
    { class: 'hud' },
    hurt,
    h('div', { class: 'crosshair' }),
    h('div', { class: 'top' }, phase, boss),
    wallet,
    h('div', { class: 'hp' }, h('div', { class: 'bar' }, hpFill, hpText), status),
    bonuses,
    prompt,
    bar,
  );
  root.append(el);
  let lastHp = Infinity;
  let lastText = new Map<HTMLElement, string>();
  const text = (node: HTMLElement, value: string) => {
    if (lastText.get(node) === value) return;
    lastText.set(node, value);
    node.textContent = value;
  };

  return {
    setWeapons(c: CharacterDetail, current: WeaponType) {
      bar.replaceChildren(
        ...c.weapons.map((w, i) =>
          h(
            'div',
            { class: w.type === current ? 'slot active' : 'slot' },
            h('span', { class: 'key' }, String(i + 1)),
            h('span', {}, WEAPONS[w.type].label),
            h('span', { class: 'lvl' }, `Niv. ${w.level}`),
          ),
        ),
      );
    },
    setPrompt(value: string | null) {
      prompt.hidden = value === null;
      if (value !== null) text(prompt, value);
    },
    update(state: RunStateView, me: PlayerView, bossInfo: BossInfo | null) {
      const ratio = me.maxHp > 0 ? Math.max(0, me.hp / me.maxHp) : 0;
      hpFill.style.width = `${ratio * 100}%`;
      text(hpText, `${Math.ceil(me.hp)} / ${Math.round(me.maxHp)} PV`);
      text(status, STATUS_ICONS.filter(([bit]) => me.status & bit).map(([, icon]) => icon).join(' '));
      if (me.hp < lastHp - 0.5) {
        hurt.classList.remove('on');
        void hurt.offsetWidth;
        hurt.classList.add('on');
      }
      lastHp = me.hp;
      text(phase, phaseText(state, me.ready));
      boss.hidden = bossInfo === null;
      if (bossInfo) {
        text(bossName, bossInfo.label);
        bossFill.style.width = `${Math.max(0, bossInfo.hp / bossInfo.maxHp) * 100}%`;
      }
      text(wallet, `🪙 ${me.gold} · ⛏️ ${me.materials} · 🔥 ${me.fire} ⚡ ${me.lightning} ☠️ ${me.poison} ❄️ ${me.ice} · 💀 ${state.kills}`);
      text(bonuses, bonusSummary(me.bonuses).join(' · '));
    },
    destroy() {
      el.remove();
      lastText = new Map();
    },
  };
}
