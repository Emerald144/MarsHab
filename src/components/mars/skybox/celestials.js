import * as THREE from "three";
import { createNoise3D } from "simplex-noise";

export class Celestials {
  constructor(sunDir) {
    this.group = new THREE.Group();

    // Moon
    this.createMoon();

    // Other Planets
    this.createPlanet(new THREE.Vector3(5000, 2000, -5000), 0xff5500, 200); // Mars-ish
    this.createPlanet(new THREE.Vector3(-6000, -1000, 4000), 0x00ffaa, 400); // Gas giant-ish
  }

  createMoon() {
    const geometry = new THREE.SphereGeometry(200, 64, 64);

    // Crater texture via noise
    const size = 512;
    const data = new Uint8Array(size * size * 4);
    const noise3D = createNoise3D();

    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const u = i / size;
        const v = j / size;

        // Map to sphere
        const theta = u * Math.PI * 2;
        const phi = v * Math.PI;
        const x = Math.sin(phi) * Math.cos(theta);
        const y = Math.cos(phi);
        const z = Math.sin(phi) * Math.sin(theta);

        // FBM
        let n = 0;
        n += noise3D(x * 5, y * 5, z * 5) * 0.5;
        n += noise3D(x * 10, y * 10, z * 10) * 0.25;
        n += noise3D(x * 20, y * 20, z * 20) * 0.125;

        // Craters (inverted noise peaks)
        let val = 0.5 + n * 0.5;

        // Make craters dark
        // If noise is high, make it dark?
        // Or cellular noise?
        // Simple approach: Contrast

        val = Math.pow(val, 3.0); // Contrast

        const cVal = Math.floor(val * 200 + 50);

        const index = (i + j * size) * 4;
        data[index] = cVal;
        data[index + 1] = cVal;
        data[index + 2] = cVal;
        data[index + 3] = 255;
      }
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.9,
      color: 0x666666, // Darker grey base
    });

    this.moon = new THREE.Mesh(geometry, material);
    this.moon.position.set(3000, 1000, 3000);
    this.moon.castShadow = true;
    this.moon.receiveShadow = true; // From Sun
    this.group.add(this.moon);
  }

  createPlanet(pos, color, radius) {
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.5,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(pos);
    this.group.add(mesh);
  }

  update(time) {
    // Orbit moon?
    const orbitSpeed = 0.1;
    const x = Math.cos(time * orbitSpeed) * 3000;
    const z = Math.sin(time * orbitSpeed) * 3000;
    this.moon.position.x = x;
    this.moon.position.z = z;

    // Rotate moon (tidal lock or spin)
    this.moon.rotation.y += 0.001;
  }
}
