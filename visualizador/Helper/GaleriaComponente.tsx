"use client";

import React, { useMemo } from "react";

import { View3D } from "@/components/common/view-3d";

interface GaleriaComponenteProps {
  modelos: {
    id: number;
    nome: string;
    codigo: string;
    urlModelo: string;
    revisao: string;
    material: string;
  }[];
}

const MODELOS_POR_PAGINA = 6;

export function GaleriaComponente({ modelos }: GaleriaComponenteProps) {
  const [paginaAtual, setPaginaAtual] = React.useState(0);

  const totalPaginas = Math.max(
    1,
    Math.ceil(modelos.length / MODELOS_POR_PAGINA),
  );
  const start = paginaAtual * MODELOS_POR_PAGINA;
  const end = start + MODELOS_POR_PAGINA;
  const modelosParaExibir = modelos.slice(start, end);

  const proximaPagina = () =>
    setPaginaAtual((p) => Math.min(p + 1, totalPaginas - 1));
  const paginaAnterior = () => setPaginaAtual((p) => Math.max(p - 1, 0));

  // Memo para reduzir renderizações da grid
  const grid = useMemo(() => {
    return modelosParaExibir.map((modelo) => (
      <div key={modelo.id} className="rounded-lg border bg-white p-2 shadow-sm">
        <div className="h-48 w-full overflow-hidden rounded-md">
          {/* View3D em modo thumbnail: não ficará interativo e renderiza apenas quando visível */}
          <View3D
            modelUrl={modelo.urlModelo}
            className="h-full w-full"
            thumbnailMode
            thumbnailSize={512}
          />
        </div>
        <div className="mt-2 text-center">
          <h2 className="text-md truncate font-semibold">{modelo.nome}</h2>
        </div>
      </div>
    ));
  }, [modelosParaExibir]);

  return (
    <div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {grid}
      </div>

      <div className="mt-6 flex items-center justify-center space-x-4">
        <button
          onClick={paginaAnterior}
          disabled={paginaAtual === 0}
          className="rounded-lg border px-3 py-1 disabled:opacity-40"
        >
          Anterior
        </button>
        <span className="font-medium text-gray-700">
          Página {paginaAtual + 1} de {totalPaginas}
        </span>
        <button
          onClick={proximaPagina}
          disabled={paginaAtual >= totalPaginas - 1}
          className="rounded-lg border px-3 py-1 disabled:opacity-40"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
