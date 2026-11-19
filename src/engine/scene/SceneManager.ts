import * as THREE from 'three';
import type { AssetManager } from '../assets/AssetManager.ts';
import type { PlayerMoveResult, StaticAabbCollider } from '../player/PlayerController.ts';
import type { GraphicsTier } from '../types.ts';
import { populateKozhikodePropsAndFoliage } from '../world/KeralaPropsAndFoliage.ts';
import {
  buildKozhikodeUrbanEnvironment,
  getKozhikodeGroundHeight,
} from '../world/KozhikodeBuildings.ts';
import {
  populateKozhikodeStreetLife,
  type ProvisionalPlayerRig,
} from '../world/ProvisionalVehiclesAndFigures.ts';
import { createKozhikodeTextures, type KozhikodeTexturePack } from '../world/TextureAtlas.ts';

export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => mat.dispose());
      } else {
        mesh.material.dispose();
      }
    }
  });
}

function createMalabarSkyDome(): THREE.Mesh {
  const skyGeo = new THREE.SphereGeometry(280, 28, 18);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x285f94) },
      midColor: { value: new THREE.Color(0x9ec4db) },
      horizonColor: { value: new THREE.Color(0xebd0a8) },
      sunDir: { value: new THREE.Vector3(-0.68, 0.28, -0.68).normalize() },
      sunColor: { value: new THREE.Color(0xffdca3) },
    },
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldDir;
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      void main() {
        float h = clamp(vWorldDir.y, 0.0, 1.0);
        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.28, h));
        col = mix(col, topColor, smoothstep(0.28, 0.85, h));
        float sunAmt = max(dot(normalize(vWorldDir), sunDir), 0.0);
        col += sunColor * (pow(sunAmt, 14.0) * 0.45 + pow(sunAmt, 180.0) * 0.9);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return new THREE.Mesh(skyGeo, skyMat);
}

export class SceneManager {
  readonly scene: THREE.Scene;
  private readonly assetManager: AssetManager;
  private readonly textures: KozhikodeTexturePack;
  private readonly worldGroup = new THREE.Group();
  private readonly colliders: StaticAabbCollider[];
  private readonly playerRig: ProvisionalPlayerRig;
  private debugGrid: THREE.GridHelper | null = null;

  private keyLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private waterMesh!: THREE.Mesh;
  private walkCyclePhase = 0;

  constructor(assetManager: AssetManager, isSoftwareGl: boolean) {
    this.assetManager = assetManager;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xebd0a8);
    this.scene.fog = new THREE.FogExp2(0xe2c39d, 0.0044);

    this.textures = createKozhikodeTextures(this.assetManager);
    this.setupLighting(isSoftwareGl);

    const skyDome = createMalabarSkyDome();
    this.worldGroup.add(skyDome);

    const urban = buildKozhikodeUrbanEnvironment(this.worldGroup, this.textures);
    this.waterMesh = urban.waterMesh;
    this.colliders = urban.colliders;

    populateKozhikodePropsAndFoliage(this.worldGroup, this.textures);
    const streetLife = populateKozhikodeStreetLife(this.worldGroup, this.textures);
    this.playerRig = streetLife.playerRig;

    this.debugGrid = new THREE.GridHelper(180, 36, 0xf59e0b, 0x475569);
    this.debugGrid.position.y = 0.06;
    this.debugGrid.visible = false;
    this.worldGroup.add(this.debugGrid);

    this.scene.add(this.worldGroup);
  }

  getColliders(): StaticAabbCollider[] {
    return this.colliders;
  }

  getGroundHeight(x: number, z: number): number {
    return getKozhikodeGroundHeight(x, z);
  }

  syncPlayerVisual(state: PlayerMoveResult, dt: number): void {
    this.playerRig.group.position.set(state.x, state.y, state.z);
    this.playerRig.group.rotation.y = state.heading;

    if (state.isMoving) {
      const rate = state.isSprinting ? 14 : 9;
      this.walkCyclePhase += dt * rate;
      const swing = Math.sin(this.walkCyclePhase) * (state.isSprinting ? 0.55 : 0.36);
      this.playerRig.legL.rotation.x = swing;
      this.playerRig.legR.rotation.x = -swing;
      this.playerRig.armL.rotation.x = -swing * 0.75;
      this.playerRig.armR.rotation.x = swing * 0.75;
    } else {
      this.walkCyclePhase = 0;
      const damp = 1 - Math.exp(-14 * dt);
      this.playerRig.legL.rotation.x *= 1 - damp;
      this.playerRig.legR.rotation.x *= 1 - damp;
      this.playerRig.armL.rotation.x *= 1 - damp;
      this.playerRig.armR.rotation.x *= 1 - damp;
    }
  }

  setDebugGridVisible(visible: boolean): void {
    if (this.debugGrid) {
      this.debugGrid.visible = visible;
    }
  }

  isDebugGridVisible(): boolean {
    return this.debugGrid?.visible ?? false;
  }

  applyGraphicsTier(tier: GraphicsTier, isSoftwareGl: boolean): void {
    if (tier === 'low') {
      this.scene.fog = new THREE.FogExp2(0xe2c39d, 0.0068);
      this.keyLight.castShadow = false;
    } else {
      const fogDensity = tier === 'medium' ? 0.0046 : 0.0036;
      this.scene.fog = new THREE.FogExp2(0xe2c39d, fogDensity);
      this.keyLight.castShadow = !isSoftwareGl;
    }
  }

  update(dt: number): void {
    if (this.textures.waterNormalMap) {
      this.textures.waterNormalMap.offset.x = (this.textures.waterNormalMap.offset.x + dt * 0.025) % 1;
      this.textures.waterNormalMap.offset.y = (this.textures.waterNormalMap.offset.y + dt * 0.015) % 1;
    }
    if (this.waterMesh) {
      this.waterMesh.visible = true;
    }
  }

  dispose(): void {
    disposeObject3D(this.worldGroup);
    this.scene.clear();
  }

  private setupLighting(isSoftwareGl: boolean): void {
    this.keyLight = new THREE.DirectionalLight(0xffe1b5, 2.5);
    this.keyLight.position.set(-55, 42, -52);
    this.keyLight.castShadow = !isSoftwareGl;
    this.keyLight.shadow.mapSize.width = 2048;
    this.keyLight.shadow.mapSize.height = 2048;
    this.keyLight.shadow.camera.near = 5;
    this.keyLight.shadow.camera.far = 210;
    const d = 78;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.03;
    this.scene.add(this.keyLight);

    this.hemiLight = new THREE.HemisphereLight(0xa5d8ff, 0x8b5a3c, 0.85);
    this.hemiLight.position.set(0, 60, 0);
    this.scene.add(this.hemiLight);

    const bounceLight = new THREE.DirectionalLight(0xbcd7f5, 0.55);
    bounceLight.position.set(48, 22, 42);
    this.scene.add(bounceLight);
  }
}
