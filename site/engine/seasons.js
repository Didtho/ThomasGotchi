// Calendrier des fêtes : décors, messages et surprises selon la date.

const Seasons = (() => {
  // Dimanche de Pâques (calcul grégorien de Meeus/Jones/Butcher)
  function easter(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month, day);
  }

  const md = (d) => (d.getMonth() + 1) * 100 + d.getDate(); // 24 décembre -> 1224
  const between = (d, from, to) => md(d) >= from && md(d) <= to;

  // Fête du moment (une seule à la fois), ou null
  function current(d = new Date()) {
    const year = d.getFullYear();
    if (md(d) === 1231 || between(d, 101, 102)) {
      const newYear = md(d) === 1231 ? year + 1 : year;
      return { id: 'nouvelan', key: `nouvelan-${newYear}`, decor: 'fireworks',
        greeting: t('Bonne année {year} ! 🎆', { year: newYear }), greetToday: md(d) !== 1231 };
    }
    // Soirée magique : les 25 et 26 décembre 2026 seulement, à partir de 18 h, après la journée de Noël (chapeau,
    // baguette, étincelles, et un hibou qui apporte une lettre)
    if (year === 2026 && between(d, 1225, 1226) && d.getHours() >= 18) {
      return { id: 'magie', key: `magie-${year}-${md(d)}`, decor: 'snow', magic: true, letter: true,
        greeting: 'Ce soir, c\'est une soirée magique ! ✨🪄', greetToday: true };
    }
    if (between(d, 1201, 1226)) {
      return { id: 'noel', key: `noel-${year}`, decor: 'snow',
        greeting: 'Joyeux Noël ! 🎄', greetToday: between(d, 1224, 1225), gift: between(d, 1224, 1225) };
    }
    if (between(d, 1020, 1031) || between(d, 1101, 1101)) {
      return { id: 'halloween', key: `halloween-${year}`, decor: 'halloween',
        greeting: 'Joyeux Halloween ! 🎃👻', greetToday: md(d) === 1031 };
    }
    if (md(d) === 214) {
      return { id: 'valentin', key: `valentin-${year}`, decor: 'hearts', greeting: 'Bonne Saint-Valentin ! 💕', greetToday: true };
    }
    const e = easter(year);
    const days = Math.round((new Date(year, d.getMonth(), d.getDate()) - e) / 86400000);
    if (days >= -2 && days <= 1) {
      return { id: 'paques', key: `paques-${year}`, decor: 'spring', greeting: 'Joyeuses Pâques ! Trouve les œufs cachés 🥚',
        greetToday: true, eggs: true };
    }
    if (md(d) === 808) {
      return { id: 'chat', key: `chat-${year}`, decor: 'confetti', greeting: 'C\'est la Journée mondiale du chat ! 🐱', greetToday: true };
    }
    return null;
  }

  // Anniversaire mensuel : même jour du mois que l'éclosion (à partir d'un mois)
  function birthday(s, d = new Date()) {
    if (!s || s.dead || d < s.hatchAt) return null;
    const h = new Date(s.hatchAt);
    const months = (d.getFullYear() - h.getFullYear()) * 12 + d.getMonth() - h.getMonth();
    if (months < 1 || d.getDate() !== h.getDate()) return null;
    const years = months / 12;
    const label = months % 12 === 0 ? t(years > 1 ? '{n} ans' : '{n} an', { n: years }) : t('{n} mois', { n: months });
    return { id: 'anniversaire', key: `anniv-${months}`, decor: 'cake', greeting: t("Joyeux anniversaire ! J'ai {age} 🎂", { age: label }), greetToday: true };
  }

  return { current, birthday, easter };
})();
