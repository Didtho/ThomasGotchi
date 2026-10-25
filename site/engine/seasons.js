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

  // n-ième dimanche d'un mois (n = -1 : le dernier), sous la forme 1224
  function sunday(year, month, n) {
    const day = new Date(year, month - 1, 1);
    if (n > 0) {
      day.setDate(1 + ((7 - day.getDay()) % 7) + (n - 1) * 7);
    } else {
      day.setMonth(month, 0); // dernier jour du mois
      day.setDate(day.getDate() - day.getDay());
    }
    return md(day);
  }

  // Fêtes de la famille (dates françaises) : mamies, mamans, papas, papis
  function familyDay(d) {
    const year = d.getFullYear();
    const today = md(d);
    if (today === sunday(year, 3, 1)) return { id: 'grandsmeres', greeting: 'Bonne fête à toutes les mamies ! 💐' };
    // Fête des mères : dernier dimanche de mai, ou premier de juin s'il tombe le jour de la Pentecôte
    const pentecost = new Date(easter(year));
    pentecost.setDate(pentecost.getDate() + 49);
    const mothers = sunday(year, 5, -1) === md(pentecost) ? sunday(year, 6, 1) : sunday(year, 5, -1);
    if (today === mothers) return { id: 'meres', greeting: 'Bonne fête à toutes les mamans ! 💐' };
    if (today === sunday(year, 6, 3)) return { id: 'peres', greeting: 'Bonne fête à tous les papas ! 👔' };
    if (today === sunday(year, 10, 1)) return { id: 'grandsperes', greeting: 'Bonne fête à tous les papis ! 🎩' };
    return null;
  }

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
    const family = familyDay(d);
    if (family) return { ...family, key: `${family.id}-${year}`, decor: 'hearts', greetToday: true };
    if (md(d) === 202) {
      return { id: 'chandeleur', key: `chandeleur-${year}`, decor: 'crepe', greeting: 'C\'est la Chandeleur ! Qui veut des crêpes ? 🥞', greetToday: true };
    }
    if (md(d) === 401) {
      return { id: 'poisson', key: `poisson-${year}`, decor: 'fish', greeting: 'Hihi… pourquoi tu rigoles ? J\'ai quelque chose dans le dos ? 🐟', greetToday: true };
    }
    if (md(d) === 621) {
      return { id: 'musique', key: `musique-${year}`, decor: 'music', greeting: 'C\'est la Fête de la musique ! 🎶', greetToday: true };
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
