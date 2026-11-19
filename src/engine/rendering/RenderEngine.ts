import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Logger } from '../core/Logger.ts';
import type { GraphicsTier, RenderCapabilitiesReport } from '../types.ts';

export function probeWebGLCapabilities(): {
  backend: 'webgl2' | 'webgl1' | 'unavailable';
  rendererName: string;
  vendorName: string;
  isSoftwareGl: boolean;
  maxTextureSize: number;
  hasTimerQuery: boolean;
} {
  const probeCanvas = document.createElement('canvas');
  let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
  let backend: 'webgl2' | 'webgl1' | 'unavailable' = 'unavailable';

  const gl2 = probeCanvas.getContext('webgl2');
  if (gl2) {
    gl = gl2;
    backend = 'webgl2';
  } else {
    const gl1 = probeCanvas.getContext('webgl');
    if (gl1) {
      gl = gl1;
      backend = 'webgl1';
    }
  }

  if (!gl) {
    return {
      backend: 'unavailable',
      rendererName: 'Unavailable',
      vendorName: 'Unavailable',
      isSoftwareGl: true,
      maxTextureSize: 0,
      hasTimerQuery: false,
    };
  }

  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  const vendorName = String(gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR));
  const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 2048;
  const hasTimerQuery = Boolean(gl.getExtension('EXT_disjoint_timer_query_webgl2'));
  const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererName);

  gl.getExtension('WEBGL_lose_context')?.loseContext();

  return {
    backend,
    rendererName,
    vendorName,
    isSoftwareGl,
    maxTextureSize,
    hasTimerQuery,
  };
}

export class RenderEngine {
  readonly renderer: THREE.WebGLRenderer;
  readonly capabilities: RenderCapabilitiesReport;
  private readonly container: HTMLElement;
  private readonly logger?: Logger;
  private envTexture: THREE.Texture | null = null;
  private contextLost = false;

  private readonly onContextLostCallback?: () => void;
  private readonly onContextRestoredCallback?: () => void;

  private readonly handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    this.logger?.warn('RenderEngine', 'WebGL context lost');
    this.onContextLostCallback?.();
  };

  private readonly handleContextRestored = (): void => {
    this.contextLost = false;
    this.logger?.info('RenderEngine', 'WebGL context restored');
    this.onContextRestoredCallback?.();
  };

  constructor(
    container: HTMLElement,
    options: {
      logger?: Logger;
      pixelRatioCap: number;
      graphicsTier: GraphicsTier;
      onContextLost?: () => void;
      onContextRestored?: () => void;
    },
  ) {
    this.container = container;
    this.logger = options.logger;
    this.onContextLostCallback = options.onContextLost;
    this.onContextRestoredCallback = options.onContextRestored;

    const probe = probeWebGLCapabilities();
    if (probe.backend === 'unavailable') {
      throw new Error('WebGL2/WebGL is not supported in this browser environment.');
    }

    this.renderer = new THREE.WebGLRenderer({
      antialias: !probe.isSoftwareGl && options.graphicsTier !== 'low',
      powerPreference: 'high-performance',
    });

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = !probe.isSoftwareGl && options.graphicsTier !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const appliedPixelRatio = probe.isSoftwareGl ? 1 : Math.min(dpr, options.pixelRatioCap);
    this.renderer.setPixelRatio(appliedPixelRatio);

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    this.renderer.setSize(width, height);

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.capabilities = {
      backend: probe.backend,
      rendererName: probe.rendererName,
      vendorName: probe.vendorName,
      isSoftwareGl: probe.isSoftwareGl,
      maxTextureSize: probe.maxTextureSize,
      maxAnisotropy: this.renderer.capabilities.getMaxAnisotropy(),
      hasTimerQuery: probe.hasTimerQuery,
      devicePixelRatio: dpr,
      appliedPixelRatio,
    };

    this.logger?.info(
      'RenderEngine',
      `Initialized ${probe.backend.toUpperCase()} (${probe.isSoftwareGl ? 'Software' : 'Hardware'})`,
      `${probe.rendererName} | DPR ${appliedPixelRatio}`,
    );
  }

  buildStudioEnvironment(scene: THREE.Scene): void {
    this.envTexture?.dispose();
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.envTexture;
    pmremGenerator.dispose();
  }

  precompile(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.capabilities.isSoftwareGl) {
      return;
    }
    this.renderer.compile(scene, camera);
  }

  applyQualitySettings(graphicsTier: GraphicsTier, pixelRatioCap: number): void {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const applied = this.capabilities.isSoftwareGl ? 1 : Math.min(dpr, pixelRatioCap);
    this.renderer.setPixelRatio(applied);
    this.capabilities.appliedPixelRatio = applied;
    this.renderer.shadowMap.enabled = !this.capabilities.isSoftwareGl && graphicsTier !== 'low';
    this.renderer.shadowMap.needsUpdate = true;
  }

  resize(width: number, height: number): void {
    const safeW = Math.max(1, Math.floor(width));
    const safeH = Math.max(1, Math.floor(height));
    this.renderer.setSize(safeW, safeH);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.contextLost) {
      return;
    }
    this.renderer.render(scene, camera);
  }

  /**
   * GPU-fence paced frame scheduler for software WebGL contexts.
   */
  scheduleAfterDraw = (callback: () => void): number => {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync !== 'function') {
      return window.setTimeout(callback, 80);
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = (): void => {
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        window.setTimeout(poll, 5);
      } else {
        if (sync) {
          gl.deleteSync(sync);
        }
        window.setTimeout(callback, 80);
      }
    };
    return window.setTimeout(poll, 5);
  };

  cancelScheduledDraw = (handle: number): void => {
    window.clearTimeout(handle);
  };

  simulateContextLoss(): boolean {
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) {
      return false;
    }
    ext.loseContext();
    window.setTimeout(() => {
      ext.restoreContext();
    }, 900);
    return true;
  }

  getStats(): { drawCalls: number; triangles: number; geometries: number; textures: number } {
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
  }

  dispose(): void {
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.envTexture?.dispose();
    this.envTexture = null;
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
