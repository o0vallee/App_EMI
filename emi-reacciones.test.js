// Pruebas unitarias de "Emi vivo" (el personaje que reacciona al toque) y de la
// estructura del index.html.
//
// Cómo correrlas (no hay que instalar nada, solo Node 18 o más nuevo):
//     node --test emi-reacciones.test.js
// El archivo debe estar en la misma carpeta que index.html. Para probar otro archivo:
//     EMI_INDEX=/ruta/a/index.html node --test emi-reacciones.test.js
//
// La lógica NO está copiada aquí: se lee del propio index.html, del bloque marcado con
// /*<emi-react-core>*/ ... /*</emi-react-core>*/, así las pruebas siempre corren contra
// el código que de verdad se publica.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const file = process.env.EMI_INDEX || path.join(__dirname, "index.html");
const html = fs.readFileSync(file, "utf8");

function loadCore(){
  const blocks = html.match(/\/\*<emi-react-core>\*\/[\s\S]*?\/\*<\/emi-react-core>\*\//g) || [];
  assert.equal(blocks.length, 1, "debe haber exactamente un bloque emi-react-core en index.html");
  const mod = { exports: {} };
  new Function("module", blocks[0])(mod);     // el bloque no usa DOM, temporizadores ni audio
  return mod.exports;
}
const core = loadCore();
const PARTS = ["cabeza", "orejas", "ojos", "nariz", "boca", "barriga", "brazos", "manos", "piernas", "pies"];

// ---------------------------------------------------------------- qué reacción toca

test("cada parte del cuerpo tiene su reacción", () => {
  const esperado = {
    cabeza: "brinca", orejas: "brinca", barriga: "cosquillas", manos: "saluda", brazos: "saluda",
    ojos: "parpadea", nariz: "risa", boca: "risa", piernas: "zapatea", pies: "zapatea"
  };
  for (const parte of PARTS) assert.equal(core.reactionFor(parte), esperado[parte], parte);
});

test("una parte desconocida no produce reacción", () => {
  assert.equal(core.reactionFor("cola"), null);
  assert.equal(core.reactionFor(""), null);
  assert.equal(core.reactionFor(undefined), null);
  assert.equal(core.reactionFor("toString"), null, "no debe confundirse con propiedades heredadas");
});

test("toda reacción (incluido el mareo) tiene una duración positiva", () => {
  const reacciones = new Set(PARTS.map(core.reactionFor).concat(["mareo"]));
  for (const r of reacciones) {
    assert.ok(Number.isFinite(core.DURATION[r]) && core.DURATION[r] > 0, r);
  }
});

// ---------------------------------------------------------------- los ojos siguen el dedo

test("los ojos nunca se salen de su límite", () => {
  let semilla = 12345;
  const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 2000; i++) {
    const o = core.eyeOffset((azar() - .5) * 4000, (azar() - .5) * 4000);
    assert.ok(Math.hypot(o.x, o.y) <= core.EYE_MAX + 1e-9, "desplazamiento " + Math.hypot(o.x, o.y));
  }
});

test("los ojos miran hacia donde está el dedo", () => {
  const derecha = core.eyeOffset(500, 0);
  assert.ok(derecha.x > 0 && Math.abs(derecha.y) < 1e-9);
  const arribaIzq = core.eyeOffset(-300, -300);
  assert.ok(arribaIzq.x < 0 && arribaIzq.y < 0);
  assert.ok(Math.abs(arribaIzq.x - arribaIzq.y) < 1e-9, "conserva la dirección");
});

test("cuanto más cerca el dedo, menos se mueven los ojos; lejos llegan al tope", () => {
  const cerca = Math.hypot(...Object.values(core.eyeOffset(core.EYE_REACH / 4, 0)));
  const medio = Math.hypot(...Object.values(core.eyeOffset(core.EYE_REACH / 2, 0)));
  const lejos = Math.hypot(...Object.values(core.eyeOffset(core.EYE_REACH * 10, 0)));
  assert.ok(cerca < medio && medio < lejos);
  assert.ok(Math.abs(lejos - core.EYE_MAX) < 1e-9);
});

test("el dedo justo sobre los ojos, o un dato inválido, deja los ojos al centro", () => {
  assert.deepEqual(core.eyeOffset(0, 0), { x: 0, y: 0 });
  assert.deepEqual(core.eyeOffset(NaN, 5), { x: 0, y: 0 });
  assert.deepEqual(core.eyeOffset(Infinity, 0), { x: 0, y: 0 });
});

test("el límite y el alcance de los ojos se pueden ajustar", () => {
  const o = core.eyeOffset(1000, 0, 10, 100);
  assert.ok(Math.abs(o.x - 10) < 1e-9);
});

