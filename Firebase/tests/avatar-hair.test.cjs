const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'avatar-hair.js'), 'utf8'), sandbox);
const hair = sandbox.window.JV_AVATAR_HAIR;
const attrs = text => Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));

// Flatten the actual SVG paths so regressions are checked against the silhouette,
// rather than comparing a duplicate of each drawing's source.
function points(d) {
  const tokens = d.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g) || [], result = [];
  let i = 0, point = [0, 0], start;
  const read = () => [Number(tokens[i++]), Number(tokens[i++])];
  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === 'M') { point = read(); start = point; result.push(point); }
    else if (command === 'L') { point = read(); result.push(point); }
    else if (command === 'H') { point = [Number(tokens[i++]), point[1]]; result.push(point); }
    else if (command === 'V') { point = [point[0], Number(tokens[i++])]; result.push(point); }
    else if (command === 'Z') { point = start; result.push(point); }
    else if (command === 'C' || command === 'Q') {
      const first = read(), second = command === 'C' ? read() : null, end = read(), from = point;
      for (let step = 1; step <= 24; step++) {
        const t = step / 24, u = 1 - t;
        result.push(from.map((value, axis) => command === 'C'
          ? u ** 3 * value + 3 * u * u * t * first[axis] + 3 * u * t * t * second[axis] + t ** 3 * end[axis]
          : u * u * value + 2 * u * t * first[axis] + t * t * end[axis]));
      }
      point = end;
    } else throw new Error(`Unsupported SVG command ${command}`);
  }
  return result;
}
function inside(point, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}
function primitives(markup) {
  return [...markup.matchAll(/<(path|circle|ellipse|rect)\b([^>]+)\/>/g)]
    .map(match => ({ type: match[1], a: attrs(match[2]) }));
}
function contains(markup, point) {
  return primitives(markup).some(({ type, a }) => {
    if (a.fill === 'none') return false;
    if (type === 'path') return inside(point, points(a.d));
    if (type === 'circle' || type === 'ellipse') {
      const x = Number(a.cx), y = Number(a.cy), rx = Number(a.rx || a.r), ry = Number(a.ry || a.r);
      return ((point[0] - x) / rx) ** 2 + ((point[1] - y) / ry) ** 2 <= 1;
    }
    return point[0] >= Number(a.x) && point[0] <= Number(a.x) + Number(a.width)
      && point[1] >= Number(a.y) && point[1] <= Number(a.y) + Number(a.height);
  });
}

test('16 active hairstyles retain their saved IDs and distinct silhouettes, including a bald option', () => {
  assert.equal(hair.styles.length, 18);
  assert.equal(hair.styles.filter(Boolean).length, 16);
  assert.equal(hair.styles[2], null); assert.equal(hair.styles[13], null);
  assert.equal(hair.styles[5], 'Coque masculino');
  assert.equal(hair.styles[11], 'Coque alto');
  assert.equal(hair.styles[12], 'Careca');
  const rendered = hair.styles.map((_, style) => hair.render({ hair: style, hc: '#c4452d' }));
  assert.equal(new Set(rendered.map(value => value.back + value.front)).size, 16);
  assert.equal(rendered[12].back, ''); assert.equal(rendered[12].front, '');
  for (const value of rendered) assert.equal(typeof value.ears, 'boolean');
});

test('old or invalid hairstyle values render safely and never become SVG markup or invalid colors', () => {
  const defaultHair = hair.render({ hair: 0 });
  for (const value of [undefined, null, {}, { hair: -1 }, { hair: 18 }, { hair: 2 }, { hair: '2' }, { hair: 13 }, { hair: '13' }, { hair: 2.5 }, { hair: Infinity }, { hair: 'bogus' }]) {
    const result = hair.render(value);
    assert.equal(result.back, defaultHair.back); assert.equal(result.front, defaultHair.front);
  }
  const source = fs.readFileSync(path.join(root, 'avatar-hair.js'), 'utf8');
  assert.doesNotMatch(source, /case\s+(?:2|13)\s*:/);
  assert.doesNotMatch(source, /Topete|Degradê/);
  assert.equal(hair.render({ hair: '17' }).front, hair.render({ hair: 17 }).front);
  for (const value of ['url(https://untrusted.example)', '"><script>bad()</script>', '#xyz', {}, null]) {
    const result = hair.render({ hair: 3, hc: value });
    assert.doesNotMatch(result.back + result.front, /script>|url\(|NaN|undefined|\[object/);
    assert.match(result.front, /fill="#3b2a20"/);
  }
  assert.match(hair.render({ hair: 0, hc: '#AbC' }).front, /fill="#aabbcc"/);
});

test('each hair color is preserved without covering either eye opening on any hairstyle', () => {
  for (const hc of ['#1c1410', '#c9a14a', '#b8b8c8', '#e6477a']) for (let style = 0; style < 18; style++) {
    const result = hair.render({ hair: style, hc });
    assert.doesNotMatch(result.back + result.front, /NaN|undefined/);
    if (style !== 12) assert.ok((result.back + result.front).includes(`fill="${hc}"`));
    for (const x of [41.5, 58.5]) for (const dx of [-3, 0, 3]) for (const dy of [-3, 0, 3]) {
      assert.equal(contains(result.front, [x + dx, 48 + dy]), false, `${hair.styles[style]} covers an eye`);
    }
  }
});

test('hair shapes fit the complete avatar canvas and its circular crop', () => {
  for (let style = 0; style < 18; style++) {
    const result = hair.render({ hair: style });
    for (const { type, a } of primitives(result.back + result.front)) {
      let samples;
      if (type === 'path') samples = points(a.d);
      else if (type === 'rect') samples = [[+a.x, +a.y], [+a.x + +a.width, +a.y], [+a.x, +a.y + +a.height], [+a.x + +a.width, +a.y + +a.height]];
      else samples = Array.from({ length: 48 }, (_, i) => [+a.cx + Math.cos(i * Math.PI / 24) * +(a.rx || a.r), +a.cy + Math.sin(i * Math.PI / 24) * +(a.ry || a.r)]);
      for (const [x, y] of samples) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y), hair.styles[style]);
        assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100, `${hair.styles[style]} outside the canvas`);
        assert.ok(Math.hypot(x - 50, y - 50) < 49.5, `${hair.styles[style]} clipped by the circular avatar`);
      }
    }
  }
});

test('buns, pigtails and ponytail are behind the head instead of duplicated over the face', () => {
  for (const [style, point] of [[5, [53, 16]], [11, [50, 12]], [9, [20, 60]], [10, [20, 60]]]) {
    const result = hair.render({ hair: style });
    assert.equal(contains(result.back, point), true, hair.styles[style]);
    assert.equal(contains(result.front, point), false, hair.styles[style]);
  }
});
