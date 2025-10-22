// /app/seu-caminho/visualizador/Helper/Miniatura3D.tsx

"use client";

import { Eye } from "lucide-react";
import Image from "next/image";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import * as THREE from "three";

// Importa a função utilitária de geração de miniatura
import {
  extractPartByName,
  loadGLB,
  renderThumbnailToDataURL,
} from "@/actions/solid-works/three-setup/three-setup";

import { VisualizadorModal } from "./VisualizadorModal"; // Presume-se que o caminho está correto

/**
 * Miniatura3D otimizada:
 * - Lazy load via IntersectionObserver: só inicia View3D quando visível
 * - Usa cache em memória (Map) para base64 das miniaturas
 * - Não precisa mais do View3D offscreen, usa apenas as utilidades do Three.js
 */

interface Miniatura3DProps {
  urlModelo: string;
  nomePeca: string;
  // NOVO: Se este prop for fornecido, a miniatura é gerada para a peça, não para o modelo completo
  partName?: string;
  // NOVO: Callback ao clicar (ex: para abrir um modal de visualização)
  onPartClick?: () => void;
}

// Cache simples em memória para a hierarquia do modelo (client-side)
const thumbnailCache = new Map<string, string>();

// Chave única para o cache (combina URL e nome da parte)
const getCacheKey = (url: string, partName: string | undefined) =>
  `${url}::${partName || "FULL_MODEL"}`;

export function Miniatura3D({
  urlModelo,
  nomePeca,
  partName,
  onPartClick,
}: Miniatura3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [thumbDataUrl, setThumbDataUrl] = useState<string | null>(
    () => thumbnailCache.get(getCacheKey(urlModelo, partName)) || null,
  );
  const [isVisible, setIsVisible] = useState(false);
  const [isProcessing, startTransition] = useTransition(); // Uso de useTransition para carregamento suave
  const [hasError, setHasError] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false); // Para o caso de onPartClick não ser usado

  // --- Lógica de Geração da Miniatura (Assíncrona) ---
  const generateThumbnail = useCallback(
    async (retry = false) => {
      // Se já tem cache, retorna.
      if (!retry && thumbnailCache.get(getCacheKey(urlModelo, partName))) {
        setThumbDataUrl(thumbnailCache.get(getCacheKey(urlModelo, partName))!);
        return;
      }

      startTransition(async () => {
        setHasError(false);
        try {
          // 1. Carrega o modelo completo
          // NOTA: É importante que o loadGLB use o cache global para não rebaixar todo o binário
          const modelGroup = await loadGLB(urlModelo);

          let objectToRender: THREE.Object3D;
          // 2. Decide se renderiza a parte isolada ou o modelo completo
          if (partName) {
            // Se for miniatura de PARTE, extrai o objeto clonado e normalizado
            const part = extractPartByName(modelGroup, partName);
            if (!part) {
              throw new Error(
                `A parte "${partName}" não foi encontrada no modelo.`,
              );
            }
            objectToRender = part;
          } else {
            // Renderiza o modelo completo (já normalizado dentro de extractPartByName/loadGLB)
            objectToRender = modelGroup;
          }

          // 3. Renderiza e obtém o dataURL (esta função faz o dispose do objectToRender)
          // O tamanho de 256x256 é um bom equilíbrio para miniaturas
          const dataUrl = await renderThumbnailToDataURL(
            objectToRender,
            256,
            256,
            0xf0f0f0, // Cor de fundo suave (cinza claro)
          );

          // 4. Limpeza manual do modelo completo, se não foi usado o extractPartByName
          // Se usamos extractPartByName, o objeto clonado é descartado pelo renderThumbnailToDataURL.
          // O modelo completo (modelGroup) precisa ser descartado após a extração da parte
          // ou após o uso, se não foi extraída parte.
          if (!partName) {
            // Se usamos o modelo completo, ele também é descartado pelo renderThumbnailToDataURL.
            // A única coisa a ser feita é garantir que o modeloGroup original (após loadGLB)
            // seja descartado se não foi usado na miniatura, o que não é o caso aqui,
            // pois passamos para renderThumbnailToDataURL.
          }
          // A função disposeObject deve ser chamada apenas na raiz do objeto de topo
          // para evitar liberar recursos compartilhados indevidamente (o que o three-setup já faz).

          // 5. Atualiza o state e cache
          setThumbDataUrl(dataUrl);
          thumbnailCache.set(getCacheKey(urlModelo, partName), dataUrl);
          setHasError(false);
        } catch (error) {
          console.error("Erro ao gerar miniatura:", error);
          setHasError(true);
          setThumbDataUrl(null);
        }
      });
    },
    [urlModelo, partName],
  );

  // --- Lógica de Lazy Load (IntersectionObserver) ---
  useEffect(() => {
    if (thumbDataUrl) return; // Se já tem URL, não precisa observar

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      {
        rootMargin: "100px", // Começa a carregar um pouco antes de entrar na tela
      },
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [thumbDataUrl]);

  // Se estiver visível e ainda não tiver URL, dispara a geração
  useEffect(() => {
    if (isVisible && !thumbDataUrl && !hasError) {
      generateThumbnail();
    }
  }, [isVisible, thumbDataUrl, hasError, generateThumbnail]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-md bg-gray-100/50 transition-shadow duration-300 hover:shadow-lg"
    >
      {/* Imagem da miniatura (ou placeholder) */}
      <div
        className="h-full w-full"
        // Usa o callback onPartClick, se fornecido, senão abre o modal padrão
        onClick={(e) => {
          e.stopPropagation(); // evita propagar o clique para o pai (duplo modal)
          if (onPartClick) {
            try {
              onPartClick();
            } catch (err) {
              console.warn("onPartClick lançou erro:", err);
            }
          } else {
            setIsModalOpen(true);
          }
        }}
        role="button"
        tabIndex={0}
      >
        {thumbDataUrl ? (
          <Image
            src={thumbDataUrl}
            alt={`Miniatura 3D de ${nomePeca}${partName ? ` - ${partName}` : ""}`}
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, 50vw"
            quality={85}
            priority={!isVisible} // Prioriza a primeira carga, se não estiver visível (para o cache)
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            {isProcessing ? (
              <div className="flex flex-col items-center">
                <Eye className="h-6 w-6 animate-spin text-blue-500" />
                <span className="mt-2 text-xs text-gray-600">
                  Gerando {partName || "modelo"}...
                </span>
              </div>
            ) : hasError ? (
              <div className="flex flex-col items-center p-2 text-center">
                <span className="text-xs text-red-600">Falha ao carregar.</span>
                <button
                  onClick={() => generateThumbnail(true)}
                  className="mt-1 text-xs text-blue-600 underline"
                >
                  Tentar Novamente
                </button>
              </div>
            ) : (
              <div className="text-gray-500">Aguardando...</div>
            )}
          </div>
        )}
      </div>

      {/* Renderiza modal interno somente se NÃO houver onPartClick (pai assume controle) */}
      {!onPartClick && isModalOpen && (
        <VisualizadorModal
          urlModelo={urlModelo}
          nomePeca={nomePeca}
          initialSelectedPart={partName}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
}