// ---------------------------------------------------------------- una reacción a la vez

test("un toque inicia la reacción y Emi queda ocupado lo que dura", () => {
  const s = core.createState(0);
  assert.equal(core.tap(s, "barriga", 1000), "cosquillas");
  assert.equal(core.isBusy(s, 1000), true);
  assert.equal(core.isBusy(s, 1000 + core.DURATION.cosquillas - 1), true);
  assert.equal(core.isBusy(s, 1000 + core.DURATION.cosquillas), false);
});

test("un toque durante una reacción se descarta (no se encima ni se encola)", () => {
  const s = core.createState(0);
  assert.equal(core.tap(s, "cabeza", 1000), "brinca");
  assert.equal(core.tap(s, "barriga", 1200), null);
  assert.equal(s.current, "brinca", "la reacción en curso no cambia");
  assert.equal(core.tap(s, "barriga", 1000 + core.DURATION.brinca), "cosquillas", "al terminar ya acepta otro toque");
});

test("tocar una parte desconocida no cuenta ni ocupa a Emi", () => {
  const s = core.createState(0);
  assert.equal(core.tap(s, "cola", 500), null);
  assert.equal(core.isBusy(s, 500), false);
  assert.equal(s.taps.length, 0);
});

// ---------------------------------------------------------------- el mareo

test("muchos toques seguidos marean a Emi, aunque esté a media reacción", () => {
  const s = core.createState(0);
  const resultados = [];
  for (let i = 0; i < core.DIZZY_TAPS; i++) resultados.push(core.tap(s, "cabeza", 1000 + i * 200));
  assert.equal(resultados[0], "brinca");
  assert.deepEqual(resultados.slice(1, -1), Array(core.DIZZY_TAPS - 2).fill(null));
  assert.equal(resultados.at(-1), "mareo");
  assert.equal(s.current, "mareo");
});

test("mientras está mareado ignora los toques, y después vuelve a la normalidad", () => {
  const s = core.createState(0);
  let t = 1000;
  for (let i = 0; i < core.DIZZY_TAPS; i++) core.tap(s, "pies", t += 100);
  const inicio = t;
  for (let i = 1; i <= 8; i++) assert.equal(core.tap(s, "pies", inicio + i * 100), null);
  const fin = inicio + core.DURATION.mareo;
  assert.equal(core.tap(s, "pies", fin), "zapatea", "un toque después del mareo no lo vuelve a marear");
});

test("toques espaciados nunca lo marean", () => {
  const s = core.createState(0);
  let t = 0;
  for (let i = 0; i < 30; i++) {
    t += core.DIZZY_WINDOW;      // siempre fuera de la ventana del toque anterior
    assert.notEqual(core.tap(s, "manos", t), "mareo");
  }
});

// ---------------------------------------------------------------- el parpadeo

test("no parpadea antes de tiempo y sí cuando le toca", () => {
  const s = core.createState(1000);
  assert.equal(core.shouldBlink(s, 1000), false);
  assert.equal(core.shouldBlink(s, 1000 + core.BLINK_MIN - 1), false);
  assert.equal(core.shouldBlink(s, 1000 + core.BLINK_MIN), true);
});

test("no parpadea en medio de una reacción ni justo al terminarla", () => {
  const s = core.createState(0);
  const t = core.BLINK_MIN + 50;                   // ya le tocaba parpadear
  assert.equal(core.shouldBlink(s, t), true);
  core.tap(s, "cabeza", t);
  assert.equal(core.shouldBlink(s, t + 1), false);
  assert.equal(core.shouldBlink(s, t + core.DURATION.brinca), false, "deja un respiro tras la reacción");
  assert.equal(core.shouldBlink(s, t + core.DURATION.brinca + 400), true);
});

test("el siguiente parpadeo cae dentro del rango previsto", () => {
  const s = core.createState(0);
  assert.equal(core.scheduleBlink(s, 5000, 0), 5000 + core.BLINK_MIN);
  assert.equal(core.scheduleBlink(s, 5000, 1), 5000 + core.BLINK_MIN + core.BLINK_SPREAD);
  const medio = core.scheduleBlink(s, 5000, .5);
  assert.ok(medio > 5000 + core.BLINK_MIN && medio < 5000 + core.BLINK_MIN + core.BLINK_SPREAD);
  assert.equal(core.scheduleBlink(s, 5000, 7), 5000 + core.BLINK_MIN + core.BLINK_SPREAD, "recorta valores fuera de 0..1");
  assert.equal(core.scheduleBlink(s, 5000, NaN), 5000 + core.BLINK_MIN);
});

