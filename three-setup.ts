// /app/seu-caminho/_actions/three-setup.ts
import * as THREE from "three";
import { WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Módulo Three.js: loaders compartilhados e utilitários.
 */

/* -------------------- Configuração Global -------------------- */
THREE.Cache.enabled = true;
const DRACO_DECODER_PATH = "/draco/";

/* Loader compartilhado (melhor performance de parsing) */
const sharedDracoLoader = new DRACOLoader();
sharedDracoLoader.setDecoderPath(DRACO_DECODER_PATH);

const sharedGLTFLoader = new GLTFLoader();
sharedGLTFLoader.setDRACOLoader(sharedDracoLoader);

/* Tipos exportados */
export type ThreeScene = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: InstanceType<typeof OrbitControls>;
  mesh?: THREE.Object3D | null;
};

export type InteractiveThreeScene = ThreeScene & {
  raycaster: THREE.Raycaster;
  mouse: THREE.Vector2;
  originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
};

export type LoadProgressCallback = (progress: {
  loaded: number;
  total: number;
  percent: number;
}) => void;

/* -------------------- Funções utilitárias -------------------- */

/**
 * Cria uma cena básica (renderer anexado ao container).
 * Observação: adiciona listener de resize na cena, mas o cleanup de resize deve
 * ser responsabilidade do chamador (ou removemos no cleanup do componente).
 */
export function setupScene(
  container: HTMLDivElement,
  options?: { pixelRatio?: number },
): ThreeScene {
  const width = Math.max(container.clientWidth, 16);
  const height = Math.max(container.clientHeight, 16);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(
    options?.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2),
  );
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  // compatibilidade com r127+ (use outputColorSpace)
  // se seu three for mais antigo, troque por renderer.outputEncoding = THREE.sRGBEncoding
  if ((renderer as WebGLRenderer).outputColorSpace !== undefined) {
    (renderer as WebGLRenderer).outputColorSpace = THREE.SRGBColorSpace;
  } else {
    (renderer as WebGLRenderer).outputColorSpace = THREE.SRGBColorSpace;
  }
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#1a1a1a");

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
  camera.position.set(200, 150, 200);

  const ambient = new THREE.AmbientLight(0xffffff, 1.0);
  scene.add(ambient);

  const dir1 = new THREE.DirectionalLight(0xffffff, 1.5);
  dir1.position.set(100, 200, 100);
  dir1.castShadow = true;
  dir1.shadow.mapSize.width = 1024;
  dir1.shadow.mapSize.height = 1024;
  scene.add(dir1);

  const dir2 = new THREE.DirectionalLight(0xffffff, 0.5);
  dir2.position.set(-100, 100, -100);
  scene.add(dir2);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = true;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.autoRotate = false;

  // Responsividade básica: listener retornado no objeto (o cleanup fica com o caller)
  const handleResize = () => {
    const w = Math.max(container.clientWidth, 16);
    const h = Math.max(container.clientHeight, 16);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener("resize", handleResize);

  // Guardamos a função pra permitir remoção pelo caller (se desejar)
  (
    renderer as unknown as { __contextCleanupMethod?: () => void }
  ).__contextCleanupMethod = handleResize;

  return { renderer, scene, camera, controls, mesh: null };
}

/**
 * Setup de interações (raycaster, mouse, map de materiais)
 */
export function setupInteraction(scene: ThreeScene): InteractiveThreeScene {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const originalMaterials = new Map<
    THREE.Mesh,
    THREE.Material | THREE.Material[]
  >();

  return { ...scene, raycaster, mouse, originalMaterials };
}

/**
 * Normaliza o tamanho/posição do modelo e aplica offset vertical (floatingY).
 */
export function normalizeModelSizeAndPosition(
  mesh: THREE.Object3D,
  floatingY = 4,
) {
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Proteção: se box inválida, não mexe na posição
  if (!isFinite(size.x) || !isFinite(size.y) || !isFinite(size.z)) return;

  mesh.position.sub(center);
  mesh.position.y = mesh.position.y + size.y / 2 + floatingY;
}

