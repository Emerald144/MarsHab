import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Lensflare, LensflareElement } from "three/examples/jsm/objects/Lensflare.js";
import { PlanetTerrain } from "./terrain.js";
import { PlanetAtmosphere } from "./atmosphere.js";
import { Stars } from "../skybox/stars.js";
import { Celestials } from "../skybox/celestials.js";
import { SpaceDust } from "../skybox/spacedust.js";
import { PlayerController } from "../player/controller.js";

export function initMarsScene(container) {
  const PLANET_RADIUS = 2000;
  const scene = new THREE.Scene();

  function createFlareTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.2, "rgba(255, 220, 180, 0.6)");
    gradient.addColorStop(0.5, "rgba(217, 83, 30, 0.2)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
    return new THREE.CanvasTexture(canvas);
  }

  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // Camera & Controls
  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    10,
    50000,
  );
  camera.position.set(0, 0, PLANET_RADIUS * 3);

  const orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.minDistance = PLANET_RADIUS + 10;
  orbitControls.maxDistance = PLANET_RADIUS * 10;

  // Lighting
  const sunDir = new THREE.Vector3(1, 0.5, 1).normalize();
  const sunLight = new THREE.DirectionalLight(0xfff0dd, 2.0);
  sunLight.position.copy(sunDir).multiplyScalar(PLANET_RADIUS * 5);
  scene.add(sunLight);

  const textureFlare = createFlareTexture();
  const lensflare = new Lensflare();
  lensflare.addElement(new LensflareElement(textureFlare, 700, 0, sunLight.color));
  lensflare.addElement(new LensflareElement(textureFlare, 60, 0.6));
  lensflare.addElement(new LensflareElement(textureFlare, 70, 0.7));
  lensflare.addElement(new LensflareElement(textureFlare, 120, 0.9));
  sunLight.add(lensflare);

  const ambientLight = new THREE.AmbientLight(0x44221a);
  scene.add(ambientLight);

  // Scene Objects
  const terrain = new PlanetTerrain(PLANET_RADIUS);
  scene.add(terrain.mesh);

  const atmosphere = new PlanetAtmosphere(PLANET_RADIUS);
  scene.add(atmosphere.mesh);

  const stars = new Stars(10000, PLANET_RADIUS * 10);
  scene.add(stars.mesh);

  const celestials = new Celestials(sunDir);
  scene.add(celestials.group);

  const spaceDust = new SpaceDust(1000, PLANET_RADIUS * 2, PLANET_RADIUS * 5);
  scene.add(spaceDust.mesh);

  const player = new PlayerController(camera, renderer.domElement);

  let mode = "ORBIT";
  let lastTime = performance.now();
  let animationFrameId;
  let approach = null;

  function setApproach(progress) {
    if (progress <= 0) return;
    if (!approach) {
      orbitControls.enabled = false;
      if (player.isLocked) player.unlock();
      approach = {
        from: camera.position.clone(),
        target: orbitControls.target.clone(),
        orientation: camera.quaternion.clone(),
        progress: 0,
      };
    }
    approach.progress = Math.min(1, progress);
  }

  function handleKeyDown(e) {
    if (approach) return;
    if (e.code === "KeyP") {
      toggleMode();
    }
  }
  window.addEventListener("keydown", handleKeyDown);

  function toggleMode() {
    if (mode === "ORBIT") {
      mode = "PLAYER";
      orbitControls.enabled = false;
      const dist = camera.position.length();
      if (dist > PLANET_RADIUS + 500) {
        const dir = camera.position.clone().normalize();
        player.position.copy(dir.multiplyScalar(PLANET_RADIUS + 100));
      } else {
        player.position.copy(camera.position);
      }
      player.velocity.set(0, 0, 0);
      player.lock();
    } else {
      mode = "ORBIT";
      player.unlock();
      orbitControls.enabled = true;
      camera.up.set(0, 1, 0);
    }
  }

  function handleResize() {
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  window.addEventListener("resize", handleResize);

  // Animation Loop
  function animate() {
    animationFrameId = requestAnimationFrame(animate);

    const time = performance.now();
    const delta = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    const sec = time / 1000;

    const rotationSpeed = 0.02;
    terrain.mesh.rotation.y = sec * rotationSpeed;
    atmosphere.mesh.rotation.y = sec * rotationSpeed;

    if (mode === "ORBIT") {
      if (!approach) orbitControls.update();
      const lightSpeed = 0.015;
      sunDir.x = Math.cos(sec * lightSpeed);
      sunDir.z = Math.sin(sec * lightSpeed);
      sunDir.normalize();
      sunLight.position.copy(sunDir).multiplyScalar(PLANET_RADIUS * 5);
    } else {
      if (!approach) player.update(delta, terrain);
      const lightSpeed = 0.015;
      sunDir.x = Math.cos(sec * lightSpeed);
      sunDir.z = Math.sin(sec * lightSpeed);
      sunDir.normalize();
      sunLight.position.copy(sunDir).multiplyScalar(PLANET_RADIUS * 5);
    }

    atmosphere.update(sunDir);
    celestials.update(sec);
    spaceDust.update(delta);

    if (approach) {
      const t = approach.progress;
      const eased = t * t * (3 - 2 * t);
      const distance = approach.from.length();
      const destination = Math.min(distance, PLANET_RADIUS + 160);
      camera.position
        .copy(approach.from)
        .normalize()
        .multiplyScalar(THREE.MathUtils.lerp(distance, destination, eased));
      camera.lookAt(approach.target.clone().multiplyScalar(1 - eased));
      camera.quaternion.slerpQuaternions(approach.orientation, camera.quaternion.clone(), eased);
    }

    renderer.render(scene, camera);
  }
  animate();

  // Cleanup function when component unmounts
  return Object.assign(
    () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
      orbitControls.dispose();
      player.dispose();
      scene.traverse((object) => {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.filter(Boolean).forEach((material) => {
          Object.values(material).forEach((value) => {
            if (value?.isTexture) value.dispose();
          });
          material.dispose();
        });
      });
      lensflare.dispose();
      textureFlare.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    },
    { setApproach },
  );
}
