// Cinematic moonlit Hunter Valley vineyard. Vanilla three.js, procedural geometry only,
// lazy-loaded; the CSS fallback below is used when WebGL is unavailable or too slow.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface Props { onFail?: () => void; intensity?: 'full' | 'lite' }

function softSpriteTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,240,200,1)'); grad.addColorStop(0.35, 'rgba(255,215,130,0.8)'); grad.addColorStop(1, 'rgba(255,200,100,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}

export default function VineyardScene({ onFail, intensity = 'full' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' });
    } catch { onFail?.(); return; }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lite = intensity === 'lite' || Math.min(window.innerWidth, window.innerHeight) < 380;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, lite ? 1.25 : 1.6));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x2a1a24, 0.028);
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    camera.position.set(0, 2.4, 14);

    // Lights
    scene.add(new THREE.HemisphereLight(0xb9b4ff, 0x4a1a2a, 0.9));
    const moonLight = new THREE.DirectionalLight(0xdfe6ff, 1.2); moonLight.position.set(-12, 30, -40); scene.add(moonLight);
    const warm = new THREE.PointLight(0xf07842, 14, 40, 2); warm.position.set(9, 2.2, -14); scene.add(warm);
    const poolLight = new THREE.PointLight(0xe5ad48, 3.5, 16, 2); poolLight.position.set(0, 2.2, 4); scene.add(poolLight);

    // Sky gradient (big inverted sphere)
    const skyGeo = new THREE.SphereGeometry(200, 24, 12);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x120d16) }, mid: { value: new THREE.Color(0x3a1726) }, bot: { value: new THREE.Color(0x6a2238) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.6, h)) : mix(mid, bot, smoothstep(0.0, -0.25, h)); gl_FragColor = vec4(c, 1.0); }',
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    // Stars
    const starCount = lite ? 220 : 420;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) { const th = Math.random() * Math.PI * 2; const ph = Math.random() * Math.PI * 0.45; const r = 150; starPos[i * 3] = r * Math.sin(ph) * Math.cos(th); starPos[i * 3 + 1] = 20 + r * Math.cos(ph) * 0.6; starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th); }
    const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xfff4dc, size: 0.9, sizeAttenuation: true, transparent: true, opacity: 0.8, fog: false }));
    scene.add(stars);

    // Moon + halo
    const moon = new THREE.Mesh(new THREE.SphereGeometry(5, 32, 32), new THREE.MeshBasicMaterial({ color: 0xfff3d6, fog: false }));
    moon.position.set(-22, 30, -90); scene.add(moon);
    const haloTex = softSpriteTexture();
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xffe9bf, transparent: true, opacity: 0.55, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(34, 34, 1); halo.position.copy(moon.position); scene.add(halo);

    // Hills
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x2b1520, roughness: 1 });
    for (const [x, z, sx, sy] of [[-40, -80, 70, 14], [30, -95, 90, 18], [70, -70, 60, 10], [-85, -70, 70, 12]]) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), hillMat); h.scale.set(sx, sy, 30); h.position.set(x, -6, z); scene.add(h);
    }

    // Ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 1, 1), new THREE.MeshStandardMaterial({ color: 0x1d1218, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.2; scene.add(ground);

    // Vine rows (instanced): posts + leafy canopy + glowing grape clusters
    const rows = lite ? 7 : 9, perRow = lite ? 16 : 22;
    const postGeo = new THREE.BoxGeometry(0.12, 1.6, 0.12);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3326, roughness: 1 });
    const posts = new THREE.InstancedMesh(postGeo, postMat, rows * perRow);
    const leafGeo = new THREE.IcosahedronGeometry(0.75, 0);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3b4a2a, roughness: 0.95, emissive: 0x1a2a10, emissiveIntensity: 0.35, flatShading: true });
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, rows * perRow * 2);
    const grapeGeo = new THREE.SphereGeometry(0.16, 8, 8);
    const grapeMat = new THREE.MeshStandardMaterial({ color: 0xe5ad48, emissive: 0xe5ad48, emissiveIntensity: 1.6, roughness: 0.4 });
    const grapes = new THREE.InstancedMesh(grapeGeo, grapeMat, rows * perRow);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let pi = 0, li = 0, gi = 0;
    for (let r = 0; r < rows; r++) {
      const x0 = -((rows - 1) / 2) * 3.6 + r * 3.6 + (r % 2 ? 0.4 : -0.4);
      for (let i = 0; i < perRow; i++) {
        const z = 8 - i * 2.6 - Math.random() * 0.4;
        const x = x0 + Math.sin(i * 0.4 + r) * 0.25;
        p.set(x, 0.6, z); q.identity(); s.set(1, 1, 1); m.compose(p, q, s); posts.setMatrixAt(pi++, m);
        for (let k = 0; k < 2; k++) {
          p.set(x + (k ? 0.45 : -0.45), 1.15 + Math.random() * 0.25, z + (Math.random() - 0.5) * 0.6);
          q.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, 0)); const sc = 0.75 + Math.random() * 0.5; s.set(sc, sc * 0.8, sc);
          m.compose(p, q, s); leaves.setMatrixAt(li++, m);
        }
        p.set(x + (Math.random() - 0.5) * 0.6, 0.85 + Math.random() * 0.2, z + 0.3); q.identity(); const gs = Math.random() < 0.35 ? 1 : 0.0001; s.set(gs, gs, gs); m.compose(p, q, s); grapes.setMatrixAt(gi++, m);
      }
    }
    scene.add(posts, leaves, grapes);

    // Cellar building with warm windows
    const cellar = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(9, 4.5, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a2c, roughness: 1 }));
    walls.position.y = 2.25; cellar.add(walls);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(7, 3, 4), new THREE.MeshStandardMaterial({ color: 0x2a1c20, roughness: 1 }));
    roof.position.y = 6; roof.rotation.y = Math.PI / 4; cellar.add(roof);
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffb060 });
    for (const [x, y] of [[-2.6, 2.2], [0, 2.2], [2.6, 2.2], [-1.3, 1.1], [1.3, 1.1]]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), winMat); w.position.set(x, y, 3.01); cellar.add(w); }
    cellar.position.set(13, -0.2, -24); cellar.rotation.y = -0.35; scene.add(cellar);

    // Barrels in the foreground
    const barrelGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.5, 14);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.9 });
    for (const [x, z, rot] of [[-5.2, 4.5, 0.3], [-6.4, 5.4, -0.2], [5.8, 5, 0.5]]) { const b = new THREE.Mesh(barrelGeo, barrelMat); b.position.set(x, 0.55, z); b.rotation.z = Math.PI / 2; b.rotation.y = rot; scene.add(b); }

    // Floating gold particles
    const pCount = lite ? 110 : 260;
    const pPos = new Float32Array(pCount * 3), pSeed = new Float32Array(pCount);
    for (let i = 0; i < pCount; i++) { pPos[i * 3] = (Math.random() - 0.5) * 30; pPos[i * 3 + 1] = Math.random() * 7; pPos[i * 3 + 2] = 10 - Math.random() * 40; pSeed[i] = Math.random() * 100; }
    const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({ map: haloTex, color: 0xffd27a, size: 0.42, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const particles = new THREE.Points(pGeo, pMat); scene.add(particles);

    // Resize
    const resize = () => { const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);

    // Animate
    let raf = 0; let t0 = performance.now(); let frames = 0; let slowFrames = 0; let running = true;
    const tick = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - t0) / 1000); t0 = now; frames++;
      const t = now / 1000;
      camera.position.x = Math.sin(t * 0.11) * 1.4;
      camera.position.y = 2.3 + Math.sin(t * 0.17) * 0.25;
      camera.position.z = 14 - Math.min(5, t * 0.22);
      camera.lookAt(Math.sin(t * 0.07) * 1.5, 2.6, -30);
      const arr = pGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < pCount; i++) {
        arr[i * 3 + 1] += dt * (0.25 + (pSeed[i] % 1) * 0.3);
        arr[i * 3] += Math.sin(t * 0.6 + pSeed[i]) * dt * 0.35;
        if (arr[i * 3 + 1] > 7.5) arr[i * 3 + 1] = 0;
      }
      pGeo.attributes.position.needsUpdate = true;
      pMat.opacity = 0.7 + Math.sin(t * 1.3) * 0.2;
      grapeMat.emissiveIntensity = 1.3 + Math.sin(t * 2.1) * 0.5;
      warm.intensity = 13 + Math.sin(t * 5.3) * 1.5 + Math.sin(t * 13.1) * 0.6;
      renderer.render(scene, camera);
      if (dt > 0.07) slowFrames++;
      if (frames === 90 && slowFrames > 45) { onFail?.(); running = false; return; }
      raf = requestAnimationFrame(tick);
    };
    if (reduced) { renderer.render(scene, camera); } else raf = requestAnimationFrame(tick);
    const vis = () => { if (document.visibilityState === 'hidden') { running = false; cancelAnimationFrame(raf); } else if (!reduced && !running) { running = true; t0 = performance.now(); raf = requestAnimationFrame(tick); } };
    document.addEventListener('visibilitychange', vis);
    const lost = (e: Event) => { e.preventDefault(); onFail?.(); };
    renderer.domElement.addEventListener('webglcontextlost', lost);

    return () => {
      running = false; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', vis);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      scene.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.geometry) mesh.geometry.dispose(); const mat = mesh.material as THREE.Material | THREE.Material[] | undefined; if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose(); });
      haloTex.dispose(); renderer.dispose(); renderer.forceContextLoss(); // hand the GPU memory back straight away if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
    };
  }, [onFail, intensity]);
  return <div ref={ref} className="hero" aria-hidden="true" />;
}

