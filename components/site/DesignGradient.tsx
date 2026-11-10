'use client';

import { useEffect, useRef } from 'react';

// The source water plane uses classic Perlin noise (Ashima Arts / Stefan Gustavson,
// MIT), 1.5 density/strength, and the same three material colors below.
const vertex = `
attribute vec2 position;
uniform float time;
uniform float aspect;
varying vec3 surface;
vec3 mod289(vec3 x)
{
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x)
{
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x)
{
  return mod289(((x*34.0)+1.0)*x);
}

vec4 taylorInvSqrt(vec4 r)
{
  return 1.79284291400159 - 0.85373472095314 * r;
}

vec3 fade(vec3 t) {
  return t*t*t*(t*(t*6.0-15.0)+10.0);
}

float cnoise(vec3 P)
{
  vec3 Pi0 = floor(P); 
  vec3 Pi1 = Pi0 + vec3(1.0); 
  Pi0 = mod289(Pi0);
  Pi1 = mod289(Pi1);
  vec3 Pf0 = fract(P); 
  vec3 Pf1 = Pf0 - vec3(1.0); 
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.yy, Pi1.yy);
  vec4 iz0 = Pi0.zzzz;
  vec4 iz1 = Pi1.zzzz;

  vec4 ixy = permute(permute(ix) + iy);
  vec4 ixy0 = permute(ixy + iz0);
  vec4 ixy1 = permute(ixy + iz1);

  vec4 gx0 = ixy0 * (1.0 / 7.0);
  vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
  gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5);
  gy0 -= sz0 * (step(0.0, gy0) - 0.5);

  vec4 gx1 = ixy1 * (1.0 / 7.0);
  vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
  gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5);
  gy1 -= sz1 * (step(0.0, gy1) - 0.5);

  vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
  vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
  vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
  vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
  vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
  vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
  vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
  vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

  vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
  g000 *= norm0.x;
  g010 *= norm0.y;
  g100 *= norm0.z;
  g110 *= norm0.w;
  vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
  g001 *= norm1.x;
  g011 *= norm1.y;
  g101 *= norm1.z;
  g111 *= norm1.w;

  float n000 = dot(g000, Pf0);
  float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
  float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
  float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
  float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
  float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
  float n111 = dot(g111, Pf1);

  vec3 fade_xyz = fade(Pf0);
  vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
  vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
  float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x); 
  return 2.2 * n_xyz;
}


void main() {
  vec3 p = vec3(position, 0.0);
  p.z += 0.75 * cnoise(0.43 * p * 1.5 + time * 0.4) * 1.5;
  surface = p;
  float z = radians(-60.0), x = radians(50.0);
  vec3 rotated = vec3(cos(z)*p.x-sin(z)*p.y, sin(z)*p.x+cos(z)*p.y, p.z);
  rotated = vec3(rotated.x, cos(x)*rotated.y-sin(x)*rotated.z, sin(x)*rotated.y+cos(x)*rotated.z);
  float polar = radians(80.0);
  vec3 view = vec3(-rotated.x, sin(polar)*rotated.y+cos(polar)*rotated.z, cos(polar)*rotated.y-sin(polar)*rotated.z-2.8);
  float f = 1.0 / tan(radians(45.0)*0.5);
  gl_Position = vec4(view.x*f/aspect, view.y*f, -1.0002*view.z-0.20002, -view.z);
}`;

const fragment = `
precision mediump float;
varying vec3 surface;
void main() {
  vec3 color1 = vec3(96.0, 96.0, 128.0) / 255.0;
  vec3 color2 = vec3(141.0, 125.0, 202.0) / 255.0;
  vec3 color3 = vec3(33.0) / 255.0;
  vec3 color = mix(mix(color1, color2, smoothstep(-3.0, 3.0, surface.x)), color3, surface.z);
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233))) * 43758.5453);
  gl_FragColor = vec4(clamp(color + (grain - 0.5) * 0.06, 0.0, 1.0), 1.0);
}`;

export function DesignGradient() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const gl = element.getContext('webgl', { alpha: false, antialias: true });
    if (!gl) return;
    const shaders: WebGLShader[] = [];
    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    if (!program || !buffer) { gl.deleteBuffer(buffer); gl.deleteProgram(program); return; }
    function compile(source: string, type: number) {
      const shader = gl!.createShader(type);
      if (!shader) return null;
      shaders.push(shader);
      gl!.shaderSource(shader, source); gl!.compileShader(shader);
      return gl!.getShaderParameter(shader, gl!.COMPILE_STATUS) ? shader : null;
    }
    const vs = compile(vertex, gl.VERTEX_SHADER), fs = compile(fragment, gl.FRAGMENT_SHADER);
    if (vs && fs) { gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program); }
    if (!vs || !fs || !gl.getProgramParameter(program, gl.LINK_STATUS)) {
      shaders.forEach((shader) => gl.deleteShader(shader)); gl.deleteBuffer(buffer); gl.deleteProgram(program); return;
    }
    // Match the source's 10 × 10 water plane, with enough subdivisions for its displacement.
    const vertices: number[] = [], divisions = 192;
    for (let y = 0; y < divisions; y++) for (let x = 0; x < divisions; x++) {
      const left = x / divisions * 10 - 5, bottom = y / divisions * 10 - 5, step = 10 / divisions;
      vertices.push(left, bottom, left + step, bottom, left, bottom + step, left, bottom + step, left + step, bottom, left + step, bottom + step);
    }
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const time = gl.getUniformLocation(program, 'time'), aspect = gl.getUniformLocation(program, 'aspect');
    gl.enable(gl.DEPTH_TEST); gl.clearColor(33 / 255, 33 / 255, 33 / 255, 1);
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, visible = false, disposed = false;
    const started = performance.now();
    function draw(now = performance.now()) {
      frame = 0;
      if (disposed || !element || !gl || gl.isContextLost()) return;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(element.clientWidth * ratio)), height = Math.max(1, Math.round(element.clientHeight * ratio));
      if (element.width !== width || element.height !== height) { element.width = width; element.height = height; }
      gl.viewport(0, 0, width, height); gl.uniform1f(aspect, width / height);
      gl.uniform1f(time, motion.matches ? 0 : (now - started) / 1000);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 2);
      element.dataset.homeAnimation = 'source-water-plane';
      if (visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(draw);
    }
    function refresh() { cancelAnimationFrame(frame); draw(); }
    const resize = new ResizeObserver(refresh); resize.observe(element);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; refresh(); }); intersection.observe(element);
    function lost() { cancelAnimationFrame(frame); delete element!.dataset.homeAnimation; }
    element.addEventListener('webglcontextlost', lost);
    document.addEventListener('visibilitychange', refresh); motion.addEventListener('change', refresh);
    draw();
    return () => {
      disposed = true; cancelAnimationFrame(frame); resize.disconnect(); intersection.disconnect();
      element.removeEventListener('webglcontextlost', lost);
      document.removeEventListener('visibilitychange', refresh); motion.removeEventListener('change', refresh);
      gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach((shader) => gl.deleteShader(shader));
    };
  }, []);
  return <div className="portfolio-design-gradient" aria-hidden="true"><canvas ref={canvas} className="portfolio-design-canvas" /></div>;
}
