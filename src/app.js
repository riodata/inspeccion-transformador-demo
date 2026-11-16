import { Vec3 } from 'playcanvas';

const statusText = document.getElementById('statusText');
const overlay = document.getElementById('viewerOverlay');
const resetBtn = document.getElementById('resetBtn');
const metaBtn = document.getElementById('metaBtn');
const candidateBtn = document.getElementById('candidateBtn');
const openPhotoBtn = document.getElementById('openPhotoBtn');
const viewerWrap = document.getElementById('viewerWrap');
const metaStatus = document.getElementById('metaStatus');
const metaList = document.getElementById('metaList');
const candidateStatus = document.getElementById('candidateStatus');
const candidateGrid = document.getElementById('candidateGrid');
const pcAppElement = document.getElementById('pcApp');

const photoModal = document.getElementById('photoModal');
const photoBackdrop = document.getElementById('photoBackdrop');
const closePhotoBtn = document.getElementById('closePhotoBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomResetBtn = document.getElementById('zoomResetBtn');
const photoViewport = document.getElementById('photoViewport');
const photoImg = document.getElementById('photoImg');
const photoTitle = document.getElementById('photoTitle');
const photoMeta = document.getElementById('photoMeta');
const photoEmpty = document.getElementById('photoEmpty');

const ROTATE_X_180 = [
  [1, 0, 0],
  [0, -1, 0],
  [0, 0, -1]
];

const state = {
  metadataLoaded: false,
  cameras: [],
  images: [],
  candidates: [],
  selectedCandidate: null,
  photo: {
    scale: 1,
    x: 0,
    y: 0,
    dragging: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0
  }
};

function setStatus(text) {
  if (statusText) statusText.textContent = text;
}

function normalizeLines(text) {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function parseCameras(text) {
  const lines = normalizeLines(text).filter(line => !line.startsWith('#'));
  return lines.map(line => {
    const parts = line.split(/\s+/);
    return {
      id: parts[0],
      model: parts[1],
      width: Number(parts[2]),
      height: Number(parts[3])
    };
  }).filter(item => item.id && item.model);
}

function quatToRot(qw, qx, qy, qz) {
  return [
    [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)],
    [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)],
    [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)]
  ];
}

function transpose3(m) {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]]
  ];
}

function mulMatVec(m, v) {
  return {
    x: m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
    y: m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
    z: m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z
  };
}

function negate(v) {
  return { x: -v.x, y: -v.y, z: -v.z };
}

