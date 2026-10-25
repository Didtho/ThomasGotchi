// Petits bruitages synthétisés en direct (aucun fichier audio). Volume volontairement doux.

const Sound = (() => {
  let ctx = null;
  let master = null;

  function audio() {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.3;
      master.connect(ctx.destination);
    }
    // Le système peut suspendre le son d'une fenêtre restée longtemps sans interaction
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Note simple avec enveloppe : fréquence de départ, d'arrivée, durée
  function tone(type, f0, f1, dur, { at = 0, vol = 1, filter = null } = {}) {
    const a = audio();
    const t = a.currentTime + at;
    const osc = a.createOscillator();
    const env = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.04, dur / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (filter) {
      const f = a.createBiquadFilter();
      f.type = filter.type;
      f.frequency.value = filter.freq;
      f.Q.value = filter.q || 1;
      osc.connect(f);
      node = f;
    }
    node.connect(env);
    env.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // Bruit filtré (craquements, bulles, ronflement)
  function noise(dur, { at = 0, vol = 1, freq = 1200, q = 1, type = 'bandpass', attack = 0.005 } = {}) {
    const a = audio();
    const t = a.currentTime + at;
    const len = Math.ceil(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const env = a.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(vol, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(env);
    env.connect(master);
    src.start(t);
  }

  const voices = {
    // Miaou : montée puis descente, timbre nasal grâce au filtre
    chat() {
      tone('sawtooth', 520, 820, 0.18, { vol: 0.5, filter: { type: 'bandpass', freq: 1400, q: 3 } });
      tone('sawtooth', 820, 480, 0.32, { at: 0.16, vol: 0.5, filter: { type: 'bandpass', freq: 1200, q: 3 } });
    },
    // Petit couinement aigu
    lapin() {
      tone('sine', 1400, 2000, 0.08, { vol: 0.5 });
      tone('sine', 1600, 2300, 0.08, { at: 0.11, vol: 0.4 });
    },
    // Ouaf ouaf !
    chien() {
      tone('sawtooth', 380, 240, 0.12, { vol: 0.6, filter: { type: 'bandpass', freq: 900, q: 2 } });
      tone('sawtooth', 380, 240, 0.12, { at: 0.2, vol: 0.6, filter: { type: 'bandpass', freq: 900, q: 2 } });
    },
    // Petit glapissement aigu
    renard() {
      tone('sawtooth', 900, 1500, 0.1, { vol: 0.45, filter: { type: 'bandpass', freq: 1600, q: 3 } });
      tone('sawtooth', 1400, 800, 0.15, { at: 0.12, vol: 0.4, filter: { type: 'bandpass', freq: 1400, q: 3 } });
    },
    panda() { voices.ours(); },
    // Coin-coin de pingouin
    pingouin() {
      for (let i = 0; i < 2; i++) tone('square', 600, 450, 0.12, { at: i * 0.18, vol: 0.25, filter: { type: 'bandpass', freq: 1100, q: 4 } });
    },
    // Couic couic
    hamster() {
      for (let i = 0; i < 3; i++) tone('sine', 2200, 2800, 0.05, { at: i * 0.08, vol: 0.35 });
    },
    koala() { tone('sawtooth', 110, 90, 0.4, { vol: 0.5, filter: { type: 'lowpass', freq: 400 } }); },
    // Croâ croâ
    grenouille() {
      for (let i = 0; i < 2; i++) tone('sawtooth', 160, 120, 0.15, { at: i * 0.22, vol: 0.55, filter: { type: 'bandpass', freq: 500, q: 5 } });
    },
    // Hennissement et paillettes magiques
    licorne() {
      tone('triangle', 700, 1100, 0.3, { vol: 0.35 });
      [1568, 2093, 2637].forEach((f, i) => tone('sine', f, f, 0.12, { at: 0.3 + i * 0.07, vol: 0.25 }));
    },
    // Petit rugissement de bébé dragon
    dragon() {
      tone('sawtooth', 220, 140, 0.45, { vol: 0.5, filter: { type: 'lowpass', freq: 900, q: 2 } });
      noise(0.35, { at: 0.1, vol: 0.25, freq: 900, q: 0.7 });
    },
    // Ahouuu !
    loup() { tone('sine', 380, 620, 0.5, { vol: 0.45 }); tone('sine', 620, 420, 0.7, { at: 0.5, vol: 0.4 }); },
    lion() { tone('sawtooth', 180, 120, 0.6, { vol: 0.55, filter: { type: 'lowpass', freq: 700, q: 2 } }); },
    tigre() { tone('sawtooth', 200, 130, 0.5, { vol: 0.55, filter: { type: 'lowpass', freq: 800, q: 3 } }); },
    // Groin groin
    cochon() { for (let i = 0; i < 2; i++) tone('square', 260, 200, 0.14, { at: i * 0.2, vol: 0.25, filter: { type: 'bandpass', freq: 700, q: 5 } }); },
    // Bêêê (avec un petit chevrotement)
    mouton() { for (let i = 0; i < 5; i++) tone('sawtooth', 420 + (i % 2) * 40, 400, 0.09, { at: i * 0.08, vol: 0.35, filter: { type: 'bandpass', freq: 1200, q: 3 } }); },
    souris() { for (let i = 0; i < 2; i++) tone('sine', 3000, 3600, 0.05, { at: i * 0.1, vol: 0.3 }); },
    // Hou hou
    hibou() { tone('sine', 420, 380, 0.25, { vol: 0.5 }); tone('sine', 400, 360, 0.35, { at: 0.35, vol: 0.5 }); },
    // Ouh ouh ah !
    singe() { [500, 520, 900].forEach((f, i) => tone('triangle', f, f * 1.2, 0.12, { at: i * 0.15, vol: 0.4 })); },
    raton() { for (let i = 0; i < 4; i++) tone('triangle', 1500 + Math.random() * 500, 1300, 0.05, { at: i * 0.07, vol: 0.3 }); },
    // Grognement tout doux
    ours() {
      tone('sawtooth', 140, 190, 0.25, { vol: 0.6, filter: { type: 'lowpass', freq: 600 } });
      tone('sawtooth', 190, 120, 0.3, { at: 0.22, vol: 0.5, filter: { type: 'lowpass', freq: 500 } });
    },
  };

  const effects = {
    // « Joyeux anniversaire » (mélodie du domaine public), joué doucement pour l'anniversaire du maître
    birthday() {
      const notes = [[392, 0.75], [392, 0.25], [440, 1], [392, 1], [523, 1], [494, 2], [392, 0.75], [392, 0.25], [440, 1], [392, 1], [587, 1], [523, 2]];
      let at = 0;
      for (const [f, beats] of notes) { tone('triangle', f, f, beats * 0.27, { at, vol: 0.45 }); at += beats * 0.3; }
    },
    eat() { for (let i = 0; i < 4; i++) noise(0.07, { at: i * 0.22, vol: 0.9, freq: 2200 + Math.random() * 1500, q: 0.8 }); },
    drink() { for (let i = 0; i < 3; i++) tone('sine', 300, 650, 0.12, { at: i * 0.3, vol: 0.7 }); },
    play() { tone('sine', 220, 700, 0.25, { vol: 0.6 }); tone('triangle', 700, 300, 0.2, { at: 0.25, vol: 0.4 }); },
    wash() { for (let i = 0; i < 6; i++) tone('sine', 600 + Math.random() * 900, 1500 + Math.random() * 900, 0.07, { at: i * 0.12 + Math.random() * 0.05, vol: 0.4 }); },
    heal() { [660, 880, 1320].forEach((f, i) => tone('triangle', f, f, 0.25, { at: i * 0.1, vol: 0.4 })); },
    hatch() { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.22, { at: i * 0.11, vol: 0.45 })); },
    grow() { [392, 523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.2, { at: i * 0.09, vol: 0.4 })); },
    poop() { tone('sine', 180, 70, 0.22, { vol: 0.8 }); },
    sparkle() { [1568, 2093, 2637].forEach((f, i) => tone('sine', f, f, 0.15, { at: i * 0.07, vol: 0.3 })); },
    alert() { tone('triangle', 880, 880, 0.15, { vol: 0.35 }); tone('triangle', 660, 660, 0.25, { at: 0.17, vol: 0.35 }); },
    // Ronflement : « rrrr » qui inspire (vibration grave), puis « pfff » qui expire (souffle)
    snore() {
      tone('sawtooth', 95, 120, 1.0, { vol: 0.7, filter: { type: 'lowpass', freq: 700, q: 4 } });
      tone('sawtooth', 47, 60, 1.0, { vol: 0.5, filter: { type: 'lowpass', freq: 400 } });
      noise(0.9, { at: 1.1, vol: 0.5, freq: 1100, q: 0.8, attack: 0.25 });
    },
    sad() { tone('sine', 520, 300, 0.6, { vol: 0.35 }); },
    purr() { noise(0.75, { vol: 0.2, freq: 140, q: 2, attack: 0.3 }); }, // ronronnement (gros câlin)
    flip() { tone('triangle', 700, 900, 0.06, { vol: 0.25 }); }, // carte retournée (jeu des paires)
    pee() { noise(1.4, { vol: 0.25, freq: 3500, q: 1.5, attack: 0.2 }); },
    jump() { tone('sine', 300, 900, 0.22, { vol: 0.5 }); },
    roll() { noise(0.5, { vol: 0.4, freq: 900, q: 0.7, attack: 0.2 }); },
    stretch() { tone('sine', 400, 250, 0.5, { vol: 0.3 }); },
    dizzy() { for (let i = 0; i < 6; i++) tone('sine', 900 - i * 80, 700 - i * 80, 0.1, { at: i * 0.09, vol: 0.3 }); },
    dance() { [523, 659, 784, 659, 523, 784].forEach((f, i) => tone('triangle', f, f, 0.16, { at: i * 0.2, vol: 0.35 })); },
    spin() { tone('sine', 300, 1200, 0.6, { vol: 0.35 }); },
    backflip() { tone('sine', 250, 1000, 0.4, { vol: 0.45 }); tone('triangle', 1000, 1000, 0.15, { at: 0.8, vol: 0.3 }); },
    tussle() { for (let i = 0; i < 5; i++) noise(0.08, { at: i * 0.15, vol: 0.5, freq: 600 + Math.random() * 800, q: 1 }); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone('square', f, f, 0.12, { at: i * 0.08, vol: 0.15 })); },
  };

  return {
    enabled: true,
    // name : nom d'un effet, ou 'voice' pour le cri de l'animal
    play(name, species) {
      if (!this.enabled || this.muted) return;
      try {
        if (name === 'voice' || name === 'love') (voices[species] || voices.chat)();
        else if (effects[name]) effects[name]();
      } catch { /* pas de carte son : tant pis */ }
    },
  };
})();
