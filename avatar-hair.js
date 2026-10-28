/* Camadas vetoriais dos 16 cabelos. Posições removidas preservam os demais IDs. */
(function () {
  'use strict';
  const styles = Object.freeze(['Social', 'Raspado', null, 'Black power', 'Cacheado curto',
    'Coque masculino', 'Chanel', 'Longo liso', 'Cacheado volumoso', 'Marias-chiquinhas',
    'Rabo de cavalo', 'Coque alto', 'Careca', null, 'Ondulado', 'Crespo',
    'Cabelo médio', 'Franja lateral']);
  function hairColor(value) {
    const hex = typeof value === 'string' ? value.trim() : '';
    if (/^#[a-f\d]{6}$/i.test(hex)) return hex.toLowerCase();
    if (/^#[a-f\d]{3}$/i.test(hex)) return '#' + [...hex.slice(1)].map(c => c + c).join('').toLowerCase();
    return '#3b2a20';
  }
  function tint(hex, amount, target) {
    const number = parseInt(hex.slice(1), 16);
    return '#' + [number >> 16, number >> 8 & 255, number & 255]
      .map(channel => Math.round(channel + (target - channel) * amount).toString(16).padStart(2, '0')).join('');
  }
  function render(avatar) {
    const a = avatar && typeof avatar === 'object' ? avatar : {};
    const requested = typeof a.hair === 'number' || typeof a.hair === 'string' ? Number(a.hair) : 0;
    const style = Number.isInteger(requested) && requested >= 0 && requested < styles.length && styles[requested] ? requested : 0;
    const color = hairColor(a.hc), dark = tint(color, .22, 0), light = tint(color, .26, 255);
    const path = (d, fill = color) => `<path d="${d}" fill="${fill}"/>`;
    const line = (d, stroke = light, opacity = .5, width = 1.3) =>
      `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}"/>`;
    const circles = (items, fill = color) => `<g fill="${fill}">${items.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`;
    const cap = path('M27 47C24 31 33 18 50 18C67 18 76 31 73 47L69 39C66 34 60 31 50 31C40 31 34 34 31 39L30 47Z');
    const sweep = path('M27 47C24 30 34 18 52 18C68 18 77 31 73 47L69 39C65 34 60 31 54 31C46 32 40 36 34 37L30 47Z');
    const shine = line('M35 26Q46 20 61 24');
    let back = '', front = '', ears = true;
    switch (style) {
      case 0:
        front = sweep + line('M49 20Q48 28 42 33', dark, .7, 1.5) + shine;
        break;
      case 1:
        front = path('M29 42C27 31 36 24 50 24C64 24 73 31 71 42L68 36C63 32 57 30 50 30C43 30 37 32 32 36Z')
          + line('M35 29Q50 23 65 29', light, .25, 1);
        break;
      case 3:
        back = circles([[25, 27, 10], [35, 19, 11], [49, 17, 11], [63, 19, 11], [75, 28, 10],
          [23, 41, 10], [77, 41, 10], [28, 53, 9], [72, 53, 9]])
          + path('M24 27Q50 10 76 27L76 51Q50 70 24 51Z');
        front = path('M25 45C21 38 24 31 30 31C28 25 35 21 40 24C43 19 50 20 53 24C59 20 66 23 66 29C74 27 79 34 74 40L72 47L68 38Q64 31 60 35Q55 30 50 34Q45 30 40 35Q35 32 32 39L29 47Z')
          + circles([[30, 30, 3.5], [39, 24, 4], [49, 22, 4], [60, 24, 4], [70, 30, 3.5]])
          + line('M30 24Q40 14 54 15', light, .24);
        break;
      case 4:
        back = circles([[31, 30, 7], [38, 24, 7], [49, 22, 8], [61, 24, 7], [69, 31, 7]]);
        front = cap + circles([[30, 37, 5], [35, 29, 5], [44, 25, 5], [53, 25, 5], [62, 28, 5], [69, 36, 5]])
          + line('M37 24Q40 21 44 23M52 21Q56 20 59 23', light, .4, 1.1);
        break;
      case 5:
        back = `<ellipse cx="53" cy="16" rx="8" ry="8" fill="${color}"/>`
          + line('M49 11Q58 10 58 17', light, .5)
          + `<rect x="46" y="20" width="14" height="3" rx="1.5" fill="${dark}"/>`;
        front = cap + shine;
        break;
      case 6:
        back = path('M23 48C21 27 31 17 50 17C69 17 79 27 77 48L77 68Q68 73 63 67H37Q32 73 23 68Z')
          + line('M27 36L27 63M73 36L73 63', light, .3);
        front = sweep + path('M25 40Q29 34 31 38L31 61Q27 57 25 55ZM75 40Q71 34 69 38L69 61Q73 57 75 55Z');
        ears = false;
        break;
      case 7:
        back = path('M22 47C20 26 32 16 50 16C68 16 80 26 78 47L79 89Q67 95 62 87H38Q33 95 21 89Z')
          + line('M26 39Q24 60 25 84M74 39Q76 60 75 84', light, .3);
        front = sweep + path('M26 40L31 39Q29 57 33 73Q34 80 31 87Q24 80 24 70ZM74 40L69 39Q71 57 67 73Q66 80 69 87Q76 80 76 70Z')
          + line('M27 48Q26 64 29 77M73 48Q74 64 71 77', light, .45);
        ears = false;
        break;
      case 8:
        back = path('M21 35Q21 17 50 15Q79 17 79 35L80 72Q67 90 50 80Q33 90 20 72Z')
          + circles([[27, 28, 10], [39, 21, 10], [52, 20, 10], [65, 24, 10], [76, 34, 9],
            [23, 43, 10], [77, 47, 10], [23, 58, 9], [76, 63, 10], [29, 73, 9], [68, 75, 9]]);
        front = sweep + circles([[30, 34, 5], [37, 27, 5], [46, 24, 5], [56, 25, 5], [65, 30, 5],
          [25, 46, 5], [25, 57, 5], [28, 68, 5], [75, 45, 5], [75, 56, 5], [72, 68, 5]])
          + line('M21 48Q17 53 21 57M78 59Q82 65 77 68M36 20Q42 16 45 20', light, .3);
        ears = false;
        break;
      case 9:
        back = path('M30 38Q15 39 14 57Q11 72 24 84Q28 75 26 68Q35 55 30 38Z')
          + path('M70 38Q85 39 86 57Q89 72 76 84Q72 75 74 68Q65 55 70 38Z')
          + line('M22 49Q17 64 23 75M78 49Q83 64 77 75', light, .45)
          + `<rect x="22" y="41" width="10" height="4" rx="2" fill="#a98be0"/><rect x="68" y="41" width="10" height="4" rx="2" fill="#a98be0"/>`;
        front = cap + shine;
        ears = false;
        break;
      case 10:
        back = path('M31 30Q15 35 15 50Q9 68 20 83Q29 77 26 65Q34 50 31 30Z')
          + line('M22 45Q15 62 21 73', light, .5)
          + `<path d="M24 37L32 36L33 40L24 42Z" fill="#a98be0"/>`;
        front = cap + shine;
        break;
      case 11:
        back = `<ellipse cx="50" cy="13" rx="10" ry="10" fill="${color}"/>`
          + line('M44 8Q54 4 57 13M45 17Q53 20 57 15', light, .55)
          + `<rect x="40" y="20" width="20" height="4" rx="2" fill="#a98be0"/>`;
        front = cap + shine;
        break;
      case 12:
        break;
      case 14:
        back = path('M22 44C19 28 32 16 50 16C68 16 81 28 78 44C74 55 85 61 79 71Q75 79 78 85Q66 83 65 72H35Q34 83 22 85Q25 79 21 71C15 61 26 55 22 44Z')
          + line('M26 30Q21 42 27 51Q31 61 25 71M74 30Q79 42 73 51Q69 61 75 71', light, .45);
        front = sweep + path('M26 38Q32 36 31 43C28 54 36 58 31 69Q28 75 29 80Q22 74 25 65C30 55 22 50 26 38ZM74 38Q68 36 69 43C72 54 64 58 69 69Q72 75 71 80Q78 74 75 65C70 55 78 50 74 38Z')
          + line('M38 23Q42 20 46 23M52 22Q58 18 63 24', light, .5);
        ears = false;
        break;
      case 15:
        back = circles([[28, 31, 6], [33, 25, 6], [41, 21, 6], [50, 20, 6], [59, 21, 6], [67, 25, 6], [72, 32, 6]]);
        front = cap + circles([[29, 35, 3.5], [34, 29, 3.5], [41, 26, 3.5], [49, 25, 3.5], [57, 26, 3.5], [65, 29, 3.5], [71, 35, 3.5]])
          + line('M33 25Q36 22 38 25M45 20Q48 18 50 21M57 21Q61 18 63 22M66 25Q70 23 71 27', light, .5, 1);
        break;
      case 16:
        back = path('M24 45C21 28 33 17 50 17C67 17 79 28 76 45L76 76Q67 82 63 74H37Q33 82 24 76Z')
          + line('M27 40L27 70M73 40L73 70', light, .35);
        front = sweep + path('M26 40L31 39L31 66Q28 70 25 70ZM74 40L69 39L69 66Q72 70 75 70Z') + shine;
        ears = false;
        break;
      case 17:
        front = path('M27 47C24 29 34 17 53 17C69 17 78 29 73 47L69 39C65 33 59 30 54 31C46 31 43 35 39 38Q34 42 30 44L30 47Z')
          + line('M54 21Q42 23 34 35', light, .6, 1.7);
        break;
    }
    const wrap = (markup, layer) => markup ? `<g data-hair-style="${style}" data-hair-layer="${layer}">${markup}</g>` : '';
    return { back: wrap(back, 'back'), front: wrap(front, 'front'), ears };
  }
  window.JV_AVATAR_HAIR = Object.freeze({ render, styles });
})();