function length(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalize(v) {
  const len = length(v) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function applyViewerRotation(v) {
  return mulMatVec(ROTATE_X_180, v);
}

function parseImages(text) {
  const lines = normalizeLines(text).filter(line => !line.startsWith('#'));
  const images = [];

  for (let i = 0; i < lines.length; i += 2) {
    const line = lines[i];
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 10) continue;

    const qw = Number(parts[1]);
    const qx = Number(parts[2]);
    const qy = Number(parts[3]);
    const qz = Number(parts[4]);
    const tx = Number(parts[5]);
    const ty = Number(parts[6]);
    const tz = Number(parts[7]);

    const r = quatToRot(qw, qx, qy, qz);
    const rt = transpose3(r);
    const t = { x: tx, y: ty, z: tz };
    const centerColmap = mulMatVec(rt, negate(t));
    const forwardColmap = mulMatVec(rt, { x: 0, y: 0, z: 1 });

    images.push({
      id: parts[0],
      cameraId: parts[8],
      name: parts.slice(9).join(' '),
      center: applyViewerRotation(centerColmap),
      forward: normalize(applyViewerRotation(forwardColmap))
    });
  }

  return images;
}

function renderMeta(summary) {
  metaList.innerHTML = '';
  const items = [
    `Fotografías aéreas: ${summary.imageCount}`,
    `Posiciones de cámara reconstruidas: ${summary.cameraCount}`
  ];

  for (const text of items) {
    const li = document.createElement('li');
    li.textContent = text;
    metaList.appendChild(li);
  }
}

function sanitizePhotoName(name) {
  return (name || '').trim().replace(/^[\\/]+/, '');
}

function updatePhotoTransform() {
  photoImg.style.transform = `translate(${state.photo.x}px, ${state.photo.y}px) scale(${state.photo.scale})`;
}

function resetPhotoView() {
  state.photo.scale = 1;
  state.photo.x = 0;
  state.photo.y = 0;
  updatePhotoTransform();
}

function selectCandidateByIndex(index) {
  state.selectedCandidate = state.candidates[index] || null;
  const cards = candidateGrid.querySelectorAll('.candidate-item');
  cards.forEach((card, idx) => {
    card.classList.toggle('selected', idx === index);
  });
  openPhotoBtn.disabled = !state.selectedCandidate;
}

function renderCandidates(candidates) {
  candidateGrid.innerHTML = '';

  if (!candidates.length) {
    const empty = document.createElement('p');
    empty.className = 'candidate-empty';
    empty.textContent = 'No se encontraron fotografías para esta vista.';
    candidateGrid.appendChild(empty);
    openPhotoBtn.disabled = true;
    return;
  }

  candidates.forEach((candidate, index) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'candidate-item';
    item.innerHTML = `
      <strong>${candidate.name}</strong>
      <span>Coincidencia: ${(candidate.score*100).toFixed(0)} %</span>
          `;
    item.addEventListener('click', () => selectCandidateByIndex(index));
    candidateGrid.appendChild(item);
  });

  selectCandidateByIndex(0);
}

async function loadMetadata() {
  metaBtn.disabled = true;
  metaStatus.textContent = 'Cargando datos del relevamiento…';
  try {
    const [camerasResponse, imagesResponse] = await Promise.all([
      fetch('colmap/cameras.txt', { cache: 'no-store' }),
      fetch('colmap/images.txt', { cache: 'no-store' })
    ]);

    if (!camerasResponse.ok) throw new Error(`No se pudo leer cameras.txt (${camerasResponse.status})`);
    if (!imagesResponse.ok) throw new Error(`No se pudo leer images.txt (${imagesResponse.status})`);

    const [camerasText, imagesText] = await Promise.all([
      camerasResponse.text(),
      imagesResponse.text()
    ]);

    state.cameras = parseCameras(camerasText);
    state.images = parseImages(imagesText);
    state.metadataLoaded = true;
    candidateBtn.disabled = false;

    const firstCamera = state.cameras[0];
    renderMeta({
      cameraCount: state.cameras.length,
      imageCount: state.images.length,
      firstImageName: state.images[0]?.name,
      lastImageName: state.images[state.images.length - 1]?.name,
      firstCameraModel: firstCamera?.model,
      firstCameraSize: firstCamera ? `${firstCamera.width} × ${firstCamera.height}` : undefined
    });

    metaStatus.textContent = 'Datos del relevamiento disponibles.';
    candidateStatus.textContent = 'Metadata lista. Ahora podés buscar las 4 candidatas desde la vista actual.';
  } catch (error) {
    console.error(error);
    metaStatus.textContent = `No fue posible cargar los datos del relevamiento (${error.message}).`;
    candidateStatus.textContent = 'La búsqueda de fotografías no está disponible.';
  } finally {
    metaBtn.disabled = false;
  }
}

function getPlayCanvasApp() {
  return pcAppElement?.app || pcAppElement?._app || null;
}

function getCurrentView() {
  const app = getPlayCanvasApp();
  if (!app?.root) {
    throw new Error('No se pudo acceder al app de PlayCanvas.');
  }

  const cameraRig = app.root.findByName('cameraRig');
  if (!cameraRig) {
    throw new Error('No se encontró cameraRig en la escena.');
  }

  const pos = cameraRig.getPosition();
  const forward = cameraRig.forward || cameraRig.getForward?.();
  if (!forward) {
    throw new Error('No se pudo leer la dirección de cámara.');
  }

  return {
    position: { x: pos.x, y: pos.y, z: pos.z },
    forward: normalize({ x: forward.x, y: forward.y, z: forward.z })
  };
}

