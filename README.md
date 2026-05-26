# Plasma Tunnel

A dependency-free WebGPU plasma tunnel built from a full-screen WGSL shader. The default shader is tuned toward the old Mac OS X Plasma Tunnel screensaver look: icy blue-white plasma, dark gaps, smoky ribbing, and a soft tunnel pull.

## View Online

Open the live version at <https://plasma-tunnel.vercel.app/>.

## Run

Serve the folder over localhost, then open the page in a WebGPU-capable browser:

```powershell
python -m http.server 8080 --bind 127.0.0.1
```

Then visit `http://127.0.0.1:8080/`.

## Files

- `index.html` contains the app shell and controls.
- `styles.css` handles the full-screen layout.
- `src/main.js` initializes WebGPU, compiles the shader, and drives animation.

## License

MIT