// ---------------------------------------------------------------- saludo

test("saluda con el brazo del lado que se tocó", () => {
  assert.equal(core.waveSide(10, 100), "l");
  assert.equal(core.waveSide(190, 100), "r");
});

// ---------------------------------------------------------------- otros personajes y toques por posición

test("los personajes sin articulaciones solo hacen gestos de cuerpo completo", () => {
  const cuerpoCompleto = new Set(["brinca", "cosquillas", "zapatea", "mareo"]);
  for (const r of Object.keys(core.DURATION)) {
    assert.ok(cuerpoCompleto.has(core.simpleReaction(r)), r + " -> " + core.simpleReaction(r));
  }
  assert.equal(core.simpleReaction("no-existe"), null);
});

test("un toque en modo simple (papá, mamá, maestra) nunca pide un gesto de brazo o cara", () => {
  for (const parte of PARTS) {
    const s = core.createState(0);
    const r = core.tap(s, parte, 1000, true);
    assert.ok(["brinca", "cosquillas", "zapatea"].includes(r), parte + " -> " + r);
    assert.equal(s.current, r);
  }
});

test("el mareo también aplica en modo simple", () => {
  const s = core.createState(0);
  let ultimo = null;
  for (let i = 0; i < core.DIZZY_TAPS; i++) ultimo = core.tap(s, "barriga", 1000 + i * 150, true);
  assert.equal(ultimo, "mareo");
});

test("la posición del toque dentro del personaje indica la parte", () => {
  assert.equal(core.partFromPoint(0.5, 0.1), "cabeza");
  assert.equal(core.partFromPoint(0.5, 0.55), "barriga");
  assert.equal(core.partFromPoint(0.1, 0.6), "manos");
  assert.equal(core.partFromPoint(0.9, 0.6), "manos");
  assert.equal(core.partFromPoint(0.5, 0.9), "pies");
});

test("un toque fuera del recuadro igual cae en una parte válida", () => {
  for (const [fx, fy] of [[-1, -1], [2, 2], [0.5, NaN], [NaN, 0.5], [0.5, 5]]) {
    assert.ok(core.reactionFor(core.partFromPoint(fx, fy)), fx + "," + fy);
  }
});

// ---------------------------------------------------------------- estructura del index.html

const sinScripts = html.replace(/<script[\s\S]*?<\/script>/g, "");

test("ningún id del HTML está repetido", () => {
  const cuenta = {};
  for (const m of sinScripts.matchAll(/\sid="([^"]+)"/g)) cuenta[m[1]] = (cuenta[m[1]] || 0) + 1;
  const repetidos = Object.entries(cuenta).filter(([, n]) => n > 1).map(([id, n]) => id + " x" + n);
  assert.deepEqual(repetidos, []);
});

test("el manifest es un archivo real (requisito para instalarse como app)", () => {
  const m = sinScripts.match(/<link rel="manifest" href="([^"]+)"/);
  assert.ok(m, "falta <link rel=\"manifest\">");
  assert.ok(!m[1].startsWith("data:"), "el manifest no debe ir incrustado como data: URI");
});

test("el Emi de la pantalla de inicio está conectado al componente y ya no es decorativo", () => {
  assert.match(html, /EmiVivo\(document\.getElementById\("charStart"\)/);
  assert.doesNotMatch(html, /getElementById\("charStart"\)\.querySelectorAll\("\.hit"\)/);
});

test("los juegos con personaje están conectados a los gestos", () => {
  for (const nombre of ["gameVivo", "pkVivo", "bnVivo", "esVivo", "teacherVivo"]) {
    assert.match(html, new RegExp("const " + nombre + " = EmiVivo\\("), nombre);
  }
  assert.match(html, /function vehicleTapReaction\(/);
});

test("el dibujo de Emi trae pupilas móviles y párpados", () => {
  assert.match(html, /class="part-shape pupil"/);
  assert.match(html, /class="part-shape eye-lid"/);
});

test("los dibujos de Emi se crean bajo demanda, no todos al abrir la app", () => {
  const usos = html.match(/\.innerHTML = characterSVG\(\)/g) || [];
  assert.equal(usos.length, 1, "characterSVG() solo debe insertarse desde ensureEmi()");
  assert.match(html, /function ensureEmi\(svg\)/);
});

test("al volver al menú se cancelan las voces y esperas pendientes", () => {
  assert.match(html, /function showMenu\(\)\{\s*navToken\+\+;/);
  assert.match(html, /if\(nav === navToken\) after\(\);/);
});
