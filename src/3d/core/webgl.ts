export interface WebGLProbe {
  supported: boolean;
  webgl2: boolean;
  renderer: string;
  vendor: string;
  maxTextureSize: number;
  failIfMajorPerformanceCaveat: boolean;
}

let cached: WebGLProbe | null = null;

/**
 * Creates a throwaway context to learn what the device can do, then releases
 * it immediately so it does not count against the browser's context limit.
 */
export function probeWebGL(): WebGLProbe {
  if (cached) return cached;
  const empty: WebGLProbe = {
    supported: false,
    webgl2: false,
    renderer: '',
    vendor: '',
    maxTextureSize: 0,
    failIfMajorPerformanceCaveat: false,
  };
  if (typeof document === 'undefined') return empty;

  try {
    const canvas = document.createElement('canvas');
    let gl: WebGL2RenderingContext | WebGLRenderingContext | null = canvas.getContext('webgl2', {
      failIfMajorPerformanceCaveat: true,
    });
    let caveat = false;
    if (!gl) {
      gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      caveat = Boolean(gl);
    }
    if (!gl) {
      cached = empty;
      return empty;
    }

    let renderer = String(gl.getParameter(gl.RENDERER) ?? '');
    let vendor = String(gl.getParameter(gl.VENDOR) ?? '');
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? renderer);
      vendor = String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) ?? vendor);
    }

    cached = {
      supported: true,
      webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
      renderer,
      vendor,
      maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0,
      failIfMajorPerformanceCaveat: caveat,
    };
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return cached;
  } catch {
    cached = empty;
    return empty;
  }
}
