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

const SETTINGS_STORAGE_KEY = "plasmaTunnel.settings.v1";
const savedSettings = [
  { key: "speed", control: controls.speed, type: "number" },
  { key: "warp", control: controls.warp, type: "number" },
  { key: "energy", control: controls.energy, type: "number" },
  { key: "palette", control: controls.palette, type: "select" },
];

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

fn tunnelPath(z: f32, t: f32) -> vec2<f32> {
  let scale = 0.5 + 0.5 * uniforms.warp;
  let x = scale * (1.2 * sin(z * 0.11 + t * 0.15) + 0.4 * sin(z * 0.22 - t * 0.25));
  let y = scale * (1.0 * cos(z * 0.09 + t * 0.12) + 0.3 * cos(z * 0.19 - t * 0.20));
  return vec2<f32>(x, y);
}

fn tunnelPathDerivativeZ(z: f32, t: f32) -> vec2<f32> {
  let scale = 0.5 + 0.5 * uniforms.warp;
  let dx = scale * (1.2 * 0.11 * cos(z * 0.11 + t * 0.15) + 0.4 * 0.22 * cos(z * 0.22 - t * 0.25));
  let dy = scale * (-1.0 * 0.09 * sin(z * 0.09 + t * 0.12) - 0.3 * 0.19 * sin(z * 0.19 - t * 0.20));
  return vec2<f32>(dx, dy);
}

fn rotate2(point: vec2<f32>, angle: f32) -> vec2<f32> {
  let s = sin(angle);
  let c = cos(angle);
  return vec2<f32>(
    point.x * c - point.y * s,
    point.x * s + point.y * c
  );
}

fn rippleInterference(wallPoint: vec2<f32>, z: f32, rotation: f32, t: f32) -> vec2<f32> {
  let rotatedWall = rotate2(wallPoint, rotation);
  let point = vec3<f32>(rotatedWall * 1.65, z * 0.20);
  let waveA = sin(length(point - vec3<f32>(1.25, -0.25, 0.20)) * 10.8 - t * 0.42);
  let waveB = sin(length(point - vec3<f32>(-0.65, 1.18, 2.25)) * 12.6 - t * 0.38);
  let waveC = sin(length(point - vec3<f32>(0.18, -1.42, -1.80)) * 8.9 - t * 0.31);
  let waveD = sin(length(point - vec3<f32>(-1.32, -0.72, 4.10)) * 7.4 - t * 0.25);
  let field = (waveA + waveB + waveC + waveD) * 0.25;
  let shimmer = smoothstep(0.28, 0.92, field);
  let shadow = smoothstep(0.36, 0.94, -field);
  return vec2<f32>(shimmer, shadow);
}

