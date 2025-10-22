// /app/seu-caminho/visualizador/Helper/VisualizadorModal.tsx

"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import {
  disposeObject,
  extractPartByName,
  loadGLB,
} from "@/actions/solid-works/three-setup/three-setup";
import { View3D, View3DRef } from "@/components/common/view-3d";

interface VisualizadorModalProps {
  urlModelo: string;
  nomePeca: string;
  onClose: () => void;
  // Peça que deve ser destacada/isolada
  initialSelectedPart?: string | null;
}

export function VisualizadorModal({
  urlModelo,
  nomePeca,
  onClose,
  initialSelectedPart = null,
}: VisualizadorModalProps) {
  const view3DRef = useRef<View3DRef | null>(null);

  // Armazena a peça isolada (clonada do modelo) a ser passada ao View3D
  const [isolatedPartObject, setIsolatedPartObject] =
    useState<THREE.Object3D | null>(null);

  // Status de carregamento do objeto 3D
  const [isLoadingPart, setIsLoadingPart] = useState(true);

  // Peça atualmente selecionada/em destaque
  const [selectedPartName, setSelectedPartName] = useState<string | null>(
    initialSelectedPart,
  );

  // Define o modo de visualização.
  const isIsolatedView = !!initialSelectedPart && !isolatedPartObject;
  const isFullView = !isIsolatedView && !isolatedPartObject;

  // --- Efeito para carregar e isolar a peça ---
  useEffect(() => {
    let cancelled = false;

    if (initialSelectedPart) {
      setIsLoadingPart(true);
      const loadIsolatedPart = async () => {
        try {
          // 1. Carrega o modelo COMPLETO (necessário para extrair a peça)
          const fullModel = await loadGLB(urlModelo);

          if (cancelled) {
            // cleanup antecipado: libera fullModel
            try {
              disposeObject(fullModel);
            } catch {}
            return;
          }

          // 2. Extrai e clona a peça (já centralizada e normalizada)
          const part = extractPartByName(fullModel, initialSelectedPart);

          // liberamos o modelo completo depois da extração
          try {
            disposeObject(fullModel);
          } catch {}

          if (part) {
            setIsolatedPartObject(part); // O OBJETO 3D É SETADO AQUI
          } else {
            console.warn(`Peça "${initialSelectedPart}" não encontrada em ${urlModelo}`);
          }
        } catch (error) {
          console.error("Erro ao carregar a peça isolada:", error);
        } finally {
          if (!cancelled) setIsLoadingPart(false);
        }
      };
      loadIsolatedPart();
    } else {
      // Se não há peça inicial, é visualização do modelo completo
      setIsLoadingPart(false);
    }

    return () => {
      cancelled = true;
    };
     
  }, [urlModelo, initialSelectedPart]);

  // Cleanup final quando modal desmonta: libera objeto isolado (se houver)
  useEffect(() => {
    return () => {
      if (isolatedPartObject) {
        try {
          disposeObject(isolatedPartObject);
        } catch (e) {
          console.warn("Erro ao dar dispose na peça isolada ao fechar modal:", e);
        }
      }
    };
  }, [isolatedPartObject]);

  // Se a visualização for de uma peça isolada, o título deve refletir
  const displayTitle = isolatedPartObject
    ? selectedPartName || nomePeca
    : isFullView
    ? nomePeca
    : "Carregando...";
  const displaySubtitle = isolatedPartObject
    ? "Visualização 3D Isolada"
    : isFullView
    ? "Visualização da Montagem Completa"
    : "Carregando...";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] w-[90vw] max-w-7xl rounded-lg bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Coluna de Informações (à esquerda) */}
        <aside className="w-80 border-r p-4">
          <h3 className="text-xl font-bold text-gray-800">{displayTitle}</h3>
          <p className="mb-4 text-sm text-gray-600">{displaySubtitle}</p>

          <div className="mt-4 space-y-3">
            <div className="text-sm">
              <strong>Arquivo:</strong> {urlModelo}
            </div>
            {isolatedPartObject && (
              <div className="text-sm">
                <strong>Peça:</strong> {selectedPartName}
              </div>
            )}
            <div className="mt-4">
              <button
                onClick={() => {
                  // volta para visão completa quando disponível
                  setSelectedPartName(null);
                  // remove isolated object se existir (View3D irá recarregar montagem completa)
                  if (isolatedPartObject) {
                    try {
                      disposeObject(isolatedPartObject);
                    } catch {}
                    setIsolatedPartObject(null);
                  }
                }}
                className="rounded bg-gray-200 px-3 py-1 text-sm"
              >
                Ver Montagem Completa
              </button>
            </div>
          </div>
        </aside>

        {/* Coluna do Visualizador 3D (à direita) */}
        <div className="relative flex-grow">
          <header className="flex items-center justify-end border-b p-2">
            <button
              onClick={() => {
                // forçar cleanup e fechar
                if (isolatedPartObject) {
                  try {
                    disposeObject(isolatedPartObject);
                  } catch {}
                  setIsolatedPartObject(null);
                }
                onClose();
              }}
              className="rounded bg-red-500 px-3 py-1 text-white text-sm"
            >
              Fechar
            </button>
          </header>

          <div className="h-[calc(100%-48px)] w-full">
            <View3D
              ref={view3DRef}
              modelUrl={urlModelo}
              className="h-full w-full"
              onModelError={(e) => console.error("Erro no View3D:", e)}
              // Passa isolatedPart quando quisermos visualização isolada
              isolatedPart={isolatedPartObject}
              selectedPartName={selectedPartName}
            />
            {isLoadingPart && (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <span className="text-gray-600">Carregando visualização...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
