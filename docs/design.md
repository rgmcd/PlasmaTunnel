# Plasma Tunnel Design

## Goal

Plasma Tunnel is a dependency-free WebGPU web app that recreates the feeling of an old Mac OS X plasma tunnel screensaver. The experience should feel like falling through a dark, icy, organic tunnel toward a bright blue-white eye.

The visual target is not a clean neon tube. It should look smoky, ribbed, and unstable, with black void pockets, caustic plasma streaks, and a luminous center pull.

## App Structure

- `index.html` defines the canvas, HUD, controls, fallback message, and module script.
- `styles.css` handles the full-window layout and compact translucent HUD.
- `src/main.js` owns WebGPU setup, shader source, animation timing, controls, resizing, and fallback behavior.

The app intentionally has no build step or package dependency. It runs as static files served over localhost.

## Runtime Flow

1. The page loads a full-screen `<canvas>`.
2. `src/main.js` checks for `navigator.gpu`.
3. The app requests a high-performance adapter and device with timeout guards.
4. A WebGPU render pipeline is created from a WGSL full-screen triangle shader.
5. Each frame writes a small uniform buffer and draws one triangle covering the viewport.
6. If WebGPU is missing, unavailable, or times out, the fallback panel explains the issue.

## Controls

The HUD exposes four user-facing controls:

- `Fall`: Controls animation speed and the perceived rate of forward motion.
- `Depth`: Controls tunnel warp/depth intensity.
- `Glow`: Controls plasma brightness.
- `Palette`: Selects `Classic`, `Aqua`, or `Ember`.

The pause/resume button toggles animation time accumulation without tearing down WebGPU state.

## WebGPU Data Model

The shader uses one uniform buffer:

```wgsl
struct Uniforms {
  resolution: vec2<f32>,
  time: f32,
  speed: f32,
  warp: f32,
  palette: f32,
  energy: f32,
  pad: f32,
};
```

The JavaScript writes this buffer each frame as eight `f32` values. The buffer size is 32 bytes.

## Shader Design

The shader renders a procedural tunnel from fragment coordinates:

- Screen coordinates are normalized by the smaller viewport axis.
- Polar coordinates are computed with `radius`, `angle`, and `tunnelDepth = 1.0 / radius`.
- `fall = time * 2.05` drives the depth phase so surface features stream outward from the center.
- `twist` combines depth waves, radius waves, and angular waves to make the tube feel unstable.
- Angle-driven noise uses wrapped `sin/cos` coordinates to avoid a visible seam at the `atan2` wrap line.

The main texture layers are:

- `broadFlow`: Large smoky movement.
- `fineFlow`: Smaller organic detail.
- `smoke`: Dark pocket modulation.
- `ribs` and `spiralRibs`: Ring and spiral wall structure.
- `cellA` and `cellB`: Caustic streak networks.
- `rushBands`: Subtle forward-motion bands.
- `portal` and `farGlow`: Bright eye at the tunnel center.

## Palettes

`Classic` is the primary target. It ramps from black-blue through violet and saturated blue into icy white.

`Aqua` and `Ember` are alternate looks for quick exploration. They are not the main design target.

## Motion Feel

The default motion should read as falling into the tunnel:

- Wall features move outward from the center.
- The bright center remains the perceptual vanishing point.
- Ring and caustic layers drift at slightly different phase rates.
- Camera drift is gentle, not enough to make the eye feel disconnected from the viewer.

## Bend Direction

Future bend experiments should make the viewer feel aligned with a curving path, not like chasing a separate moving target.

Preferred approach:

- Define a smooth pseudo-random path as a function of depth and time.
- Estimate the camera position and forward tangent along that path.
- Subtract the camera path and tangent from each sampled depth slice.
- Render only the remaining curvature into the tunnel walls.
- Keep the eye mostly ahead of the camera, with bends visible through wall shear, shading, and offset ribs.

Avoid:

- Moving the far eye independently across the screen.
- Applying a large offset only to the center glow.
- Using raw, non-periodic angular noise that creates seams.
- Making the bend amplitude so large that the tunnel no longer reads as a continuous tube.

## Verification

Useful checks after shader changes:

```powershell
node --check src\main.js
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:56323/ -TimeoutSec 5
```

Headless Edge is useful for page startup and fallback checks, but it often does not provide a real WebGPU adapter in this environment. Visual WebGPU verification should be done in a normal Chrome or Edge tab on localhost.