@fragment
fn fragmentMain(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let smallestAxis = max(min(uniforms.resolution.x, uniforms.resolution.y), 1.0);
  let time = uniforms.time * uniforms.speed;
  let uv = (fragCoord.xy - uniforms.resolution * 0.5) / smallestAxis;
  let warp = uniforms.warp;
  let fall = time * 3.15;
  let cameraZ = fall;

  let tangent = tunnelPathDerivativeZ(cameraZ, time);
  let eye = -tangent * 1.65;
  let r_eye = length(uv - eye);
  let radius = max(r_eye, 0.015);

  let num_steps = 32;
  let max_z = 35.0;
  let step_size = max_z / f32(num_steps);
  var hit = false;
  var hit_z = max_z;
  
  let camera_center = tunnelPath(cameraZ, time);
  var hit_offset = uv * max_z - (tunnelPath(cameraZ + max_z, time) - camera_center - max_z * tangent);
  
  for (var i = 1; i <= num_steps; i = i + 1) {
    let curr_z = f32(i) * step_size;
    let world_z = cameraZ + curr_z;
    let center = tunnelPath(world_z, time) - camera_center - curr_z * tangent;
    let ray_pos = curr_z * uv;
    let dist = length(ray_pos - center);
    
    if (dist >= 1.0 && !hit) {
      hit = true;
      let prev_z = curr_z - step_size;
      let prev_world_z = cameraZ + prev_z;
      let prev_center = tunnelPath(prev_world_z, time) - camera_center - prev_z * tangent;
      let prev_ray_pos = prev_z * uv;
      let prev_dist = length(prev_ray_pos - prev_center);
      
      let t_interp = clamp((1.0 - prev_dist) / max(dist - prev_dist, 0.001), 0.0, 1.0);
      hit_z = mix(prev_z, curr_z, t_interp);
      let hit_center = mix(prev_center, center, t_interp);
      let hit_ray_pos = hit_z * uv;
      hit_offset = hit_ray_pos - hit_center;
    }
  }
  
  let tunnelDepth = hit_z;
  let worldDepth = cameraZ + hit_z;
  let angle = atan2(hit_offset.y, hit_offset.x);
  let occlusion = smoothstep(8.0, 22.0, hit_z);

  let twist = angle
    + sin(worldDepth * 0.105) * 0.74 * warp
    + cos(radius * 6.60 + time * 0.34) * 0.26 * warp
    + sin(angle * 2.0 + time * 0.28) * 0.18;

  let depthCoord = worldDepth * (0.42 + warp * 0.20);
  let wrapped = vec2<f32>(cos(twist), sin(twist));
  let wrapped3 = vec2<f32>(cos(twist * 3.0 + depthCoord * 0.18), sin(twist * 3.0 + depthCoord * 0.18));

  let broadFlow = fbm(wrapped * 2.35 + vec2<f32>(depthCoord * 0.28, -depthCoord * 0.18));
  let fineFlow = fbm(wrapped3 * 4.20 + vec2<f32>(depthCoord * 0.34, depthCoord * 0.16));
  let smokeAngle = angle * 3.0 + broadFlow * 2.8;
  let smoke = fbm(vec2<f32>(cos(smokeAngle), sin(smokeAngle)) * 2.1 + vec2<f32>(worldDepth * 0.15, worldDepth * 0.26));

  let ribs = 0.5 + 0.5 * sin(worldDepth * (4.45 + warp * 1.35) + broadFlow * 8.1 + sin(twist * 5.0) * 0.78);
  let spiralRibs = 0.5 + 0.5 * sin(twist * 9.0 + worldDepth * 0.76 + fineFlow * 5.4);
  let waveSheets = 0.5 + 0.5 * sin(worldDepth * 0.72 + twist * 4.0 + smoke * 5.8);
  let angularCell = sin(twist * 6.0 + depthCoord * 0.22);
  let cellA = 1.0 - smoothstep(0.030, 0.260, abs(sin(depthCoord * 3.6 + broadFlow * 7.6 + sin(twist * 2.0) * 1.5)));
  let cellB = 1.0 - smoothstep(0.030, 0.240, abs(sin(angularCell * 2.8 - depthCoord * 0.72 + fineFlow * 5.5)));
  let caustics = max(cellA * 0.82, cellB * 0.68) * smoothstep(0.18, 0.88, smoke);
  let darkPockets = smoothstep(0.26, 0.86, fineFlow) * smoothstep(0.18, 0.78, smoke);
  let ribGlow = smoothstep(0.44, 0.99, ribs) * (0.34 + darkPockets * 0.84);
  let spiralGlow = smoothstep(0.60, 1.0, spiralRibs) * (0.26 + broadFlow * 0.48);
  let mist = smoothstep(0.20, 1.0, broadFlow) * smoothstep(0.28, 0.93, waveSheets);
  let rushBands = smoothstep(0.46, 1.0, 0.5 + 0.5 * sin(worldDepth * 1.18 + smoke * 3.2));

  let centerPull = exp(-radius * 7.8);
  let portal = (1.0 - smoothstep(0.030, 0.185, radius)) * (0.92 + 0.08 * sin(time * 1.65)) * occlusion;
  let farGlow = exp(-radius * 13.5) * (0.76 + 0.24 * sin(time * 1.62 + smoke * 1.6)) * occlusion;
  let edgeFade = 1.0 - smoothstep(0.74, 1.34, radius);
  let wallMask = mix(1.0, smoothstep(0.045, 0.22, radius), occlusion) * edgeFade;
  let depthShade = clamp(0.34 + tunnelDepth * 0.040, 0.0, 1.18);
  let outerWisps = smoothstep(0.44, 1.02, radius) * edgeFade * smoothstep(0.44, 0.86, smoke) * smoothstep(0.30, 0.90, broadFlow);
  let wallPoint = hit_offset / max(length(hit_offset), 0.001);
  let curveTangent = tunnelPathDerivativeZ(worldDepth + 1.75, time);
  let curveRotation = atan2(curveTangent.y, curveTangent.x) * 0.72 + time * 0.075;
  let ripples = rippleInterference(wallPoint, worldDepth, curveRotation, time);
  let rippleVisibility = smoothstep(1.2, 8.0, hit_z) * edgeFade;
  let rippleGlow = ripples.x * rippleVisibility;
  let rippleShadow = ripples.y * rippleVisibility;

  let brightness = clamp((ribGlow * 0.74 + spiralGlow * 0.38 + caustics * 0.62 + mist * 0.20 + rushBands * 0.14 + rippleGlow * 0.46 + centerPull * 0.15) * depthShade, 0.0, 1.30);
  let colorIndex = clamp(brightness + fineFlow * 0.10 + farGlow * 0.34 + caustics * 0.13 + rippleGlow * 0.18 - rippleShadow * 0.06, 0.0, 1.0);

  var color = colorFor(colorIndex, uniforms.palette);
  color *= (brightness * wallMask + farGlow * 0.92 + portal * 0.92) * uniforms.energy;
  color += colorFor(0.98, uniforms.palette) * (farGlow * 0.64 + portal * 1.14) * uniforms.energy;
  color += colorFor(0.94, uniforms.palette) * rippleGlow * 0.30 * uniforms.energy;
  color *= 1.0 - rippleShadow * 0.13;
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

function clampControlValue(control, value) {
  const min = Number.parseFloat(control.min);
  const max = Number.parseFloat(control.max);

  if (!Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(Math.max(value, min), max).toFixed(2);
}

function syncControlLabels() {
  controls.speedValue.value = readControlNumber(controls.speed).toFixed(2);
  controls.warpValue.value = readControlNumber(controls.warp).toFixed(2);
  controls.energyValue.value = readControlNumber(controls.energy).toFixed(2);
}

function loadSavedSettings() {
  let parsed;

  try {
    parsed = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}");
  } catch {
    return;
  }

  for (const setting of savedSettings) {
    const savedValue = parsed[setting.key];

    if (setting.type === "number") {
      const clampedValue = clampControlValue(setting.control, Number.parseFloat(savedValue));

      if (clampedValue !== undefined) {
        setting.control.value = clampedValue;
      }
    }

    if (setting.type === "select") {
      const optionExists = Array.from(setting.control.options).some((option) => option.value === String(savedValue));

      if (optionExists) {
        setting.control.value = String(savedValue);
      }
    }
  }
}

function saveSettings() {
  const values = {};

  for (const setting of savedSettings) {
    values[setting.key] = setting.control.value;
  }

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(values));
  } catch {
    setStatus("Settings changed, but local save is unavailable");
  }
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
  control.addEventListener("input", () => {
    syncControlLabels();
    saveSettings();
  });
}

controls.palette.addEventListener("change", saveSettings);

controls.toggleMotion.addEventListener("click", () => {
  paused = !paused;
  controls.toggleMotion.classList.toggle("is-paused", paused);
  controls.toggleMotion.setAttribute("aria-label", paused ? "Resume animation" : "Pause animation");
  controls.toggleMotion.title = paused ? "Resume animation" : "Pause animation";
});

window.addEventListener("resize", resizeCanvas);
loadSavedSettings();
resizeCanvas();
syncControlLabels();
initWebGpu().catch((error) => {
  showFallback(error instanceof Error ? error.message : "WebGPU setup failed.");
});