function findTopCandidates(view, count = 4) {
  const scored = state.images.map(image => {
    const delta = subtract(image.center, view.position);
    const distance = length(delta);
    const toImage = normalize(delta);
    const alignment = (dot(view.forward, image.forward) + 1) / 2;
    const proximity = 1 / (1 + distance);
    const facing = Math.max(0, dot(view.forward, toImage));
    const score = 0.55 * alignment + 0.30 * proximity + 0.15 * facing;

    return { ...image, distance, alignment, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count);
}

function selectCandidates() {
  if (!state.metadataLoaded) {
    candidateStatus.textContent = 'Los datos del relevamiento aún se están cargando.';
    return;
  }

  candidateBtn.disabled = true;
  try {
    const view = getCurrentView();
    state.candidates = findTopCandidates(view, 4);
    renderCandidates(state.candidates);
    candidateStatus.textContent = state.candidates.length
      ? `Se muestran las ${state.candidates.length} fotografías más próximas a la vista actual. Seleccione una para ampliarla.`
      : 'No se encontraron fotografías para esta vista.';
  } catch (error) {
    console.error(error);
    candidateStatus.textContent = `Error seleccionando candidatas: ${error.message}`;
  } finally {
    candidateBtn.disabled = false;
  }
}

function openPhotoModal() {
  const candidate = state.selectedCandidate;
  if (!candidate) {
    candidateStatus.textContent = 'Seleccione primero una fotografía.';
    return;
  }

  const safeName = sanitizePhotoName(candidate.name);
  const src = `photos/${safeName}`;
  photoTitle.textContent = safeName;
  photoMeta.textContent = `Coincidencia con la vista: ${(candidate.score*100).toFixed(0)} % · Rueda: zoom · Arrastre: desplazar`;
  photoEmpty.textContent = 'Cargando foto…';
  photoEmpty.classList.remove('hidden');
  photoImg.classList.remove('loaded');
  photoImg.removeAttribute('src');
  resetPhotoView();

  photoImg.onload = () => {
    photoEmpty.classList.add('hidden');
    photoImg.classList.add('loaded');
    resetPhotoView();
  };

  photoImg.onerror = () => {
    photoEmpty.textContent = `No se encontró la fotografía ${safeName}`;
    photoEmpty.classList.remove('hidden');
    photoImg.classList.remove('loaded');
  };

  photoImg.src = src;
  photoModal.classList.remove('hidden');
  photoModal.setAttribute('aria-hidden', 'false');
}

function closePhotoModal() {
  photoModal.classList.add('hidden');
  photoModal.setAttribute('aria-hidden', 'true');
  state.photo.dragging = false;
}

function zoomPhoto(delta, cx, cy) {
  const rect = photoViewport.getBoundingClientRect();
  const nextScale = Math.min(8, Math.max(1, state.photo.scale * delta));
  const localX = cx - rect.left - rect.width / 2;
  const localY = cy - rect.top - rect.height / 2;
  const ratio = nextScale / state.photo.scale;

  state.photo.x = localX - (localX - state.photo.x) * ratio;
  state.photo.y = localY - (localY - state.photo.y) * ratio;
  state.photo.scale = nextScale;
  updatePhotoTransform();
}

window.addEventListener('load', () => {
  setStatus('');
  window.setTimeout(() => {
    overlay.classList.add('hidden');
  }, 2500);
});

// Vista inicial: foco en el centro de la órbita de vuelo (intersección de ejes ópticos)
// y cámara elevada y retirada respecto de una de las posiciones del dron.
const VISTA_INICIAL = {
  focus: [0.428, 4.304, -0.489],
  position: [-3.08, 6.63, -4.75]
};

function aplicarVistaInicial(intentos = 0) {
  const app = getPlayCanvasApp();
  const rig = app?.root?.findByName('cameraRig');
  const controls = rig?.script?.cameraControls;
  if (!controls || typeof controls.reset !== 'function') {
    if (intentos < 100) window.setTimeout(() => aplicarVistaInicial(intentos + 1), 100);
    return;
  }
  controls.reset(new Vec3(...VISTA_INICIAL.focus), new Vec3(...VISTA_INICIAL.position));
}

// Utilidad interna: en la consola, vistaActual() devuelve la posición de la cámara
window.vistaActual = () => {
  const p = getPlayCanvasApp()?.root?.findByName('cameraRig')?.getPosition();
  return p ? [p.x, p.y, p.z].map(v => Number(v.toFixed(3))) : null;
};

resetBtn.addEventListener('click', () => aplicarVistaInicial());
aplicarVistaInicial();

metaBtn.addEventListener('click', loadMetadata);
candidateBtn.addEventListener('click', selectCandidates);
openPhotoBtn.addEventListener('click', openPhotoModal);
closePhotoBtn.addEventListener('click', closePhotoModal);
photoBackdrop.addEventListener('click', closePhotoModal);
zoomResetBtn.addEventListener('click', resetPhotoView);
zoomInBtn.addEventListener('click', () => {
  const rect = photoViewport.getBoundingClientRect();
  zoomPhoto(1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
});
zoomOutBtn.addEventListener('click', () => {
  const rect = photoViewport.getBoundingClientRect();
  zoomPhoto(1 / 1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
});

photoViewport.addEventListener('wheel', (event) => {
  if (photoModal.classList.contains('hidden')) return;
  event.preventDefault();
  const delta = event.deltaY < 0 ? 1.1 : 1 / 1.1;
  zoomPhoto(delta, event.clientX, event.clientY);
}, { passive: false });

photoViewport.addEventListener('pointerdown', (event) => {
  if (!photoImg.classList.contains('loaded')) return;
  state.photo.dragging = true;
  state.photo.startX = event.clientX;
  state.photo.startY = event.clientY;
  state.photo.originX = state.photo.x;
  state.photo.originY = state.photo.y;
  photoViewport.setPointerCapture(event.pointerId);
});

photoViewport.addEventListener('pointermove', (event) => {
  if (!state.photo.dragging) return;
  state.photo.x = state.photo.originX + (event.clientX - state.photo.startX);
  state.photo.y = state.photo.originY + (event.clientY - state.photo.startY);
  updatePhotoTransform();
});

function stopDrag(event) {
  if (event?.pointerId !== undefined && photoViewport.hasPointerCapture(event.pointerId)) {
    photoViewport.releasePointerCapture(event.pointerId);
  }
  state.photo.dragging = false;
}

photoViewport.addEventListener('pointerup', stopDrag);
photoViewport.addEventListener('pointercancel', stopDrag);
photoViewport.addEventListener('dblclick', resetPhotoView);

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'm') loadMetadata();
  if (key === 'c') selectCandidates();
  if (key === 'f') openPhotoModal();
  if (event.key === 'Escape') closePhotoModal();
});

window.addEventListener('error', (event) => {
  console.error(event.error || event.message || event);
  setStatus('Se produjo un error de carga.');
  overlay.classList.remove('hidden');
  const card = overlay.querySelector('.overlay-card p');
  if (card) {
    card.textContent = 'No fue posible cargar el modelo. Recargue la página o intente con otro navegador.';
  }
});

const observer = new MutationObserver(() => {
  const canvas = viewerWrap.querySelector('canvas');
  if (canvas) {
    setStatus('Modelo cargado.');
    overlay.classList.add('hidden');
    observer.disconnect();
  }
});
observer.observe(viewerWrap, { childList: true, subtree: true });

// Carga automática de la metadata de cámaras al iniciar
loadMetadata();