/** CSS/SVG fallback with the same mood, used when WebGL is unavailable. */
export function VineyardFallback() {
  const stars = Array.from({ length: 40 }, (_, i) => ({ x: (i * 37) % 100, y: (i * 53) % 55, s: 1 + ((i * 7) % 3) * 0.6 }));
  const sparks = Array.from({ length: 18 }, (_, i) => ({ x: (i * 29) % 100, d: 3 + ((i * 13) % 5), delay: (i * 0.7) % 5 }));
  return (
    <div className="hero" aria-hidden="true" style={{ background: 'linear-gradient(180deg, #120d16 0%, #3a1726 45%, #6a2238 70%, #1d1218 72%, #1d1218 100%)' }}>
      {stars.map((s, i) => <i key={i} style={{ position: 'absolute', left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, borderRadius: '50%', background: '#fff4dc', opacity: 0.8 }} />)}
      <div style={{ position: 'absolute', left: '18%', top: '14%', width: 56, height: 56, borderRadius: '50%', background: '#fff3d6', boxShadow: '0 0 60px 30px rgba(255,233,191,.35)' }} />
      <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <path d="M0 200 Q80 170 160 196 T400 190 L400 300 L0 300 Z" fill="#2b1520" />
        <path d="M0 215 Q120 190 240 214 T400 206 L400 300 L0 300 Z" fill="#1d1218" />
        <rect x="290" y="178" width="60" height="34" fill="#3a2a2c" /><path d="M284 180 L320 150 L356 180 Z" fill="#2a1c20" />
        {[300, 316, 332].map((x) => <rect key={x} x={x} y="188" width="8" height="10" fill="#ffb060" />)}
        {Array.from({ length: 7 }).map((_, r) => <g key={r}>{Array.from({ length: 9 }).map((_, i) => { const y = 224 + r * 10 + (i % 2); const x = 20 + i * 44 + (r % 2) * 20; const sc = 0.6 + r * 0.12; return <g key={i} transform={`translate(${x} ${y}) scale(${sc})`}><rect x="-1" y="-14" width="2" height="14" fill="#4a3326" /><circle cx="0" cy="-14" r="7" fill="#3b4a2a" /><circle cx="3" cy="-8" r="2" fill="#e5ad48" opacity={i % 3 === 0 ? 1 : 0} /></g>; })}</g>)}
      </svg>
      <div className="sparkles">{sparks.map((s, i) => <i key={i} style={{ left: `${s.x}%`, bottom: '20%', ['--d' as any]: `${s.d}s`, ['--delay' as any]: `${s.delay}s` }} />)}</div>
    </div>
  );
}
