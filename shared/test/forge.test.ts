import { describe, it, expect } from 'vitest';
import { emptyStones, enchantWeapon, newWeapon, upgradeWeapon, type Wallet, type WeaponState } from '../src/forge';
import { enchantSlotCount, stonesToReachRank, type Element } from '../src/enchantments';

const wallet = (gold = 0, materials = 0, stones: Partial<Record<Element, number>> = {}): Wallet => ({
  gold,
  materials,
  stones: { ...emptyStones(), ...stones },
});

const weaponAt = (level: number, enchants: WeaponState['enchants'] = [null, null]): WeaponState => ({
  type: 'sword',
  level,
  enchants,
});

describe('règles des enchantements', () => {
  it('coûts en pierres et slots', () => {
    expect([stonesToReachRank(1), stonesToReachRank(2), stonesToReachRank(3)]).toEqual([1, 2, 4]);
    expect(enchantSlotCount(6)).toBe(1);
    expect(enchantSlotCount(7)).toBe(2);
  });
});

describe('upgradeWeapon', () => {
  it("monte d'un niveau et débite l'or", () => {
    expect(upgradeWeapon(newWeapon('sword'), wallet(60))).toEqual({
      ok: true,
      weapon: weaponAt(2),
      wallet: wallet(10),
    });
  });

  it("refuse sans assez d'or", () => {
    expect(upgradeWeapon(newWeapon('sword'), wallet(49))).toEqual({ ok: false, error: 'NOT_ENOUGH_GOLD' });
  });

  it('exige des matériaux pour atteindre le niveau 5', () => {
    expect(upgradeWeapon(weaponAt(4), wallet(1000, 4))).toEqual({ ok: false, error: 'NOT_ENOUGH_MATERIALS' });
    const r = upgradeWeapon(weaponAt(4), wallet(1000, 5));
    expect(r).toEqual({ ok: true, weapon: weaponAt(5), wallet: wallet(795, 0) });
  });

  it('refuse au niveau max', () => {
    expect(upgradeWeapon(weaponAt(10), wallet(1e9, 1e9))).toEqual({ ok: false, error: 'MAX_LEVEL' });
  });

  it('ne modifie pas les objets reçus', () => {
    const w = newWeapon('sword');
    const wl = wallet(100);
    upgradeWeapon(w, wl);
    expect(w.level).toBe(1);
    expect(wl.gold).toBe(100);
  });
});

describe('enchantWeapon', () => {
  it('pose un enchantement rang I pour 1 pierre', () => {
    expect(enchantWeapon(weaponAt(1), wallet(0, 0, { fire: 3 }), 0, 'fire')).toEqual({
      ok: true,
      weapon: weaponAt(1, [{ element: 'fire', rank: 1 }, null]),
      wallet: wallet(0, 0, { fire: 2 }),
    });
  });

  it('monte au rang II (+2) puis III (+4) puis refuse', () => {
    let w = weaponAt(1, [{ element: 'ice', rank: 1 }, null]);
    let r = enchantWeapon(w, wallet(0, 0, { ice: 6 }), 0, 'ice');
    expect(r.ok && r.weapon.enchants[0]).toEqual({ element: 'ice', rank: 2 });
    expect(r.ok && r.wallet.stones.ice).toBe(4);
    if (!r.ok) throw new Error('attendu ok');
    w = r.weapon;
    r = enchantWeapon(w, r.wallet, 0, 'ice');
    expect(r.ok && r.weapon.enchants[0]).toEqual({ element: 'ice', rank: 3 });
    expect(r.ok && r.wallet.stones.ice).toBe(0);
    if (!r.ok) throw new Error('attendu ok');
    expect(enchantWeapon(r.weapon, wallet(0, 0, { ice: 99 }), 0, 'ice')).toEqual({ ok: false, error: 'MAX_RANK' });
  });

  it("remplacer par un autre élément détruit l'ancien et repart au rang I", () => {
    const r = enchantWeapon(weaponAt(1, [{ element: 'fire', rank: 3 }, null]), wallet(0, 0, { poison: 1 }), 0, 'poison');
    expect(r).toEqual({
      ok: true,
      weapon: weaponAt(1, [{ element: 'poison', rank: 1 }, null]),
      wallet: wallet(0, 0, { poison: 0 }),
    });
  });

  it('le 2e slot est verrouillé avant le niveau 7', () => {
    expect(enchantWeapon(weaponAt(6), wallet(0, 0, { fire: 5 }), 1, 'fire')).toEqual({ ok: false, error: 'SLOT_LOCKED' });
    expect(enchantWeapon(weaponAt(7), wallet(0, 0, { fire: 5 }), 1, 'fire').ok).toBe(true);
  });

  it('interdit le même élément sur les deux slots', () => {
    const w = weaponAt(7, [{ element: 'lightning', rank: 1 }, null]);
    expect(enchantWeapon(w, wallet(0, 0, { lightning: 5 }), 1, 'lightning')).toEqual({ ok: false, error: 'DUPLICATE_ELEMENT' });
  });

  it('refuse sans assez de pierres', () => {
    expect(enchantWeapon(weaponAt(1), wallet(), 0, 'fire')).toEqual({ ok: false, error: 'NOT_ENOUGH_STONES' });
  });
});