/**
 * Carrega GLB (DRACO) usando loader compartilhado com loadAsync para promessas.
 * Retorna o group carregado (gltf.scene).
 */
export async function loadGLB(
  url: string,
  onProgress?: LoadProgressCallback,
): Promise<THREE.Group> {
  try {
    // Se quiser usar progress, use load (com callback). Aqui preferimos a API async se disponível.
    const gltf: GLTF = await sharedGLTFLoader.loadAsync(url, (xhr) => {
      if (onProgress && xhr.total) {
        onProgress({
          loaded: xhr.loaded,
          total: xhr.total,
          percent: (xhr.loaded / xhr.total) * 100,
        });
      }
    });

    // Força marcas de sombra em meshes
    gltf.scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const m = child as THREE.Mesh;
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });

    return gltf.scene as THREE.Group;
  } catch (err) {
    // Repropaga o erro para o caller tratar/logar
    throw err;
  }
}

/**
 * Coleta e clona materiais originais para permitir reset posterior.
 */
export function collectOriginalMaterials(
  model: THREE.Object3D,
  originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>,
) {
  model.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (!mesh.material) return;
      const clone = Array.isArray(mesh.material)
        ? mesh.material.map((m) => m.clone())
        : (mesh.material as THREE.Material).clone();
      originalMaterials.set(mesh, clone);
    }
  });
}

/**
 * Reseta materiais para os originais armazenados.
 */
export function resetModelColor(
  originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>,
) {
  originalMaterials.forEach((originalMaterial, mesh) => {
    if (!mesh || !mesh.isMesh) return;
    mesh.material = Array.isArray(originalMaterial)
      ? originalMaterial.map((m) => (m as THREE.Material).clone())
      : (originalMaterial as THREE.Material).clone();
  });
}

/**
 * Extrai um nó da hierarquia (qualquer nível) pelo nome base (split por "-").
 * Retorna um clone do nó (com geometria/material clonados).
 */
export function extractPartByName(
  model: THREE.Object3D,
  partName: string,
): THREE.Object3D | null {
  let targetObject: THREE.Object3D | null = null;
  const cleanedTarget = partName.toLowerCase().trim();
  const cleanNodeName = (name: string) =>
    name.split("-")[0].toLowerCase().trim();

  model.traverse((child) => {
    if (!child.name) return;
    const childClean = cleanNodeName(child.name);
    if (childClean === cleanedTarget) {
      // Encontrou — clona profundamente
      targetObject = child.clone(true);
      // Ao clonar, as geometrias são referências — precisamos clonar geometria/material também
      targetObject.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          const mesh = c as THREE.Mesh;
          if (mesh.geometry) {
            mesh.geometry = (mesh.geometry as THREE.BufferGeometry).clone();
          }
          if (mesh.material) {
            mesh.material = Array.isArray(mesh.material)
              ? mesh.material.map((m) => (m as THREE.Material).clone())
              : (mesh.material as THREE.Material).clone();
          }
        }
      });
      return;
    }
  });

  if (targetObject) {
    normalizeModelSizeAndPosition(targetObject, 0);
  }

  return targetObject;
}

/**
 * Retorna os nomes "limpos" dos nós relevantes dentro do glTF.
 * Percorre toda a cena e agrupa por base do nome (split por "-").
 */
export async function getTopLevelNodes(url: string): Promise<string[]> {
  try {
    const gltf: GLTF = await sharedGLTFLoader.loadAsync(url);
    const nodesSet = new Set<string>();
    const model = gltf.scene;

    const clean = (name: string) => name.split("-")[0].trim().toLowerCase();

    model.traverse((child) => {
      if (!child.name) return;
      const c = clean(child.name);
      if (c && c !== "default" && c !== "scene") {
        nodesSet.add(c);
      }
    });

    if (nodesSet.size === 0 && model.name) {
      nodesSet.add(clean(model.name));
    }

    return Array.from(nodesSet);
  } catch (err) {
    console.error("getTopLevelNodes error:", err);
    return [];
  }
}

/**
 * Aplica material de destaque (cria clones para cada mesh).
 */
