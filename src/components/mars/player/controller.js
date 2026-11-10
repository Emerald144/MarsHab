import * as THREE from "three";

export class PlayerController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.position = new THREE.Vector3(0, 1200, 0); // Start high
    this.velocity = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.forward = new THREE.Vector3(0, 0, -1);

    // State
    this.isLocked = false;
    this.keys = {
      w: false,
      a: false,
      s: false,
      d: false,
      space: false,
      shift: false,
    };

    // Config
    this.speed = 50.0;
    this.jumpForce = 80.0;
    this.gravity = 100.0; // Pull
    this.height = 10.0; // Increased Player height to avoid clipping

    // Mouse Look
    this.euler = new THREE.Euler(0, 0, 0, "YXZ");
    this.sensitivity = 0.002;

    this.initEvents();
  }

  initEvents() {
    this.onKeyDown = (e) => this.onKey(e, true);
    this.onKeyUp = (e) => this.onKey(e, false);
    this.onMove = (e) => this.onMouseMove(e);
    this.onLockChange = () => {
      this.isLocked = document.pointerLockElement === this.domElement;
    };
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMove);
    document.addEventListener("pointerlockchange", this.onLockChange);
  }

  dispose() {
    if (this.isLocked) this.unlock();
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMove);
    document.removeEventListener("pointerlockchange", this.onLockChange);
  }

  onKey(e, pressed) {
    switch (e.code) {
      case "KeyW":
        this.keys.w = pressed;
        break;
      case "KeyS":
        this.keys.s = pressed;
        break;
      case "KeyA":
        this.keys.a = pressed;
        break;
      case "KeyD":
        this.keys.d = pressed;
        break;
      case "Space":
        this.keys.space = pressed;
        break;
      case "ShiftLeft":
        this.keys.shift = pressed;
        break;
    }
  }

  onMouseMove(e) {
    if (!this.isLocked) return;

    // Rotate local view
    this.euler.y -= e.movementX * this.sensitivity;
    this.euler.x -= e.movementY * this.sensitivity;

    // Clamp pitch
    this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
  }

  lock() {
    this.domElement.requestPointerLock();
    // Reset pitch to slightly downward to see terrain (approx 15 degrees)
    this.euler.x = -0.25;
  }

  unlock() {
    document.exitPointerLock();
  }

  update(delta, terrain) {
    if (!this.isLocked) return;

    // 1. Calculate Gravity Direction (Center of planet)
    // Planet center is 0,0,0
    const planetCenter = new THREE.Vector3(0, 0, 0);
    const upVec = this.position.clone().sub(planetCenter).normalize();

    // 2. Apply Gravity
    this.velocity.add(upVec.clone().multiplyScalar(-this.gravity * delta));

    // 3. Input Movement
    // Get camera basis
    const camForward = new THREE.Vector3();
    this.camera.getWorldDirection(camForward);

    const camRight = new THREE.Vector3();
    camRight.crossVectors(camForward, upVec).normalize();

    // Re-calculate true forward tangent
    const forwardTangent = new THREE.Vector3();
    forwardTangent.crossVectors(upVec, camRight).normalize();

    const inputDir = new THREE.Vector3();
    if (this.keys.w) inputDir.add(forwardTangent);
    if (this.keys.s) inputDir.sub(forwardTangent);
    if (this.keys.d) inputDir.add(camRight);
    if (this.keys.a) inputDir.sub(camRight);

    if (inputDir.length() > 0) inputDir.normalize();

    // Apply move force
    const moveSpeed = this.keys.shift ? this.speed * 3 : this.speed; // Jetpack/Sprint
    if (this.keys.shift) {
      // Jetpack Up (Fly) - optional feature, let's keep jump boost instead or fly?
      // User mentioned "iter01_player_jetpack.png" so maybe fly?
      // The code was: add upVec * speed. This is flying up.
      this.velocity.add(upVec.clone().multiplyScalar(this.speed * 2 * delta));
    }

    // Ground movement
    // Friction/Damping on tangent velocity
    // Separate velocity into vertical (radial) and tangent
    const velVertical = upVec.clone().multiplyScalar(this.velocity.dot(upVec));
    const velTangent = this.velocity.clone().sub(velVertical);

    // Accelerate tangent
    velTangent.add(inputDir.multiplyScalar(moveSpeed * 5 * delta));

    // Damp tangent
    velTangent.multiplyScalar(1.0 - 5.0 * delta); // Friction

    // Recombine
    this.velocity.copy(velVertical).add(velTangent);

    // Jump
    if (this.keys.space && this.onGround) {
      this.velocity.add(upVec.clone().multiplyScalar(this.jumpForce));
      this.onGround = false;
    }

    // 4. Integrate Position
    this.position.add(this.velocity.clone().multiplyScalar(delta));

    // 5. Collision / Ground Clamp
    const terrainHeight = terrain.getSurfaceHeight(
      this.position.x,
      this.position.y,
      this.position.z,
    );
    const dist = this.position.length();

    // Check ocean level (radius)? Terrain might be below ocean.
    const oceanRadius = terrain.radius; // Assuming 1000
    const minHeight = Math.max(terrainHeight, oceanRadius); // Walk on water? Or swim?
    // Let's stick to terrain surface for now, but if ocean is higher, maybe swim?
    // Simplest: Collide with max(terrain, ocean) if we want walking on water.
    // Or just terrain.
    const groundHeight = terrainHeight;

    if (dist < groundHeight + this.height) {
      // Hit ground
      this.position.normalize().multiplyScalar(groundHeight + this.height);

      // Kill radial velocity if falling
      const vRadial = this.velocity.dot(upVec);
      if (vRadial < 0) {
        this.velocity.sub(upVec.clone().multiplyScalar(vRadial));
        this.onGround = true;
      }
    } else {
      this.onGround = false;
    }

    // 6. Update Camera
    this.camera.position.copy(this.position);

    // Orient camera Up to planet Up
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), upVec);
    const qLocal = new THREE.Quaternion().setFromEuler(this.euler);
    this.camera.quaternion.multiplyQuaternions(q, qLocal);
  }
}
