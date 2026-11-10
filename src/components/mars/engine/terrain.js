import * as THREE from "three";
import marsColorImg from "../../../assets/mars/mars-color.jpg";
import marsBumpImg from "../../../assets/mars/mars-bump.jpg";

export class PlanetTerrain {
  constructor(radius = 1000) {
    this.radius = radius;

    this.geometry = new THREE.SphereGeometry(radius, 128, 64);

    const textureLoader = new THREE.TextureLoader();
    const marsTexture = textureLoader.load(marsColorImg);
    const bumpTexture = textureLoader.load(marsBumpImg);

    marsTexture.wrapS = THREE.RepeatWrapping;
    marsTexture.wrapT = THREE.ClampToEdgeWrapping;
    marsTexture.colorSpace = THREE.SRGBColorSpace;
    marsTexture.anisotropy = 8;

    this.material = new THREE.MeshStandardMaterial({
      map: marsTexture,
      bumpMap: bumpTexture,
      bumpScale: 5,
      roughness: 0.95,
      metalness: 0,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
  }

  getSurfaceHeight(x, y, z) {
    return this.radius;
  }
}
