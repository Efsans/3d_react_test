// /app/seu-caminho/components/common/view-3d.tsx

"use client";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as THREE from "three";

import {
  collectOriginalMaterials,
  disposeObject,
  extractPartByName,
  fitCameraToObject,
  getIntersects,
  highlightPart,
  InteractiveThreeScene,
  loadGLB,
  normalizeModelSizeAndPosition,
  resetModelColor,
  setupInteraction,
  setupScene,
  ThreeScene,
} from "@/actions/solid-works/three-setup/three-setup";

export type View3DRef = {
  isModelLoaded: () => boolean;
  getSelectedPartName: () => string | null;
  highlightPartByName: (partName: string | null) => void;
};

interface View3DProps {
  modelUrl: string;
  className?: string;
  onModelLoaded?: (model: THREE.Group) => void;
  onModelError?: (error: Error) => void;
  onPartSelected?: (partName: string | null) => void;
  thumbnailMode?: boolean;
  selectedPartName?: string | null;
  isolatedPart?: THREE.Object3D | null;
  // tamanho desejado para thumbnail (opcional)
  thumbnailSize?: number;
}

export const View3D = forwardRef<View3DRef, View3DProps>(
  (
    {
      modelUrl,
      className,
      onModelLoaded,
      onModelError,
      onPartSelected,
      thumbnailMode = false,
      selectedPartName = null,
      isolatedPart = null,
      thumbnailSize = 512,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const sceneRef = useRef<InteractiveThreeScene | null>(null);
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [loadProgress, setLoadProgress] = useState(0);
    const [currentSelectedPart, setCurrentSelectedPart] = useState<string | null>(
      null,
    );
    const [isLoadingPart, setIsLoadingPart] = useState(true);

    // Helper: encontra nó pela "base" do nome (split("-")[0])
    const findNodeByBaseName = useCallback(
      (root: THREE.Object3D, baseName: string): THREE.Object3D | null => {
        let found: THREE.Object3D | null = null;
        const targetBase = baseName.toLowerCase();
        root.traverse((child) => {
          if (!found && child.name) {
            const childBase = child.name.split("-")[0].toLowerCase();
            if (childBase === targetBase) found = child;
          }
        });
        return found;
      },
      [],
    );

    // --- Setup inicial da cena (uma vez por modelUrl / isolatedPart) ---
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const scene = setupScene(container, {
        pixelRatio: thumbnailMode ? 1 : undefined,
      });

      // acessível e interativo
      const canvas = scene.renderer.domElement as HTMLCanvasElement;
      canvas.style.pointerEvents = "auto";
      canvas.style.touchAction = "none";
      canvas.style.cursor = "grab";
      canvas.tabIndex = 0;
      canvas.style.width = "100%";
      canvas.style.height = "100%";

      const interactive = setupInteraction(scene);
      sceneRef.current = interactive;

      // cursor visual ao pressionar/soltar
      const onPointerDown = () => {
        canvas.style.cursor = "grabbing";
      };
      const onPointerUp = () => {
        canvas.style.cursor = "grab";
      };
      canvas.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointerup", onPointerUp);

      // Desabilita controles em thumbnailMode (grava somente visual)
      interactive.controls.enabled = !thumbnailMode;

      // Ajusta background dependendo do modo thumbnail (mais claro)
      if (thumbnailMode) {
        interactive.scene.background = new THREE.Color(0xf0f0f0);
      }

      // Flag para referência única do objeto adicionado
      let addedObject: THREE.Object3D | null = null;

      let rafId: number | null = null;
      const animate = () => {
        try {
          interactive.controls.update();
          interactive.renderer.render(interactive.scene, interactive.camera);
        } catch (e) {
          // defensivo: se algo falhar no render, não quebra loop
          // console.warn("Render loop error:", e);
        }
        rafId = requestAnimationFrame(animate);
      };

      rafId = requestAnimationFrame(animate);

      canvas.addEventListener("mousedown", () => {
        try {
          (canvas as HTMLCanvasElement).focus();
        } catch {}
      });

      const handleResize = () => {
        const w = Math.max(container.clientWidth, 16);
        const h = Math.max(container.clientHeight, 16);
        interactive.camera.aspect = w / h;
        interactive.camera.updateProjectionMatrix();
        interactive.renderer.setSize(w, h);
      };

      window.addEventListener("resize", handleResize);
      // fire initial
      handleResize();

      // Carrega o modelo (com progress)
      const load = async () => {
        setIsLoadingPart(true);
        setLoadProgress(0);
        try {
          let objToAdd: THREE.Object3D | null = null;

          if (isolatedPart) {
            // isolado já foi preparado pelo caller (VisualizadorModal)
            objToAdd = isolatedPart;
            // normalize position/size to fit viewer
            normalizeModelSizeAndPosition(objToAdd);
            collectOriginalMaterials(objToAdd, interactive.originalMaterials);
            setIsModelLoaded(true);
            onModelLoaded?.(objToAdd as unknown as THREE.Group);
          } else {
            // Carrega GLB com callback de progresso
            const gltfGroup = await loadGLB(modelUrl, (p) => {
              setLoadProgress(Math.round(p.percent));
            });

            normalizeModelSizeAndPosition(gltfGroup);
            collectOriginalMaterials(gltfGroup, interactive.originalMaterials);
            objToAdd = gltfGroup;
            onModelLoaded?.(gltfGroup);
            setIsModelLoaded(true);
          }

          if (objToAdd) {
            // Se já existe um adicionado, remova e dispose
            if (addedObject) {
              try {
                resetModelColor(interactive.originalMaterials);
                interactive.scene.remove(addedObject);
                disposeObject(addedObject);
              } catch (e) {
                // ignore
              }
              addedObject = null;
            }

            interactive.scene.add(objToAdd);
            interactive.mesh = objToAdd;
            addedObject = objToAdd;

            // Se foi passado isolatedPart, aplicamos highlight automaticamente
            if (isolatedPart) {
              try {
                // coleta materiais (reafirma)
                collectOriginalMaterials(objToAdd, interactive.originalMaterials);
                const meshesToHighlight: THREE.Mesh[] = [];
                objToAdd.traverse((c) => {
                  if ((c as THREE.Mesh).isMesh) meshesToHighlight.push(c as THREE.Mesh);
                });
                if (meshesToHighlight.length > 0) {
                  highlightPart(meshesToHighlight);
                }
              } catch (e) {
                // não falha a renderização por causa do highlight
                // console.warn("Falha ao destacar peça isolada:", e);
              }
            }

            // Ajusta câmera para enquadrar objeto
            fitCameraToObject(interactive.camera, interactive.controls, objToAdd);
            // garante render inicial atual
            interactive.renderer.render(interactive.scene, interactive.camera);
          }
        } catch (err) {
          console.error("Erro carregando modelo:", err);
          onModelError?.(err as Error);
        } finally {
          setIsLoadingPart(false);
        }
      };

      // Inicia carga
      load();

      // Cleanup quando desmontar ou mudar props dependencia
      return () => {
        if (rafId) cancelAnimationFrame(rafId);

        window.removeEventListener("resize", handleResize);
        try {
          canvas.removeEventListener("pointerdown", onPointerDown);
        } catch {}
        try {
          window.removeEventListener("pointerup", onPointerUp);
        } catch {}

        if (addedObject) {
          try {
            resetModelColor(interactive.originalMaterials);
            interactive.scene.remove(addedObject);
            disposeObject(addedObject);
          } catch (e) {
            // ignore
          }
          interactive.mesh = null;
          addedObject = null;
        }

        try {
          interactive.controls.dispose();
        } catch {}
        try {
          interactive.renderer.dispose();
        } catch {}

        interactive.originalMaterials.clear();
        sceneRef.current = null;
      };
      // reexecuta quando modelUrl ou isolatedPart muda
    }, [modelUrl, isolatedPart, thumbnailMode, onModelLoaded, onModelError]);

    // --- Destaque quando selectedPartName externo muda ---
    useEffect(() => {
      const current = sceneRef.current;
      if (!current || !current.mesh) return;

      // não mexe quando estamos mostrando isolatedPart (o destaque já foi aplicado)
      if (isolatedPart) return;

      // Reset dos materiais antes de novo destaque
      resetModelColor(current.originalMaterials);

      if (selectedPartName) {
        const target = findNodeByBaseName(current.mesh, selectedPartName);
        if (target) {
          const meshesToHighlight: THREE.Mesh[] = [];
          target.traverse((c) => {
            if ((c as THREE.Mesh).isMesh) meshesToHighlight.push(c as THREE.Mesh);
          });
          if (meshesToHighlight.length > 0) {
            collectOriginalMaterials(current.mesh, current.originalMaterials);
            highlightPart(meshesToHighlight);
            // enquadra a câmera para o alvo (suave)
            fitCameraToObject(current.camera, current.controls, target);
          }
          setCurrentSelectedPart(selectedPartName);
        } else {
          setCurrentSelectedPart(null);
        }
      } else {
        // volta visao completa
        try {
          const mesh = current.mesh;
          if (mesh) {
            fitCameraToObject(current.camera, current.controls, mesh);
          }
        } catch {}
        setCurrentSelectedPart(null);
      }
    }, [selectedPartName, isolatedPart, findNodeByBaseName]);

    // --- Raycast no clique (seleção) ---
    const handleClick = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        const current = sceneRef.current;
        if (
          !current ||
          !current.mesh ||
          // em thumbnailMode não permitimos seleção/interação
          thumbnailMode
        )
          return;

        const container = containerRef.current;
        if (!container) return;

        const intersect = getIntersects(
          event.clientX,
          event.clientY,
          container,
          current,
        );
        if (!intersect) {
          setCurrentSelectedPart(null);
          onPartSelected?.(null);
          // reset highlight
          resetModelColor(current.originalMaterials);
          return;
        }

        // sobe na hierarquia até achar filho direto do mesh (ou o mesh em si)
        let sel: THREE.Object3D = intersect.object as THREE.Object3D;
        while (sel.parent && sel.parent !== current.mesh) {
          sel = sel.parent;
        }

        if (sel === current.mesh) {
          setCurrentSelectedPart(null);
          onPartSelected?.(null);
          resetModelColor(current.originalMaterials);
          return;
        }

        const partName = sel.name ? sel.name.split("-")[0].trim() : null;
        if (!partName) {
          setCurrentSelectedPart(null);
          onPartSelected?.(null);
          resetModelColor(current.originalMaterials);
          return;
        }

        const newSel = currentSelectedPart === partName ? null : partName;
        // aplica highlight
        resetModelColor(current.originalMaterials);

        if (newSel) {
          const meshesToHighlight: THREE.Mesh[] = [];
          sel.traverse((c) => {
            if ((c as THREE.Mesh).isMesh) meshesToHighlight.push(c as THREE.Mesh);
          });
          if (meshesToHighlight.length > 0) {
            collectOriginalMaterials(current.mesh, current.originalMaterials);
            highlightPart(meshesToHighlight);
            fitCameraToObject(current.camera, current.controls, sel);
          }
        } else {
          // volta visão completa
          try {
            if (current.mesh) {
              fitCameraToObject(current.camera, current.controls, current.mesh);
            }
          } catch {}
        }

        setCurrentSelectedPart(newSel);
        onPartSelected?.(newSel);
      },
      [currentSelectedPart, onPartSelected, thumbnailMode],
    );

    // Expor ref para pai
    useImperativeHandle(
      ref,
      () => ({
        isModelLoaded: () => isModelLoaded,
        getSelectedPartName: () => currentSelectedPart,
        highlightPartByName: (partName: string | null) => {
          // atualiza selectedPartName localmente, acionando efeito acima
          setTimeout(() => {
            // setSelectedPartName comes from prop in callers; here we only update internal state
            if (partName === null) {
              const current = sceneRef.current;
              if (current) {
                resetModelColor(current.originalMaterials);
                if (current.mesh) {
                  fitCameraToObject(current.camera, current.controls, current.mesh);
                }
              }
              setCurrentSelectedPart(null);
            } else {
              const current = sceneRef.current;
              if (!current || !current.mesh) {
                setCurrentSelectedPart(partName);
                return;
              }
              const target = findNodeByBaseName(current.mesh, partName);
              if (target) {
                resetModelColor(current.originalMaterials);
                const meshesToHighlight: THREE.Mesh[] = [];
                target.traverse((c) => {
                  if ((c as THREE.Mesh).isMesh) meshesToHighlight.push(c as THREE.Mesh);
                });
                if (meshesToHighlight.length > 0) {
                  collectOriginalMaterials(current.mesh, current.originalMaterials);
                  highlightPart(meshesToHighlight);
                  fitCameraToObject(current.camera, current.controls, target);
                }
                setCurrentSelectedPart(partName);
              } else {
                setCurrentSelectedPart(null);
              }
            }
          }, 0);
        },
      }),
      [isModelLoaded, currentSelectedPart, findNodeByBaseName],
    );

    return (
      <div
        ref={containerRef}
        className={`${className || ""} relative h-full w-full`}
        onClick={handleClick}
        style={{ touchAction: "none" }}
      >
        {isLoadingPart && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-100/80">
            <span className="text-gray-600">Carregando...</span>
            {!isolatedPart && (
              <div className="mt-4 h-2 w-3/4 rounded-full bg-gray-300">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${loadProgress}%` }}
                />
              </div>
            )}
          </div>
        )}
        {/* o canvas é anexado dentro de setupScene */}
      </div>
    );
  },
);

View3D.displayName = "View3D";
