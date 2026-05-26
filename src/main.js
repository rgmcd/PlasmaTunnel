const canvas = document.querySelector("#plasma-canvas");
const statusEl = document.querySelector("#status");
const fallbackEl = document.querySelector("#fallback");

const controls = {
  speed: document.querySelector("#speed"),
  warp: document.querySelector("#warp"),
  energy: document.querySelector("#energy"),
  palette: document.querySelector("#palette"),
  toggleMotion: document.querySelector("#toggle-motion"),
  speedValue: document.querySelector("#speed-value"),
  warpValue: document.querySelector("#warp-value"),
  energyValue: document.querySelector("#energy-value"),
};

const shader = /* wgsl */ `
struct Uniforms {
  resolution: vec2<f32>,
  time: f32,
  speed: f32,
  warp: f32,
  palette: f32,
  energy: f32,
  pad: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOut {
  @builtin(position) position: vec4<f32>,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );

  var output: VertexOut;
  output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
  return output;
}

fn hash2(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(hash2(i), hash2(i + vec2<f32>(1.0, 0.0)), u.x),
    mix(hash2(i + vec2<f32>(0.0, 1.0)), hash2(i + vec2<f32>(1.0, 1.0)), u.x),
    u.y
  );
}

fn fbm(p: vec2<f32>) -> f32 {
  var value = 0.0;
  var amplitude = 0.5;
  var point = p;

  for (var i = 0; i < 4; i = i + 1) {
    value += amplitude * noise(point);
    point = point * 2.03 + vec2<f32>(19.19, 7.31);
    amplitude *= 0.5;
  }

  return value;
}

fn paletteClassic(t: f32) -> vec3<f32> {
  let low = vec3<f32>(0.000, 0.002, 0.020);
  let violet = vec3<f32>(0.035, 0.040, 0.260);
  let blue = vec3<f32>(0.170, 0.230, 0.930);
  let ice = vec3<f32>(0.560, 0.700, 1.000);
  let white = vec3<f32>(0.940, 0.965, 1.000);
  let first = mix(low, violet, smoothstep(0.03, 0.45, t));
  let second = mix(first, blue, smoothstep(0.24, 0.68, t));
  let third = mix(second, ice, smoothstep(0.58, 0.90, t));
  return mix(third, white, smoothstep(0.82, 1.0, t));
}

fn paletteAqua(t: f32) -> vec3<f32> {
  let low = vec3<f32>(0.000, 0.020, 0.040);
  let teal = vec3<f32>(0.020, 0.450, 0.520);
  let cyan = vec3<f32>(0.340, 0.880, 1.000);
  let pearl = vec3<f32>(0.900, 1.000, 0.930);
  return mix(mix(low, teal, smoothstep(0.0, 0.58, t)), mix(cyan, pearl, t), smoothstep(0.36, 1.0, t));
}

fn paletteEmber(t: f32) -> vec3<f32> {
  let low = vec3<f32>(0.030, 0.000, 0.010);
  let red = vec3<f32>(0.500, 0.040, 0.020);
  let gold = vec3<f32>(1.000, 0.390, 0.080);
  let white = vec3<f32>(1.000, 0.940, 0.700);
  return mix(mix(low, red, smoothstep(0.02, 0.48, t)), mix(gold, white, t), smoothstep(0.35, 1.0, t));
}

fn colorFor(t: f32, mode: f32) -> vec3<f32> {
  if (mode < 0.5) {
    return paletteClassic(t);
  }

  if (mode < 1.5) {
    return paletteAqua(t);
  }

  return paletteEmber(t);
}

@fragment
fn fragmentMain(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let smallestAxis = max(min(uniforms.resolution.x, uniforms.resolution.y), 1.0);
  let time = uniforms.time * uniforms.speed;
  let drift = vec2<f32>(
    sin(time * 0.16) * 0.125 + sin(time * 0.047) * 0.050,
    cos(time * 0.12) * 0.085 + sin(time * 0.061) * 0.040
  );
  let uv = (fragCoord.xy - uniforms.resolution * 0.5) / smallestAxis - drift;
  let radius = max(length(uv), 0.015);
  let angle = atan2(uv.y, uv.x);
  let tunnelDepth = 1.0 / radius;
  let warp = uniforms.warp;
  let fall = time * 2.05;

  let twist = angle
    + sin(tunnelDepth * 0.105 + fall * 0.34) * 0.74 * warp
    + cos(radius * 6.60 + time * 0.34) * 0.26 * warp
    + sin(angle * 2.0 + time * 0.28) * 0.18;

  let depthCoord = tunnelDepth * (0.42 + warp * 0.20) + fall;
  let wrapped = vec2<f32>(cos(twist), sin(twist));
  let wrapped3 = vec2<f32>(cos(twist * 3.0 + depthCoord * 0.18), sin(twist * 3.0 + depthCoord * 0.18));

  let broadFlow = fbm(wrapped * 2.35 + vec2<f32>(depthCoord * 0.28, -depthCoord * 0.18));
  let fineFlow = fbm(wrapped3 * 4.20 + vec2<f32>(depthCoord * 0.34, depthCoord * 0.16));
  let smokeAngle = angle * 3.0 + broadFlow * 2.8;
  let smoke = fbm(vec2<f32>(cos(smokeAngle), sin(smokeAngle)) * 2.1 + vec2<f32>(tunnelDepth * 0.15 + fall * 0.22, tunnelDepth * 0.26 + fall * 0.10));

  let ribs = 0.5 + 0.5 * sin(tunnelDepth * (4.45 + warp * 1.35) + broadFlow * 8.1 + sin(twist * 5.0) * 0.78 + fall * 1.35);
  let spiralRibs = 0.5 + 0.5 * sin(twist * 9.0 + tunnelDepth * 0.76 + fineFlow * 5.4 + fall * 0.46);
  let waveSheets = 0.5 + 0.5 * sin(tunnelDepth * 0.72 + twist * 4.0 + smoke * 5.8 + fall * 0.62);
  let angularCell = sin(twist * 6.0 + depthCoord * 0.22);
  let cellA = 1.0 - smoothstep(0.030, 0.260, abs(sin(depthCoord * 3.6 + broadFlow * 7.6 + sin(twist * 2.0) * 1.5)));
  let cellB = 1.0 - smoothstep(0.030, 0.240, abs(sin(angularCell * 2.8 - depthCoord * 0.72 + fineFlow * 5.5)));
  let caustics = max(cellA * 0.82, cellB * 0.68) * smoothstep(0.18, 0.88, smoke);
  let darkPockets = smoothstep(0.26, 0.86, fineFlow) * smoothstep(0.18, 0.78, smoke);
  let ribGlow = smoothstep(0.44, 0.99, ribs) * (0.34 + darkPockets * 0.84);
  let spiralGlow = smoothstep(0.60, 1.0, spiralRibs) * (0.26 + broadFlow * 0.48);
  let mist = smoothstep(0.20, 1.0, broadFlow) * smoothstep(0.28, 0.93, waveSheets);
  let rushBands = smoothstep(0.46, 1.0, 0.5 + 0.5 * sin(tunnelDepth * 1.18 + fall * 1.75 + smoke * 3.2));

  let centerPull = exp(-radius * 7.8);
  let portal = (1.0 - smoothstep(0.030, 0.185, radius)) * (0.92 + 0.08 * sin(time * 1.65));
  let farGlow = exp(-radius * 13.5) * (0.76 + 0.24 * sin(time * 1.62 + smoke * 1.6));
  let edgeFade = 1.0 - smoothstep(0.74, 1.34, radius);
  let wallMask = smoothstep(0.045, 0.22, radius) * edgeFade;
  let depthShade = clamp(0.34 + tunnelDepth * 0.040, 0.0, 1.18);
  let outerWisps = smoothstep(0.44, 1.02, radius) * edgeFade * smoothstep(0.44, 0.86, smoke) * smoothstep(0.30, 0.90, broadFlow);

  let brightness = clamp((ribGlow * 0.78 + spiralGlow * 0.42 + caustics * 0.72 + mist * 0.22 + rushBands * 0.16 + centerPull * 0.15) * depthShade, 0.0, 1.28);
  let colorIndex = clamp(brightness + fineFlow * 0.12 + farGlow * 0.36 + caustics * 0.16, 0.0, 1.0);

  var color = colorFor(colorIndex, uniforms.palette);
  color *= (brightness * wallMask + farGlow * 0.92 + portal * 0.92) * uniforms.energy;
  color += colorFor(0.98, uniforms.palette) * (farGlow * 0.64 + portal * 1.14) * uniforms.energy;
  color += vec3<f32>(0.04, 0.26, 0.30) * outerWisps * (1.0 - uniforms.palette * 0.22);
  color += vec3<f32>(0.010, 0.020, 0.060) * mist * edgeFade;

  let grain = fract(sin(dot(fragCoord.xy, vec2<f32>(12.9898, 78.233))) * 43758.5453);
  color += (grain - 0.5) * 0.018;
  color *= 1.0 - smoothstep(0.92, 1.48, length((fragCoord.xy - uniforms.resolution * 0.5) / smallestAxis));
  color = pow(max(color, vec3<f32>(0.0)), vec3<f32>(0.72));

  return vec4<f32>(color, 1.0);
}
`;

