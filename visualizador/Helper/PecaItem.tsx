// /app/seu-caminho/visualizador/Helper/PecaItem.tsx

"use client";

import { ChevronDown } from "lucide-react";
import React, { useEffect, useState } from "react";

import { getTopLevelNodes } from "@/actions/solid-works/three-setup/three-setup";

import { Miniatura3D } from "./Miniatura3D";
import { VisualizadorModal } from "./VisualizadorModal";

interface PecaItemProps {
  peca: {
    id: number;
    nome: string;
    codigo: string;
    urlModelo: string;
    revisao: string;
    material: string;
  };
}

// Cache simples em memória para a hierarquia do modelo (client-side)
const hierarchyCache = new Map<string, string[]>();

export function PecaItem({ peca }: PecaItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hierarchy, setHierarchy] = useState<string[]>(
    () => hierarchyCache.get(peca.urlModelo) || [],
  );
  const [isLoadingHierarchy, setIsLoadingHierarchy] = useState(false);

  // Estados para o Modal de Visualização
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPartInModal, setSelectedPartInModal] = useState<string | null>(
    null,
  );

  // Função centralizada para abrir o modal com ou sem seleção de peça
  const openModalWithPart = (partName: string | null) => {
    setSelectedPartInModal(partName);
    setIsModalOpen(true);
  };

  // Efeito para carregar a hierarquia quando expandir (e se não estiver em cache)
  useEffect(() => {
    if (isExpanded && hierarchy.length === 0 && !isLoadingHierarchy) {
      setIsLoadingHierarchy(true);
      getTopLevelNodes(peca.urlModelo)
        .then((nodes) => {
          setHierarchy(nodes);
          hierarchyCache.set(peca.urlModelo, nodes); // Salva no cache
        })
        .catch((e) => {
          console.error("Falha ao carregar hierarquia:", e);
        })
        .finally(() => {
          setIsLoadingHierarchy(false);
        });
    }
  }, [isExpanded, peca.urlModelo, hierarchy.length, isLoadingHierarchy]);

  // Renderiza a linha principal da tabela
  const mainRow = (
    <tr className="cursor-pointer border-b bg-white transition hover:bg-gray-50">
      <td className="p-4">
        {/* Miniatura 3D OTIMIZADA do modelo completo */}
        <div className="h-16 w-16">
          <Miniatura3D
            urlModelo={peca.urlModelo}
            nomePeca={peca.nome}
            // Não passa 'partName' para renderizar o modelo completo
            // Passa onPartClick para controlar abertura única de modal pelo PecaItem
            onPartClick={() => openModalWithPart(null)}
          />
        </div>
      </td>

      <td className="p-4">
        <div className="max-w-[240px] truncate">{peca.nome}</div>
      </td>

      <td className="p-4">{peca.codigo}</td>
      <td className="p-4">{peca.material}</td>
      <td className="p-4">{peca.revisao}</td>
      <td className="p-4">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded((s) => !s);
          }}
          className="flex items-center text-sm font-medium text-blue-600 transition hover:text-blue-700"
        >
          Ver Componentes
          <ChevronDown
            className={`ml-2 h-4 w-4 transform transition-transform ${
              isExpanded ? "rotate-180" : "rotate-0"
            }`}
          />
        </button>
      </td>
    </tr>
  );

  // Linha de detalhes (componentes)
  const detailRow =
    isExpanded ? (
      <tr className="bg-gray-50">
        <td colSpan={6} className="p-4">
          <h4 className="mb-2 text-sm font-semibold">
            Componentes da Montagem ({hierarchy.length}):
          </h4>

          {isLoadingHierarchy ? (
            <div className="text-sm text-gray-600">Carregando componentes...</div>
          ) : hierarchy.length > 0 ? (
            <ul className="space-y-2">
              {hierarchy.map((part) => (
                <li key={part} className="flex items-center justify-between rounded-md bg-white p-2 shadow-sm">
                  <div className="text-sm truncate">{part}</div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Abre modal já com a peça selecionada (isolada)
                        openModalWithPart(part);
                      }}
                      className="rounded px-2 py-1 text-xs text-white bg-blue-600 hover:bg-blue-700"
                    >
                      Ver Peça
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Abre modal com a montagem completa (sem seleção)
                        openModalWithPart(null);
                      }}
                      className="rounded px-2 py-1 text-xs text-gray-700 border hover:bg-gray-50"
                    >
                      Abrir Montagem
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-gray-600">Nenhum componente encontrado.</div>
          )}
        </td>
      </tr>
    ) : null;

  // Renderização do Modal (mantida)
  const modal = isModalOpen ? (
    <VisualizadorModal
      urlModelo={peca.urlModelo}
      nomePeca={peca.nome}
      initialSelectedPart={selectedPartInModal} // PASSA O NOME DA PEÇA (OU NULL)
      onClose={() => {
        setIsModalOpen(false);
        setSelectedPartInModal(null);
      }}
    />
  ) : null;

  return (
    <>
      {mainRow}
      {detailRow}
      {modal}
    </>
  );
}

// OBSERVAÇÃO: Você deve remover toda a lógica de estado do modal e o elemento <VisualizadorModal>
// que estava dentro do seu componente Miniatura3D.tsx, se ele ainda estiver lá.
