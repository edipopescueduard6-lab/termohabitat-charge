/* ============================================================
   Termohabitat Charge — scenă 3D (three.js r170)
   Mașina reală + animația de încărcare: cablu, particule de energie
   care curg spre priză, priza care pulsează, inele pe sol.
   API global: window.Car3D.mount(host, opts) → { update(state), destroy() }
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const MODELS = window.CAR3D_MODELS || {};
const cache = new Map();
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function loadModel(key) {
  const m = MODELS[key]; if (!m) return Promise.reject(new Error('model ' + key));
  if (!cache.has(key)) cache.set(key, new Promise((res, rej) => loader.load((window.ASSET_BASE || '') + m.url, g => res(g.scene), undefined, rej)));
  return cache.get(key).then(s => s.clone(true));
}
/* studio fără fișier HDR: cutie întunecată + benzi luminoase (reflexii lungi pe vopsea, ca în showroom) */
function studioEnv() {
  const sc = new THREE.Scene();
  sc.add(new THREE.Mesh(new THREE.BoxGeometry(24, 12, 24), new THREE.MeshBasicMaterial({ color: 0x3a403a, side: THREE.BackSide })));
  const strip = (w, h, pos, rot, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide })); m.position.set(...pos); m.rotation.set(...rot); sc.add(m); };
  strip(14, 1.4, [0, 5.8, 0], [Math.PI / 2, 0, 0], 7);
  strip(10, 0.7, [0, 5.8, 3.2], [Math.PI / 2, 0, 0], 4);
  strip(1.4, 7, [-11.8, 2.5, 0], [0, Math.PI / 2, 0], 3.2);
  strip(1.4, 7, [11.8, 2.5, 0], [0, -Math.PI / 2, 0], 3.2);
  strip(24, 0.5, [0, 1, -11.8], [0, 0, 0], 2.2);
  strip(24, 0.5, [0, 1, 11.8], [0, Math.PI, 0], 1.6);
  return sc;
}
function radialTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const PHASE_COLOR = { preparing: 0xF2A93B, charging: 0x8BE04E, tapering: 0x72BF44, done: 0x5B93FF, idle: 0x72BF44 };

