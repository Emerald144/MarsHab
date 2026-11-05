import * as THREE from "three";

export class SpaceDust {
  constructor(count, minRadius, maxRadius) {
    this.count = count;
    this.minRadius = minRadius;
    this.maxRadius = maxRadius;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = []; // For drift

    for (let i = 0; i < count; i++) {
      // Random spherical coordinates
      const r = minRadius + Math.random() * (maxRadius - minRadius);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Drift velocity (very subtle)
      velocities.push({
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2,
        z: (Math.random() - 0.5) * 2,
      });
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xaaaaaa,
      size: 3, // Small points
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.Points(geometry, material);
    this.velocities = velocities;
  }

  update(delta) {
    const positions = this.mesh.geometry.attributes.position.array;

    for (let i = 0; i < this.count; i++) {
      const vx = this.velocities[i].x * delta;
      const vy = this.velocities[i].y * delta;
      const vz = this.velocities[i].z * delta;

      positions[i * 3] += vx;
      positions[i * 3 + 1] += vy;
      positions[i * 3 + 2] += vz;

      // Wrap-around logic (simple: if too far, reset, or just let drift?)
      // For simplicity, let them drift. If they drift too far or inside planet, maybe reset?
      // Given the scale and "subtle effect", they won't move much in a session.
      // We will just leave them be for now to keep it simple and fast.
    }

    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}
