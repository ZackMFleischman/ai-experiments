import { WebGPURenderer } from "three/webgpu";
import helloScene from "../../../content/scenes/hello.scene";
import { FpsMeter } from "./fps";
import { SceneHost } from "./host";

const canvas = document.querySelector<HTMLCanvasElement>("#out");
const fpsEl = document.querySelector<HTMLElement>("#fps");
if (!canvas || !fpsEl) {
  throw new Error("index.html is missing #out canvas or #fps element");
}

const renderer = new WebGPURenderer({ canvas, antialias: true });
const host = new SceneHost();
const fps = new FpsMeter(fpsEl);

function resize(): void {
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", resize);

await renderer.init();
resize();

host.setScene(helloScene);

renderer.setAnimationLoop(() => {
  host.render(renderer);
  fps.tick();
});

if (import.meta.hot) {
  // A syntax/compile error never reaches this callback (Vite withholds the
  // update), and a scene that throws is rejected by the host — either way
  // the previous scene keeps rendering.
  import.meta.hot.accept("../../../content/scenes/hello.scene", (mod) => {
    if (!mod?.default) {
      console.warn("[loom] hot update carried no scene default export; keeping previous");
      return;
    }
    const ok = host.setScene(mod.default);
    console.info(
      ok
        ? `[loom] scene hot-swapped: ${host.liveSceneName}`
        : "[loom] scene rejected; previous still live",
    );
  });
}
