import * as THREE from "three";

const StarVertexShader = `
attribute float size;
varying vec3 vColor;

void main() {
    vColor = color; // 'color' is injected by Three.js when vertexColors: true
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (3000.0 / -mvPosition.z); // Size attenuation
    gl_Position = projectionMatrix * mvPosition;
}
`;

const StarFragmentShader = `
varying vec3 vColor;

void main() {
    // Circular particle
    vec2 uv = gl_PointCoord.xy - 0.5;
    float r = length(uv);
    if (r > 0.5) discard;

    // Soft edge
    float glow = 1.0 - (r * 2.0);
    glow = pow(glow, 1.5);

    gl_FragColor = vec4(vColor, glow);
}
`;

export class Stars {
  constructor(count = 10000, radius = 10000) {
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const sizes = [];

    const colorOptions = [
      new THREE.Color(0x9bb0ff), // Blue-ish
      new THREE.Color(0xffffff), // White
      new THREE.Color(0xfff4e8), // Warm White
      new THREE.Color(0xffd27d), // Yellow-Orange
      new THREE.Color(0xffa07a), // Reddish
    ];

    for (let i = 0; i < count; i++) {
      // Uniform distribution on sphere
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);

      const r = radius * (0.8 + Math.random() * 0.4); // Vary depth slightly

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      positions.push(x, y, z);

      const color = colorOptions[Math.floor(Math.random() * colorOptions.length)];
      // Brightness variation
      const brightness = 0.5 + Math.random() * 0.5;
      colors.push(color.r * brightness, color.g * brightness, color.b * brightness);

      // Size variation
      sizes.push(10.0 + Math.random() * 20.0); // Base size for shader
    }

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader: StarVertexShader,
      fragmentShader: StarFragmentShader,
      transparent: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.mesh = new THREE.Points(geometry, material);
  }
}
