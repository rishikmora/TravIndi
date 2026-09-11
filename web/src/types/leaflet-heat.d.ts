// `leaflet.heat` has no @types package — it augments the global `L`
// namespace at runtime (side-effect import), so this only needs to
// describe that augmentation, not re-export a module of its own.
import "leaflet";

declare module "leaflet" {
  type HeatLatLngTuple = [number, number, number?];

  interface HeatLayerOptions {
    minOpacity?: number;
    maxZoom?: number;
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: Record<number, string>;
  }

  interface HeatLayer extends Layer {
    setLatLngs(latlngs: HeatLatLngTuple[]): this;
    addLatLng(latlng: HeatLatLngTuple): this;
    setOptions(options: HeatLayerOptions): this;
  }

  function heatLayer(latlngs: HeatLatLngTuple[], options?: HeatLayerOptions): HeatLayer;
}
