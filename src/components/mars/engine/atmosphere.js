import * as THREE from "three";

const AtmosphereVertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vViewPosition;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const AtmosphereFragmentShader = `
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vViewPosition;

uniform vec3 uColor;
uniform vec3 uSunDirection;
uniform float uAtmosphereRadius;
uniform float uPlanetRadius;

void main() {
  vec3 viewDir = normalize(vViewPosition);
  vec3 normal = normalize(vNormal);

  // Fresnel / Limb calculation for edge glow
  float viewDot = dot(viewDir, normal);
  float edge = 1.0 - max(viewDot, 0.0);

  // Softer rim falloff
  float rim = pow(edge, 3.0);

  // Sun influence (day/night)
  float sunDot = dot(normal, uSunDirection);
  float sunFactor = smoothstep(-0.2, 0.4, sunDot);

  vec3 color = uColor;

  // Martian Blue Sunset / Twilight Effect at the terminator
  if (sunDot > -0.2 && sunDot < 0.2) {
     vec3 sunsetBlue = vec3(0.2, 0.5, 0.8);
     color = mix(sunsetBlue, uColor, smoothstep(-0.2, 0.2, sunDot));
  }

  // Subtle dust haze
  float haze = pow(edge, 1.5) * 0.3;

  // Softer alpha blending to prevent harsh borders
  float alpha = (rim * 0.4 + haze * 0.1) * sunFactor;

  // Minor night-side rim bleed
  alpha += rim * 0.03;

  alpha = clamp(alpha, 0.0, 1.0);

  gl_FragColor = vec4(color, alpha);
}
`;

export class PlanetAtmosphere {
  constructor(radius = 1000) {
    // Hugs the planet closely (1.5% larger instead of 5%)
    this.geometry = new THREE.SphereGeometry(radius * 1.015, 128, 64);

    this.material = new THREE.ShaderMaterial({
      vertexShader: AtmosphereVertexShader,
      fragmentShader: AtmosphereFragmentShader,
      uniforms: {
        uColor: { value: new THREE.Color(0xe8946a) },
        uSunDirection: { value: new THREE.Vector3(1, 0.5, 0).normalize() },
        uAtmosphereRadius: { value: radius * 1.015 },
        uPlanetRadius: { value: radius },
      },
      transparent: true,
      side: THREE.BackSide, // BackSide renders inner shell cleanly without clipping
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
  }

  update(sunDir) {
    this.material.uniforms.uSunDirection.value.copy(sunDir);
  }
}