let gpuState;
let paused = false;
let elapsedSeconds = 0;
let lastFrameMs = 0;

function setStatus(text) {
  statusEl.textContent = text;
}

function showFallback(message) {
  setStatus("WebGPU unavailable");
  fallbackEl.hidden = false;
  fallbackEl.querySelector("p").textContent = message;
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

function readControlNumber(control) {
  return Number.parseFloat(control.value);
}

function syncControlLabels() {
  controls.speedValue.value = readControlNumber(controls.speed).toFixed(2);
  controls.warpValue.value = readControlNumber(controls.warp).toFixed(2);
  controls.energyValue.value = readControlNumber(controls.energy).toFixed(2);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function writeUniforms() {
  const data = new Float32Array(8);
  data[0] = canvas.width;
  data[1] = canvas.height;
  data[2] = elapsedSeconds;
  data[3] = readControlNumber(controls.speed);
  data[4] = readControlNumber(controls.warp);
  data[5] = Number.parseFloat(controls.palette.value);
  data[6] = readControlNumber(controls.energy);
  data[7] = 0;

  gpuState.device.queue.writeBuffer(gpuState.uniformBuffer, 0, data);
}

function render(frameMs = 0) {
  if (!gpuState) {
    return;
  }

  resizeCanvas();

  if (!paused) {
    const delta = lastFrameMs ? Math.min((frameMs - lastFrameMs) / 1000, 0.05) : 0;
    elapsedSeconds += delta;
  }

  lastFrameMs = frameMs;
  writeUniforms();

  const commandEncoder = gpuState.device.createCommandEncoder();
  const textureView = gpuState.context.getCurrentTexture().createView();
  const pass = commandEncoder.beginRenderPass({
    colorAttachments: [
      {
        view: textureView,
        clearValue: { r: 0.01, g: 0.01, b: 0.015, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });

  pass.setPipeline(gpuState.pipeline);
  pass.setBindGroup(0, gpuState.bindGroup);
  pass.draw(3);
  pass.end();

  gpuState.device.queue.submit([commandEncoder.finish()]);
  requestAnimationFrame(render);
}

async function initWebGpu() {
  if (!("gpu" in navigator)) {
    showFallback("This browser does not expose WebGPU. Use a current Chrome or Edge build on localhost with hardware acceleration enabled.");
    return;
  }

  const adapter = await withTimeout(
    navigator.gpu.requestAdapter({ powerPreference: "high-performance" }),
    3500,
    "WebGPU adapter startup timed out in this browser environment."
  );

  if (!adapter) {
    showFallback("WebGPU is present, but no compatible GPU adapter was found.");
    return;
  }

  const device = await withTimeout(
    adapter.requestDevice(),
    3500,
    "WebGPU device startup timed out in this browser environment."
  );
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device,
    format,
    alphaMode: "opaque",
  });

  const uniformBuffer = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const shaderModule = device.createShaderModule({ code: shader });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: shaderModule,
      entryPoint: "vertexMain",
    },
    fragment: {
      module: shaderModule,
      entryPoint: "fragmentMain",
      targets: [{ format }],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
    ],
  });

  gpuState = {
    bindGroup,
    context,
    device,
    pipeline,
    uniformBuffer,
  };

  device.lost.then((info) => {
    gpuState = undefined;
    showFallback(`The WebGPU device was lost: ${info.message || info.reason}`);
  });

  setStatus("WebGPU ready");
  syncControlLabels();
  requestAnimationFrame(render);
}

for (const control of [controls.speed, controls.warp, controls.energy]) {
  control.addEventListener("input", syncControlLabels);
}

controls.toggleMotion.addEventListener("click", () => {
  paused = !paused;
  controls.toggleMotion.classList.toggle("is-paused", paused);
  controls.toggleMotion.setAttribute("aria-label", paused ? "Resume animation" : "Pause animation");
  controls.toggleMotion.title = paused ? "Resume animation" : "Pause animation";
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
syncControlLabels();
initWebGpu().catch((error) => {
  showFallback(error instanceof Error ? error.message : "WebGPU setup failed.");
});
