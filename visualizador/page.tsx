import { readdir } from "fs/promises";
import path from "path";

import { GaleriaComponente } from "@/app/(protected)/visualizador/Helper/GaleriaComponente";
import { PecaItem } from "@/app/(protected)/visualizador/Helper/PecaItem";
import { PageContainer } from "@/components/common/page-container";

async function getModelsFromDirectory() {
  const modelsDir = path.join(process.cwd(), "public", "models");
  try {
    const filenames = await readdir(modelsDir);
    const glbFiles = filenames.filter((file) =>
      file.toLowerCase().endsWith(".glb"),
    );
    const models = glbFiles.map((file, index) => ({
      id: index + 1,
      nome: file.replace(/.glb/i, ""),
      codigo: `P-${index + 1}`,
      urlModelo: `/models/${file}`,
      revisao: "N/A",
      material: "N/A",
    }));
    return models;
  } catch (error) {
    console.error("ERRO: Falha ao ler o diretório de modelos:", error);
    return [];
  }
}

export default async function DashboardPage() {
  const pecasDoBanco = await getModelsFromDirectory();

  return (
    <PageContainer>
      <h1 className="mb-4 text-2xl font-bold">Dashboard de Peças</h1>

      <div className="mt-8">
        <h2 className="text-xl font-bold">Modelos 3D</h2>
        <GaleriaComponente modelos={pecasDoBanco} />
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-bold">Inventário de Peças</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full table-auto border-collapse text-left">
            <thead>
              <tr className="border-b text-sm font-medium">
                <th className="p-4">Miniatura</th>
                <th className="p-4">Nome da Peça</th>
                <th className="p-4">Código</th>
                <th className="p-4">Material</th>
                <th className="p-4">Revisão</th>
                <th className="p-4">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {pecasDoBanco.map((peca) => (
                <PecaItem key={peca.id} peca={peca} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
}
