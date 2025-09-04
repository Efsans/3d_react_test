"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

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

  const [state, setState] = useState<ViewerState>({ loading: false, error: null });

  // --- helpers ---------------------------------------------------------------

  const setupThree = () => {
    const container = containerRef.current!;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f3f4f6"); // bg- gray-100

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
    camera.position.set(150, 120, 150);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Luzes suaves
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(1, 1, 1);

    // Um grid discreto para orientação
    const grid = new THREE.GridHelper(400, 20, 0xcccccc, 0xeeeeee);
    (grid.material as THREE.Material).opacity = 0.4;
    (grid.material as THREE.Material).transparent = true;

    scene.add(ambient, dir, grid);

    container.innerHTML = ""; // limpa antes de anexar
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

    // centraliza
    controls.target.copy(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs((maxDim / 2) / Math.tan(fov / 2));
    cameraZ *= 1.5; // margem
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
        loader.load(
          url,
          (geom: THREE.BufferGeometry) => resolve(geom),
          undefined,
          (err: unknown) => reject(err)
        );
      });

      // limpa mesh anterior
      clearCurrentMesh();

      // material elegante
      const material = new THREE.MeshStandardMaterial({
        color: "#B92C2C", // vermelho suave
        roughness: 0.45,
        metalness: 0.05,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // normaliza/centraliza a peça
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 200 / maxDim; // ajusta para caber no grid
      mesh.scale.setScalar(scale);

      geometry.computeBoundingSphere();
      const center = geometry.boundingSphere!.center.clone().multiplyScalar(scale);
      mesh.position.sub(center);

      sceneRef.current!.add(mesh);
      meshRef.current = mesh;

      fitCameraToObject(mesh);
      setState({ loading: false, error: null });
    } catch (e: null | unknown) {
      console.error(e);
      setState({ loading: false, error: "Falha ao carregar STL. Verifique o arquivo." });
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".stl")) {
      setState({ loading: false, error: "Apenas arquivos .stl são suportados." });
      return;
    }
    const url = URL.createObjectURL(file);
    await loadSTL(url);
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

  // --- lifecycle -------------------------------------------------------------

  useEffect(() => {
    if (!containerRef.current) return;

    setupThree();
    animate();
    window.addEventListener("resize", onResize);

    // opcional: carrega um STL inicial por URL (comente se não quiser)
    // loadSTL("/models/exemplo.stl").catch(() => {});

    return () => {
      window.removeEventListener("resize", onResize);
      clearCurrentMesh();
      controlsRef.current?.dispose();
      rendererRef.current?.dispose();
      // remove canvas
      if (containerRef.current && rendererRef.current) {
        const el = rendererRef.current.domElement;
        if (el && el.parentElement === containerRef.current) {
          containerRef.current.removeChild(el);
        }
      }
    };
     
  }, []);

  // --- UI --------------------------------------------------------------------

  return (
    <div className="min-h-screen w-full flex flex-col bg-gray-100">
      <header className="w-full border-b bg-white">
        <div className="max-w-6xl mx-auto flex items-center justify-between p-4">
          <div>
            <h1 className="text-lg font-semibold">Visualizador STL</h1>
            <p className="text-sm text-gray-500">
              Arraste um arquivo .stl para a área ou clique em “Selecionar arquivo”.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white shadow-sm text-sm hover:bg-gray-50"
              onClick={() => fileInputRef.current?.click()}
            >
              Selecionar arquivo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".stl"
              hidden
              onChange={handleFileChange}
            />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div
          ref={containerRef}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="relative max-w-6xl mx-auto my-4 h-[72vh] rounded-xl border-2 border-dashed border-gray-300 bg-white overflow-hidden"
        >
          {/* Overlay de instruções */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {!meshRef.current && !state.loading && (
              <div className="text-center text-gray-500">
                <p className="font-medium">Solte um arquivo .stl aqui</p>
                <p className="text-xs">ou use o botão “Selecionar arquivo”.</p>
              </div>
            )}
          </div>

          {/* Estado de loading / erro */}
          {state.loading && (
            <div className="absolute top-3 left-3 rounded-md bg-white/90 px-3 py-1.5 text-sm shadow">
              Carregando modelo...
            </div>
          )}
          {state.error && (
            <div className="absolute top-3 left-3 rounded-md bg-red-50 text-red-700 px-3 py-1.5 text-sm shadow">
              {state.error}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
