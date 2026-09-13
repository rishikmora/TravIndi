import { buildTerrainData, type TerrainMaskInput } from './terrain';

interface TerrainRequest extends TerrainMaskInput {
  segments: number;
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<TerrainRequest>) => void) | null;
  postMessage: (message: unknown, transfer: Transferable[]) => void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const { land, width, height, segments } = event.data;
  const data = buildTerrainData({ land, width, height }, segments);
  scope.postMessage(data, [
    data.positions.buffer,
    data.normals.buffer,
    data.colors.buffer,
    data.indices.buffer,
    data.heights.buffer,
  ]);
};