export function highlightPart(meshOrMeshes: THREE.Mesh | THREE.Mesh[]) {
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0xff8c00,
    emissive: 0xff8c00,
    emissiveIntensity: 0.15,
    roughness: 0.45,
    metalness: 0.05,
    transparent: true,
    opacity: 0.95,
  });

  const apply = (m: THREE.Mesh) => {
    m.material = baseMat.clone();
  };

  if (Array.isArray(meshOrMeshes)) {
    meshOrMeshes.forEach(apply);
  } else apply(meshOrMeshes);
}

/**
 * Raycast helper: calcula interseção com a malha raiz do modelo (true = recursivo).
 */
export function getIntersects(
  clientX: number,
  clientY: number,
  container: HTMLDivElement,
  scene: InteractiveThreeScene,
): THREE.Intersection | undefined {
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return undefined;

  scene.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  scene.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  scene.raycaster.setFromCamera(scene.mouse, scene.camera);
  if (!scene.mesh) return undefined;

  const intersects = scene.raycaster.intersectObject(scene.mesh, true);
  return intersects.length > 0 ? intersects[0] : undefined;
}

/**
 * Ajusta a câmera para o objeto (fit). Protegido contra bounding boxes nulas.
 */
export function fitCameraToObject(
  camera: THREE.PerspectiveCamera,
  controls: InstanceType<typeof OrbitControls>,
  object: THREE.Object3D,
) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const SAFE_DIM = 200;
  const effectiveDim = maxDim > 0.01 ? maxDim : SAFE_DIM;

  const fov = camera.fov * (Math.PI / 180);
  let cameraZ = Math.abs(effectiveDim / 2 / Math.tan(fov / 2));
  cameraZ *= 1.3;

  let originalPos = camera.position
    .clone()
    .sub(controls.target || new THREE.Vector3());
  if (originalPos.lengthSq() < 0.01) {
    originalPos = new THREE.Vector3(1, 0.6, 1);
  }
  originalPos.normalize().multiplyScalar(cameraZ * 1.5);

  camera.position.copy(center).add(originalPos);
  camera.lookAt(center);
  controls.target.copy(center);
  controls.update();
}

/**
 * Gera uma miniatura (base64 PNG) a partir de um Object3D.
 * Use com objetos clonados para evitar liberar o modelo principal.
 */
export async function renderThumbnailToDataURL(
  model: THREE.Object3D,
  width = 512,
  height = 512,
  backgroundColor = 0xf0f0f0,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  if ((renderer as WebGLRenderer).outputColorSpace !== undefined) {
    (renderer as WebGLRenderer).outputColorSpace = THREE.SRGBColorSpace;
  } else {
    (renderer as WebGLRenderer).outputColorSpace = THREE.SRGBColorSpace;
  }
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(backgroundColor);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);

  const ambient = new THREE.AmbientLight(0xffffff, 1.5);
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(200, 200, 200);
  scene.add(ambient, dir);

  // Adiciona o modelo (deve ser um clone limpo)
  scene.add(model);

  // Ajusta câmera
  fitCameraToObject(
    camera,
    { target: new THREE.Vector3(), update: () => {} } as InstanceType<
      typeof OrbitControls
    >,
    model,
  );

  renderer.render(scene, camera);

  const dataUrl = canvas.toDataURL("image/png");

  // Cleanup
  scene.remove(model);
  renderer.dispose();
  disposeObject(model);

  return dataUrl;
}

/**
 * Dispose profundo de um objeto e suas geometrias/materials.
 */
export function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) {
        (mesh.geometry as THREE.BufferGeometry).dispose();
      }
      if (mesh.material) {
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        materials.forEach((m) => {
          // dispose texturas se existirem
          for (const key in m) {
            const value = (m as unknown as { [k: string]: THREE.Texture })[key];
            if (value && value.isTexture) {
              (value as THREE.Texture).dispose();
            }
          }
          if ((m as unknown as { dispose: () => void }).dispose)
            (m as unknown as { dispose: () => void }).dispose();
        });
        // remove referência
        (mesh.material as unknown as THREE.Material[]) = [];
      }
    }
  });

  if (obj.parent) {
    obj.parent.remove(obj);
  }
}
