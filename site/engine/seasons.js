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

  // n-ième jour donné de la semaine d'un mois (weekday : 0 = dimanche … 6 = samedi), sous la forme 1124
  function nthWeekday(year, month, weekday, n) {
    const day = new Date(year, month - 1, 1);
    day.setDate(1 + ((7 + weekday - day.getDay()) % 7) + (n - 1) * 7);
    return md(day);
  }

  // Fêtes propres à certains pays (fêtes nationales, Thanksgiving, Saint-Patrick…)
  function nationalDay(d, country) {
    const year = d.getFullYear();
    const today = md(d);
    const fromEaster = (n) => { const x = easter(year); x.setDate(x.getDate() + n); return md(x); };
    const DAYS = [
      // [pays, date, id, décor, vœux, cadeau]
      ['US', nthWeekday(year, 11, 4, 4), 'thanksgiving', 'leaves', 'Joyeux Thanksgiving ! 🦃'],
      ['CA', nthWeekday(year, 10, 1, 2), 'thanksgiving', 'leaves', 'Joyeux Thanksgiving ! 🦃'],
      ['US', 704, 'independance', 'fireworks', 'Joyeuse fête de l\'Indépendance ! 🎆'],
      ['CA', 701, 'canada', 'fireworks', 'Bonne fête du Canada ! 🍁'],
      ['FR', 714, 'nationale', 'fireworks', 'Bonne fête nationale ! 🎆'],
      ['BE', 721, 'nationale', 'fireworks', 'Bonne fête nationale ! 🎆'],
      ['CH', 801, 'nationale', 'fireworks', 'Bonne fête nationale ! 🎆'],
      ['IT', 602, 'nationale', 'fireworks', 'Bonne fête nationale ! 🎆'],
      ['IT', 815, 'ferragosto', 'confetti', 'Bon Ferragosto ! ☀️'],
      ['US', 317, 'stpatrick', 'shamrock', 'Joyeuse Saint-Patrick ! ☘️'],
      ['IE', 317, 'stpatrick', 'shamrock', 'Joyeuse Saint-Patrick ! ☘️'],
      ['GB', 317, 'stpatrick', 'shamrock', 'Joyeuse Saint-Patrick ! ☘️'],
      ['GB', fromEaster(-47), 'pancake', 'crepe', 'C\'est Pancake Day ! Qui veut des crêpes ? 🥞'],
      ['IE', fromEaster(-47), 'pancake', 'crepe', 'C\'est Pancake Day ! Qui veut des crêpes ? 🥞'],
      ['GB', 1105, 'bonfire', 'fireworks', 'C\'est Bonfire Night ! 🎆'],
      ['ES', 106, 'rois', 'confetti', 'Les Rois mages sont passés ! 👑', true],
      ['IT', 106, 'befana', 'confetti', 'La Befana est passée ! 🧹', true],
      ['ES', 1228, 'inocentes', 'fish', 'Hihi… pourquoi tu rigoles ? J\'ai quelque chose dans le dos ? 🐟'],
    ];
    const found = DAYS.find(([c, day]) => c === country && day === today);
    if (!found) return null;
    const [, , id, decor, greeting, gift] = found;
    return { id, key: `${id}-${year}`, decor, greeting, greetToday: true, gift: !!gift };
  }

  // Pays francophones (Chandeleur)
  const FRANCOPHONE = ['FR', 'BE', 'CH', 'LU', 'MC', 'CA'];

  // Fêtes de la famille : mamies, mamans, papas, papis. Leurs dates changent d'un pays à l'autre
  // (code du pays réglé dans le système : 'FR', 'US', 'GB', 'ES', 'IT'…)
  function familyDay(d, country) {
    const year = d.getFullYear();
    const today = md(d);
    const fromEaster = (n) => { const x = easter(year); x.setDate(x.getDate() + n); return md(x); };
    const GREET = {
      meres: 'Bonne fête à toutes les mamans ! 💐', peres: 'Bonne fête à tous les papas ! 👔',
      grandsmeres: 'Bonne fête à toutes les mamies ! 💐', grandsperes: 'Bonne fête à tous les papis ! 🎩',
      grandsparents: 'Bonne fête à tous les papis et mamies ! 💐',
    };
    const days = [];
    // Mamans
    if (country === 'FR' || country === 'MC') {
      // dernier dimanche de mai, ou premier de juin s'il tombe le jour de la Pentecôte
      days.push(['meres', sunday(year, 5, -1) === fromEaster(49) ? sunday(year, 6, 1) : sunday(year, 5, -1)]);
    } else if (['GB', 'IE'].includes(country)) days.push(['meres', fromEaster(-21)]); // « Mothering Sunday »
    else if (['ES', 'PT'].includes(country)) days.push(['meres', sunday(year, 5, 1)]);
    else days.push(['meres', sunday(year, 5, 2)]);
    // Papas
    if (['ES', 'IT', 'PT'].includes(country)) days.push(['peres', 319]); // Saint-Joseph
    else if (country === 'DE') days.push(['peres', fromEaster(39)]); // Ascension
    else if (country === 'BE') days.push(['peres', sunday(year, 6, 2)]);
    else days.push(['peres', sunday(year, 6, 3)]);
    // Grands-parents
    if (country === 'FR') {
      days.push(['grandsmeres', sunday(year, 3, 1)], ['grandsperes', sunday(year, 10, 1)]);
    } else if (country === 'IT') {
      days.push(['grandsparents', 1002]);
    } else if (['US', 'CA'].includes(country)) {
      const labor = new Date(year, 8, 1);
      labor.setDate(1 + ((8 - labor.getDay()) % 7)); // premier lundi de septembre
      labor.setDate(labor.getDate() + 6); // le dimanche qui suit
      days.push(['grandsparents', md(labor)]);
    }
    const found = days.find(([, day]) => day === today);
    return found ? { id: found[0], greeting: GREET[found[0]] } : null;
  }

  // Fête du moment (une seule à la fois), ou null. country : code du pays (certaines fêtes en dépendent)
  function current(d = new Date(), country = 'FR') {
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
    const national = nationalDay(d, country);
    if (national) return national;
    const family = familyDay(d, country);
    if (family) return { ...family, key: `${family.id}-${year}`, decor: 'hearts', greetToday: true };
    if (md(d) === 202 && FRANCOPHONE.includes(country)) {
      return { id: 'chandeleur', key: `chandeleur-${year}`, decor: 'crepe', greeting: 'C\'est la Chandeleur ! Qui veut des crêpes ? 🥞', greetToday: true };
    }
    if (md(d) === 401 && country !== 'ES') { // en Espagne, les blagues se font le 28 décembre
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
