"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

type Annotation = {
  id: number;
  text: string;
  position: { x: number; y: number };
};

type ViewerState = {
  loading: boolean;
  error: string | null;
};

export default function VisualizadorSTL() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<InstanceType<typeof OrbitControls> | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);

  // Raycaster e seleção
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const hoveredRef = useRef<THREE.Mesh | null>(null);

  const [state, setState] = useState<ViewerState>({ loading: false, error: null });
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeAnnotation, setActiveAnnotation] = useState<Annotation | null>(null);

  const setupThree = () => {
    const container = containerRef.current!;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#E8FAF6");

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
    camera.position.set(150, 120, 150);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Luzes
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(1, 1, 1);

    // Grid
    const grid = new THREE.GridHelper(400, 20, 0xffa500, 0xcccccc);
    (grid.material as THREE.Material).opacity = 0.4;
    (grid.material as THREE.Material).transparent = true;

    scene.add(ambient, dir, grid);

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
  };

  const animate = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!renderer || !scene || !camera || !controls) return;

    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    };
    loop();
  };

  const onResize = () => {
    const container = containerRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!container || !renderer || !camera) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  // Hover (muda cor)
  const onMouseMove = (event: MouseEvent) => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.current.setFromCamera(mouse.current, camera);
    const intersects = raycaster.current.intersectObjects(scene.children, true);

    if (hoveredRef.current) {
      (hoveredRef.current.material as THREE.MeshStandardMaterial).color.set("#cccccc");
      hoveredRef.current = null;
    }

    if (intersects.length > 0) {
      const first = intersects[0].object as THREE.Mesh;
      if (first && first.isMesh) {
        hoveredRef.current = first;
        (first.material as THREE.MeshStandardMaterial).color.set("#ff6666");
      }
    }
  };

  // Clique abre anotação
  const onClick = (event: MouseEvent) => {
    if (!hoveredRef.current || !rendererRef.current) return;

    const rect = rendererRef.current.domElement.getBoundingClientRect();
    const annotation: Annotation = {
      id: Date.now(),
      text: "",
      position: {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      },
    };

    setActiveAnnotation(annotation);
  };

  const clearCurrentMesh = () => {
    const scene = sceneRef.current;
    if (scene && meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      (meshRef.current.material as THREE.Material).dispose();
      meshRef.current = null;
    }
  };

  const fitCameraToObject = (object: THREE.Object3D) => {
    const camera = cameraRef.current!;
    const controls = controlsRef.current!;
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    controls.target.copy(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.0;
    camera.position.set(center.x + cameraZ, center.y + cameraZ * 0.8, center.z + cameraZ);
    camera.near = maxDim / 100;
    camera.far = maxDim * 100;
    camera.updateProjectionMatrix();
    controls.update();
  };

  const loadSTL = async (url: string) => {
    setState({ loading: true, error: null });
    try {
      const loader = new STLLoader();
      const geometry: THREE.BufferGeometry = await new Promise((resolve, reject) => {
        loader.load(url, (geom: THREE.BufferGeometry) => resolve(geom), undefined, reject);
      });

      clearCurrentMesh();

      const material = new THREE.MeshStandardMaterial({
        color: "#cccccc",
        roughness: 0.45,
        metalness: 0.05,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 200 / maxDim;
      mesh.scale.setScalar(scale);

      geometry.computeBoundingSphere();
      const center = geometry.boundingSphere!.center.clone().multiplyScalar(scale);
      mesh.position.sub(center);
      mesh.position.y += 100;

      sceneRef.current!.add(mesh);
      meshRef.current = mesh;

      fitCameraToObject(mesh);
      setState({ loading: false, error: null });
    } catch (e) {
      console.error(e);
      setState({ loading: false, error: "Falha ao carregar STL. Verifique o arquivo." });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".stl")) {
      setState({ loading: false, error: "Apenas arquivos .stl são suportados." });
      return;
    }
    const url = URL.createObjectURL(file);
    await loadSTL(url);
  };

  useEffect(() => {
    if (!containerRef.current) return;
    setupThree();
    animate();

    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("click", onClick);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("click", onClick);
      clearCurrentMesh();
      controlsRef.current?.dispose();
      rendererRef.current?.dispose();
    };
  }, []);

  return (
    <div className="flex min-h-screen w-full flex-col bg-gray-100">
      <header className="w-full border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-4">
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Visualizador STL
          </h1>
          <button
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-100"
            onClick={() => fileInputRef.current?.click()}
          >
            Selecionar arquivo
          </button>
          <input ref={fileInputRef} type="file" accept=".stl" hidden onChange={handleFileChange} />
        </div>
      </header>

      <main className="flex-1 relative">
        <div
          ref={containerRef}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (!file) return;
            if (!file.name.toLowerCase().endsWith(".stl")) {
              setState({ loading: false, error: "Apenas arquivos .stl são suportados." });
              return;
            }
            const url = URL.createObjectURL(file);
            loadSTL(url);
          }}
          className="relative mx-auto my-4 h-[72vh] max-w-6xl overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-white"
        />

        {activeAnnotation && (
          <div
            className="absolute bg-white dark:bg-gray-800 shadow-lg rounded p-2 border text-gray-800 dark:text-gray-200"
            style={{ top: activeAnnotation.position.y, left: activeAnnotation.position.x }}
          >
            <textarea
              className="border p-1 text-sm w-40 h-20 text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-700"
              placeholder="Digite sua anotação..."
              value={activeAnnotation.text}
              onChange={(e) =>
                setActiveAnnotation({ ...activeAnnotation, text: e.target.value })
              }
            />
            <div className="flex gap-2 mt-1">
              <button
                className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs"
                onClick={() => {
                  setAnnotations([...annotations, activeAnnotation]);
                  setActiveAnnotation(null);
                }}
              >
                Salvar
              </button>
              <button
                className="bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-2 py-1 rounded text-xs"
                onClick={() => setActiveAnnotation(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