function mount(host, opts = {}) {
  const cfg = MODELS[opts.model] || MODELS.suv;
  if (!cfg) { host.classList.add('failed'); if (opts.onError) setTimeout(() => opts.onError(new Error('fără model')), 0); return { update() {}, destroy() {} }; }
  const W = () => host.clientWidth || 360, H = () => host.clientHeight || 280;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: opts.mode === 'thumb' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(W(), H());
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioEnv(), 0.035).texture;
  const camera = new THREE.PerspectiveCamera(opts.mode === 'thumb' ? 26 : 30, W() / H(), 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445544, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 6, 4); scene.add(key);

  /* umbră de contact „coaptă” (fără shadow map: ieftin pe iPhone) */
  const shadowTex = radialTexture([[0, 'rgba(0,0,0,0.55)'], [0.55, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.005; scene.add(shadow);

  const root = new THREE.Group(); scene.add(root);
  const fx = new THREE.Group(); scene.add(fx);
  let car = null, size = new THREE.Vector3(4.6, 1.6, 1.9), port = new THREE.Vector3(), charger = null, curve = null;
  let state = { kw: 0, soc: 50, phase: opts.mode === 'charging' ? 'charging' : 'idle' };
  const glowTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.65)'], [1, 'rgba(255,255,255,0)']]);

  /* particule și efecte */
  const N = 70, pos = new Float32Array(N * 3), seed = Float32Array.from({ length: N }, () => Math.random());
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pMat = new THREE.PointsMaterial({ size: 0.11, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: PHASE_COLOR.charging, sizeAttenuation: true });
  const particles = new THREE.Points(pGeo, pMat); particles.frustumCulled = false;
  const portGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PHASE_COLOR.charging, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const rings = [0, 1, 2].map(() => { const r = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 96), new THREE.MeshBasicMaterial({ color: PHASE_COLOR.charging, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); r.rotation.x = -Math.PI / 2; r.position.y = 0.01; fx.add(r); return r; });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, color: PHASE_COLOR.charging, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.008; fx.add(floor);

  function buildCharger() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.55, 0.3), new THREE.MeshStandardMaterial({ color: 0xF4F6F2, roughness: 0.35, metalness: 0.05 }));
    body.position.y = 0.775; g.add(body);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.32), new THREE.MeshStandardMaterial({ color: 0x231F20, roughness: 0.5 })); cap.position.y = 1.56; g.add(cap);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.22), new THREE.MeshBasicMaterial({ color: 0x72BF44 })); screen.position.set(0, 1.18, 0.151); g.add(screen);
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 1.1), new THREE.MeshBasicMaterial({ color: 0x72BF44 })); stripe.position.set(0.16, 0.62, 0.151); g.add(stripe);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.38), new THREE.MeshStandardMaterial({ color: 0x9AA39A, roughness: 0.8 })); base.position.y = 0.025; g.add(base);
    g.userData.screen = screen; return g;
  }
  let cable = null;
  function layout() {
    /* orientare canonică: fața spre +z, stânga spre +x; priza din configurație (fracții din cutia vehiculului) */
    const p = cfg.port || [0.5, 0.55, -0.38];
    port.set(p[0] * size.x, p[1] * size.y, p[2] * size.z);
    shadow.scale.set(full.x * 1.9, full.z * 1.18, 1); shadow.position.set(mid.x, 0.005, mid.z);
    floor.scale.set(size.x * 1.7, size.z * 1.2, 1);
    rings.forEach(r => r.scale.setScalar(size.z * 0.55));
    if (opts.mode !== 'charging') return;
    if (!charger) { charger = buildCharger(); scene.add(charger); fx.add(particles); fx.add(portGlow); }
    const side = Math.sign(p[0]) || 1;
    let a;
    if (Math.abs(p[2]) > 0.45) {
      /* priză în bot (Dacia Spring) sau în spate: stâlpul stă în fața mașinii, ușor în lateral, ca să nu acopere caroseria */
      const end = Math.sign(p[2]);
      charger.position.set(port.x - 0.35, 0, port.z + end * 1.15);
      charger.rotation.y = end > 0 ? Math.PI : 0;
      a = new THREE.Vector3(charger.position.x + 0.12, 1.02, charger.position.z - end * 0.16);
      curve = new THREE.CatmullRomCurve3([a, new THREE.Vector3(a.x + 0.12, 0.42, a.z - end * 0.25), new THREE.Vector3(port.x, 0.26, port.z + end * 0.4), port.clone()]);
    } else {
      charger.position.set(port.x + side * 1.15, 0, port.z - 0.35);
      charger.rotation.y = side > 0 ? Math.PI * 0.25 : -Math.PI * 0.25;
      a = new THREE.Vector3(charger.position.x - side * 0.12, 1.02, charger.position.z + 0.1);
      curve = new THREE.CatmullRomCurve3([a, new THREE.Vector3(a.x - side * 0.2, 0.4, a.z + 0.1), new THREE.Vector3(port.x + side * 0.38, 0.26, port.z + 0.05), port.clone()]);
    }
    if (cable) { fx.remove(cable); cable.geometry.dispose(); }
    cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.03, 10, false), new THREE.MeshStandardMaterial({ color: 0x1A1D1A, roughness: 0.5, metalness: 0.1 }));
    fx.add(cable);
    portGlow.position.copy(port); portGlow.scale.setScalar(0.5);
  }
  function frameCamera() {
    /* la încărcare, camera stă pe cabină (remorca iese din cadru); altfel încadrează tot vehiculul */
    const fs = opts.mode === 'charging' ? size : full, L = Math.max(fs.x, fs.z) * (opts.mode === 'charging' || fs === size ? 1 : 0.86);
    const d = L * (opts.mode === 'thumb' ? 1.62 : opts.mode === 'charging' ? 2.15 : 1.9);
    camera.userData.dist = d;
    const endP = Math.abs((cfg.port || [0, 0, 0])[2]) > 0.45;
    camera.userData.target = new THREE.Vector3(opts.mode === 'charging' && !endP ? size.x * 0.3 * (Math.sign((cfg.port || [0.5])[0]) || 1) : 0, size.y * 0.4, opts.mode === 'charging' ? (endP ? size.z * 0.28 : -size.z * 0.12) : 0);
  }
  /* pregătește un model: scoate decorul, alege caroseria din pachet, sticlă și vopsea, scară reală, orientare canonică */
  function prep(obj, c) {
    /* GLTFLoader curăță numele: fără „. : / [ ]”, spațiile devin „_” */
    const byName = n => obj.getObjectByName(n) || obj.getObjectByName(n.replace(/[\[\]\.:\/]/g, '').replace(/\s+/g, '_'));
    (c.hide || []).forEach(n => { const o = byName(n); if (o) o.removeFromParent(); });
    if (c.pick) {
      /* GLTFLoader înlocuiește spațiile din nume cu „_” */
      const body = obj.getObjectByName(c.pick) || obj.getObjectByName(c.pick.replace(/\s+/g, '_'));
      if (body) {
        obj.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(body).expandByScalar(0.02 * new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3()).length());
        const holder = body.parent, keep = new Set([body]);
        holder.children.forEach(ch => { if (ch === body) return; const cc = new THREE.Box3().setFromObject(ch).getCenter(new THREE.Vector3()); if (/wheel/i.test(ch.name) && bb.containsPoint(cc)) keep.add(ch); });
        [...holder.children].forEach(ch => { if (!keep.has(ch)) holder.remove(ch); });
      }
    }
    obj.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = true;
      /* plăcuțe de înmatriculare și alte materiale de ascuns (după numele materialului) */
      if (c.hideMats && (Array.isArray(o.material) ? o.material : [o.material]).some(m => m && c.hideMats.includes(m.name))) { o.visible = false; return; }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m, i) => {
        if (!m) return;
        if (m.envMapIntensity != null) m.envMapIntensity = c.env || 1.15;
        /* suprafețe fără grafica autorului (ex. prelata remorcii): albe, curate */
        if (c.plainMats && c.plainMats.includes(m.name)) { m.map = null; m.color.set(0xF3F5F2); m.roughness = 0.42; m.metalness = 0.05; m.needsUpdate = true; }
        /* sticlă: transparentă, fumurie, cu reflexii */
        if (c.glassMats && c.glassMats.some(k => (m.name || '').toLowerCase().includes(k))) {
          const gm = new THREE.MeshPhysicalMaterial({ color: 0x0c1014, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.55, envMapIntensity: 1.6, clearcoat: 1, side: m.side });
          if (Array.isArray(o.material)) o.material[i] = gm; else o.material = gm; return;
        }
        /* vopsea personalizată pe materialele caroseriei */
        if (c.paint && c.paintMats && c.paintMats.some(k => (m.name || '').toLowerCase().includes(k))) {
          /* păstrăm fața dublă a modelelor din SketchUp (normale inversate), altfel apar găuri în caroserie */
          const pm = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(c.paint), map: c.keepMap ? m.map : null, normalMap: m.normalMap || null, metalness: c.metal ?? 0.55, roughness: c.rough ?? 0.3, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.3, side: m.side });
          if (Array.isArray(o.material)) o.material[i] = pm; else o.material = pm;
        }
      });
    });
    const box = new THREE.Box3().setFromObject(obj), s = new THREE.Vector3(); box.getSize(s);
    obj.scale.setScalar((c.length || 4.7) / Math.max(s.x, s.z));
    obj.rotation.y = c.rotY || 0;
    return obj;
  }
  const at = cfg.attach && MODELS[cfg.attach.model];
  let full = size.clone(), mid = new THREE.Vector3();
  Promise.all([loadModel(opts.model || 'suv'), at ? loadModel(cfg.attach.model) : null]).then(([obj, tobj]) => {
    car = prep(obj, cfg);
    const b2 = new THREE.Box3().setFromObject(car), c2 = new THREE.Vector3(); b2.getCenter(c2); b2.getSize(size);
    car.position.set(-c2.x, -b2.min.y, -c2.z);
    root.add(car);
    full.copy(size); mid.set(0, 0, 0);
    /* ansamblu (cap tractor + semiremorcă): remorca se prinde în spatele cabinei, la „front” metri de bara din față */
    if (tobj) {
      const tr = prep(tobj, at), tb = new THREE.Box3().setFromObject(tr), tc = new THREE.Vector3(); tb.getCenter(tc);
      tr.position.set(-tc.x, -tb.min.y + (cfg.attach.y || 0), size.z / 2 - cfg.attach.front - tb.max.z);
      root.add(tr);
      const all = new THREE.Box3().setFromObject(root); all.getSize(full); all.getCenter(mid); mid.y = 0;
      /* în vitrină și în miniatură arătăm tot ansamblul, centrat */
      if (opts.mode !== 'charging') { root.position.set(-mid.x, 0, -mid.z); mid.set(0, 0, 0); }
    }
    layout(); frameCamera(); host.classList.add('ready');
    if (opts.onReady) opts.onReady();
  }).catch(err => { host.classList.add('failed'); if (opts.onError) opts.onError(err); });

  /* rotire cu degetul */
  /* priza pe dreapta (BYD, BMW): camera trece pe partea prizei, ca să se vadă cablul */
  const portSide = Math.sign((cfg.port || [0.5])[0]) || 1, endPort = Math.abs((cfg.port || [0, 0, 0])[2]) > 0.45;
  /* priza în bot: vedere mai laterală, stâlpul apare în dreapta botului */
  let yaw = cfg.yaw != null ? cfg.yaw : (opts.mode === 'charging' ? (endPort ? 1.2 : 0.72 * portSide) : 0.62), pitch = 0.2, dragging = false, lx = 0, vel = 0, lastInput = 0;
  const el = renderer.domElement; el.style.touchAction = 'pan-y';
  el.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; lastInput = performance.now(); el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => { if (!dragging) return; const dx = e.clientX - lx; lx = e.clientX; yaw -= dx * 0.008; vel = -dx * 0.008; lastInput = performance.now(); });
  const up = () => { dragging = false; }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);

  const clock = new THREE.Clock(); let raf = 0, alive = true, visible = true, phaseCol = new THREE.Color(PHASE_COLOR.charging);
  const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }); io.observe(host);
  const onResize = () => { renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(onResize); ro.observe(host);
  const v3 = new THREE.Vector3();
  function tick() {
    if (!alive) return;
    raf = requestAnimationFrame(tick);
    if ((!visible && opts.mode !== 'thumb') || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    /* camera: inerție după glisare, apoi o legănare lentă sau turnantă */
    if (!dragging) { yaw += vel; vel *= 0.92; if (!reduced && performance.now() - lastInput > 2500) yaw += (opts.mode === 'showcase' ? 0.12 : 0.0) * dt; }
    const d = camera.userData.dist || 8, tg = camera.userData.target || v3.set(0, 0.6, 0);
    const sway = opts.mode === 'charging' && !reduced ? Math.sin(t * 0.25) * 0.06 : 0;
    camera.position.set(tg.x + Math.sin(yaw + sway) * d * Math.cos(pitch), tg.y + d * Math.sin(pitch), tg.z + Math.cos(yaw + sway) * d * Math.cos(pitch));
    camera.lookAt(tg);
    /* efecte de încărcare */
    const ph = state.phase, active = ph === 'charging' || ph === 'tapering' || ph === 'preparing';
    phaseCol.lerp(new THREE.Color(PHASE_COLOR[ph] || PHASE_COLOR.charging), 0.08);
    pMat.color.copy(phaseCol); portGlow.material.color.copy(phaseCol); floor.material.color.copy(phaseCol); rings.forEach(r => r.material.color.copy(phaseCol));
    if (curve && opts.mode === 'charging') {
      const speed = ph === 'preparing' ? 0.12 : 0.18 + Math.min(1, state.kw / 250) * 0.75;
      for (let i = 0; i < N; i++) {
        seed[i] = (seed[i] + (reduced ? 0 : dt * speed)) % 1;
        curve.getPointAt(seed[i], v3);
        const jitter = 0.018; pos[i * 3] = v3.x + Math.sin(i * 12.9 + t * 3) * jitter; pos[i * 3 + 1] = v3.y + Math.cos(i * 7.3 + t * 2.6) * jitter; pos[i * 3 + 2] = v3.z;
      }
      pGeo.attributes.position.needsUpdate = true;
      particles.visible = active;
      pMat.size = 0.085 + Math.min(1, state.kw / 250) * 0.05;
      const pulse = ph === 'done' ? 0.55 + Math.sin(t * 1.2) * 0.05 : 0.6 + Math.sin(t * (ph === 'preparing' ? 3 : 6)) * 0.18;
      portGlow.scale.setScalar(reduced ? 0.6 : pulse); portGlow.material.opacity = active ? 0.95 : 0.7;
      if (charger) charger.userData.screen.material.color.copy(phaseCol);
    }
    const level = opts.mode === 'charging' ? (active ? 0.25 + Math.min(1, state.kw / 250) * 0.35 : 0.12) : 0;
    floor.material.opacity += (level - floor.material.opacity) * 0.06;
    rings.forEach((r, i) => {
      if (opts.mode !== 'charging' || !active || reduced) { r.material.opacity *= 0.9; return; }
      const k = ((t * 0.55 + i / 3) % 1);
      r.scale.setScalar(size.x * (0.45 + k * 0.75)); r.material.opacity = (1 - k) * 0.35;
    });
    renderer.render(scene, camera);
  }
  tick();
  return {
    update(s) { Object.assign(state, s); },
    destroy() { alive = false; cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); renderer.dispose(); pmrem.dispose(); renderer.forceContextLoss?.(); el.remove(); },
  };
}
/* randare statică pentru miniaturi (listă de vehicule), întoarce un dataURL */
async function snapshot(model, w = 480, h = 300) {
  const host = document.createElement('div'); host.style.cssText = `position:fixed;left:-9999px;top:0;width:${w}px;height:${h}px`;
  document.body.appendChild(host);
  return new Promise(res => {
    const hd = mount(host, { model, mode: 'thumb', onReady: () => setTimeout(() => { const url = host.querySelector('canvas').toDataURL('image/png'); hd.destroy(); host.remove(); res(url); }, 120) , onError: () => { hd.destroy(); host.remove(); res(null); } });
  });
}
window.Car3D = { mount, snapshot, models: MODELS };
window.dispatchEvent(new Event('car3d-ready'));
