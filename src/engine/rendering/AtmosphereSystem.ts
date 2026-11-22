import * as THREE from 'three';
import type { GraphicsPresetProfile } from '../assets/AssetRegistry.ts';
import type { TimeOfDayPreset } from '../types.ts';

const _sunDir = new THREE.Vector3();
const _skyTop = new THREE.Color();
const _skyMid = new THREE.Color();
const _skyHorizon = new THREE.Color();
const _sunColor = new THREE.Color();
const _fogColor = new THREE.Color();
const _hemiSky = new THREE.Color();
const _hemiGround = new THREE.Color();

export interface AtmosphereState {
  hours: number;
  clockFormatted: string;
  weatherLabel: string;
  nightGlowFactor: number;
  exposure: number;
}

export class AtmosphereSystem {
  readonly skyDome: THREE.Mesh;
  readonly mistBand: THREE.Mesh;
  readonly sunLight: THREE.DirectionalLight;
  readonly hemiLight: THREE.HemisphereLight;
  readonly bounceLight: THREE.DirectionalLight;

  private readonly skyUniforms: {
    topColor: { value: THREE.Color };
    midColor: { value: THREE.Color };
    horizonColor: { value: THREE.Color };
    sunDir: { value: THREE.Vector3 };
    sunColor: { value: THREE.Color };
    nightAmount: { value: number };
    uCloudTime: { value: number };
  };

  private readonly mistMat: THREE.MeshBasicMaterial;
  private preset: TimeOfDayPreset = 'golden';
  private hours = 17.55;
  private nightGlowFactor = 0.25;
  private exposure = 1.1;
  private currentShadowSize = 1024;
  private shadowsEnabled = true;

  constructor(scene: THREE.Scene, isSoftwareGl: boolean, preset: GraphicsPresetProfile) {
    this.skyUniforms = {
      topColor: { value: new THREE.Color(0x285f94) },
      midColor: { value: new THREE.Color(0x9ec4db) },
      horizonColor: { value: new THREE.Color(0xebd0a8) },
      sunDir: { value: new THREE.Vector3(-0.68, 0.26, -0.68).normalize() },
      sunColor: { value: new THREE.Color(0xffdca3) },
      nightAmount: { value: 0 },
      uCloudTime: { value: 0 },
    };

    const skyGeo = new THREE.SphereGeometry(520, 32, 20);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.skyUniforms,
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
        uniform float nightAmount;
        uniform float uCloudTime;

        float hash31(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float valueNoise(vec2 uv) {
          vec2 i = floor(uv);
          vec2 f = fract(uv);
          vec2 u = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        float fbmClouds(vec2 uv) {
          float sum = 0.0;
          sum += 0.55 * valueNoise(uv);
          sum += 0.30 * valueNoise(uv * 2.07 + 13.1);
          sum += 0.15 * valueNoise(uv * 4.13 + 7.7);
          return sum;
        }

        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.28, h));
          col = mix(col, topColor, smoothstep(0.28, 0.88, h));

          float sunAmt = max(dot(dir, sunDir), 0.0);
          col += sunColor * (pow(sunAmt, 10.0) * 0.36 + pow(sunAmt, 220.0) * 1.1);

          // Drifting Kerala coastal cumulus clouds
          if (h > 0.04) {
            vec2 cloudUv = dir.xz / (h + 0.18) * 1.45 + vec2(uCloudTime * 0.012, uCloudTime * 0.004);
            float n = fbmClouds(cloudUv);
            float cloudMask = smoothstep(0.56, 0.82, n) * smoothstep(0.04, 0.22, h) * (1.0 - smoothstep(0.75, 0.98, h));
            vec3 cloudTint = mix(vec3(0.98, 0.96, 0.93), sunColor * 1.05, 0.35 + pow(sunAmt, 4.0) * 0.4);
            cloudTint = mix(cloudTint, vec3(0.14, 0.2, 0.32), nightAmount * 0.86);
            col = mix(col, cloudTint, cloudMask * mix(0.62, 0.22, nightAmount));
          }

          // Subtle Malabar twilight & night starfield
          if (nightAmount > 0.05 && h > 0.08) {
            float starCell = hash31(floor(dir * 260.0));
            float star = smoothstep(0.9965, 0.9998, starCell) * smoothstep(0.08, 0.4, h);
            col += vec3(0.85, 0.9, 1.0) * star * nightAmount * 0.9;
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.skyDome.frustumCulled = false;
    scene.add(this.skyDome);

    // Lightweight volumetric-style coastal horizon haze band along the Arabian Sea
    const mistGeo = new THREE.PlaneGeometry(520, 34);
    this.mistMat = new THREE.MeshBasicMaterial({
      color: 0xf4d8b8,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.mistBand = new THREE.Mesh(mistGeo, this.mistMat);
    this.mistBand.position.set(-155, 11, 0);
    this.mistBand.rotation.y = Math.PI / 2;
    scene.add(this.mistBand);

    // Primary Sun/Moon Key Light
    this.sunLight = new THREE.DirectionalLight(0xffe1b5, 2.5);
    this.sunLight.position.set(-60, 42, -55);
    this.sunLight.shadow.camera.near = 4;
    this.sunLight.shadow.camera.far = 230;
    this.sunLight.shadow.bias = -0.00045;
    this.sunLight.shadow.normalBias = 0.025;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    this.hemiLight = new THREE.HemisphereLight(0xa5d8ff, 0x8b5a3c, 0.85);
    this.hemiLight.position.set(0, 80, 0);
    scene.add(this.hemiLight);

    this.bounceLight = new THREE.DirectionalLight(0xbcd7f5, 0.55);
    this.bounceLight.position.set(54, 24, 46);
    scene.add(this.bounceLight);

    scene.fog = new THREE.FogExp2(0xe2c39d, 0.004);
    this.applyGraphicsPreset(preset, isSoftwareGl);
    this.evaluateLighting(scene, preset);
  }

  setTimeOfDayPreset(preset: TimeOfDayPreset): void {
    this.preset = preset;
    if (preset === 'dawn') this.hours = 6.25;
    else if (preset === 'noon') this.hours = 12.5;
    else if (preset === 'golden') this.hours = 17.6;
    else if (preset === 'night') this.hours = 21.5;
  }

  getTimeOfDayHours(): number {
    return this.hours;
  }

  getClockFormatted(): string {
    const wrapped = ((this.hours % 24) + 24) % 24;
    const hh = Math.floor(wrapped);
    const mm = Math.floor((wrapped - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  getWeatherLabel(): string {
    const wrapped = ((this.hours % 24) + 24) % 24;
    if (wrapped >= 5.2 && wrapped < 7.8) return 'Dawn Mist';
    if (wrapped >= 7.8 && wrapped < 16.0) return 'Clear Coastal';
    if (wrapped >= 16.0 && wrapped < 19.0) return 'Golden Haze';
    if (wrapped >= 19.0 && wrapped < 20.5) return 'Evening Breeze';
    return 'Clear Night';
  }

  getState(): AtmosphereState {
    return {
      hours: this.hours,
      clockFormatted: this.getClockFormatted(),
      weatherLabel: this.getWeatherLabel(),
      nightGlowFactor: this.nightGlowFactor,
      exposure: this.exposure,
    };
  }

  applyGraphicsPreset(preset: GraphicsPresetProfile, isSoftwareGl: boolean): void {
    this.shadowsEnabled = !isSoftwareGl && preset.shadowsEnabled;
    this.sunLight.castShadow = this.shadowsEnabled;

    const targetSize = preset.shadowMapSize;
    if (this.currentShadowSize !== targetSize) {
      this.currentShadowSize = targetSize;
      this.sunLight.shadow.mapSize.set(targetSize, targetSize);
      this.sunLight.shadow.map?.dispose();
      this.sunLight.shadow.map = null;
    }

    const extent = preset.tier === 'ultra' ? 95 : preset.tier === 'high' ? 84 : 68;
    this.sunLight.shadow.camera.left = -extent;
    this.sunLight.shadow.camera.right = extent;
    this.sunLight.shadow.camera.top = extent;
    this.sunLight.shadow.camera.bottom = -extent;
    this.sunLight.shadow.radius = preset.shadowRadius;
    this.sunLight.shadow.camera.updateProjectionMatrix();
  }

  update(
    dt: number,
    scene: THREE.Scene,
    focusX: number,
    focusZ: number,
    preset: GraphicsPresetProfile,
  ): void {
    this.skyUniforms.uCloudTime.value += Math.max(0, dt);
    if (this.preset === 'cycle') {
      // 1 full day every ~6 real-time minutes when cycle mode is active
      this.hours = (this.hours + dt * (24 / 360)) % 24;
    }

    // Anchor sky & shadow frustum onto active player/camera zone (snap shadow texels to prevent shimmer)
    this.skyDome.position.set(focusX, 0, focusZ);
    this.mistBand.position.set(focusX - 185, 11, focusZ);

    const snap = 2.0;
    const snappedX = Math.round(focusX / snap) * snap;
    const snappedZ = Math.round(focusZ / snap) * snap;

    this.evaluateLighting(scene, preset, snappedX, snappedZ);
  }

  private evaluateLighting(
    scene: THREE.Scene,
    preset: GraphicsPresetProfile,
    anchorX = 0,
    anchorZ = 0,
  ): void {
    // Solar elevation curve: sunrise ~6h, zenith ~12.5h, sunset ~18.5h
    const solarAngle = ((this.hours - 6.0) / 12.5) * Math.PI;
    const elevation = Math.sin(solarAngle);
    const azimuth = -0.75 + ((this.hours - 6.0) / 12.5) * 1.1;

    const isDay = elevation > -0.05;
    const activeElev = isDay ? Math.max(0.14, elevation) : 0.42;
    const sunX = -Math.cos(azimuth) * Math.cos(activeElev);
    const sunY = Math.sin(activeElev);
    const sunZ = -Math.sin(azimuth) * Math.cos(activeElev);
    _sunDir.set(sunX, sunY, sunZ).normalize();

    this.sunLight.position.set(
      anchorX + _sunDir.x * 95,
      Math.max(18, _sunDir.y * 95),
      anchorZ + _sunDir.z * 95,
    );
    this.sunLight.target.position.set(anchorX, 0, anchorZ);
    this.sunLight.target.updateMatrixWorld();

    // Daylight / Golden Hour / Twilight / Night weights
    const daylight = THREE.MathUtils.smoothstep(elevation, -0.08, 0.35);
    const goldenWeight =
      THREE.MathUtils.smoothstep(elevation, -0.1, 0.15) *
      (1 - THREE.MathUtils.smoothstep(elevation, 0.28, 0.72));
    const nightWeight = 1 - THREE.MathUtils.smoothstep(elevation, -0.18, 0.12);

    this.nightGlowFactor = THREE.MathUtils.clamp(nightWeight * 1.15 + goldenWeight * 0.25, 0, 1);

    // Blend Sky Palette
    _skyTop.setHex(0x091326).lerp(new THREE.Color(0x1f5f9e), daylight);
    _skyMid.setHex(0x16253f).lerp(new THREE.Color(0x88bddc), daylight);
    _skyHorizon.setHex(0x1e2c44).lerp(new THREE.Color(0xcce2ec), daylight);

    if (goldenWeight > 0.01) {
      _skyTop.lerp(new THREE.Color(0x28568a), goldenWeight * 0.7);
      _skyMid.lerp(new THREE.Color(0xd5a482), goldenWeight * 0.55);
      _skyHorizon.lerp(new THREE.Color(0xf2be85), goldenWeight * 0.92);
    }

    _sunColor
      .setHex(0x8db2e0)
      .lerp(new THREE.Color(0xfff1d6), daylight)
      .lerp(new THREE.Color(0xffb86b), goldenWeight * 0.85);

    _fogColor.copy(_skyHorizon);

    _hemiSky
      .setHex(0x273c63)
      .lerp(new THREE.Color(0x9fd3f7), daylight)
      .lerp(new THREE.Color(0xffcfa0), goldenWeight * 0.35);
    _hemiGround
      .setHex(0x141821)
      .lerp(new THREE.Color(0x7d573e), daylight);

    this.skyUniforms.topColor.value.copy(_skyTop);
    this.skyUniforms.midColor.value.copy(_skyMid);
    this.skyUniforms.horizonColor.value.copy(_skyHorizon);
    this.skyUniforms.sunDir.value.copy(_sunDir);
    this.skyUniforms.sunColor.value.copy(_sunColor);
    this.skyUniforms.nightAmount.value = nightWeight;

    this.sunLight.color.copy(_sunColor);
    this.sunLight.intensity = THREE.MathUtils.lerp(0.65, 2.8, daylight) + goldenWeight * 0.35;
    this.hemiLight.color.copy(_hemiSky);
    this.hemiLight.groundColor.copy(_hemiGround);
    this.hemiLight.intensity = THREE.MathUtils.lerp(0.45, 0.95, daylight);
    this.bounceLight.intensity = THREE.MathUtils.lerp(0.2, 0.58, daylight);

    scene.background = _fogColor.clone();
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(_fogColor);
      const baseDensity = THREE.MathUtils.lerp(0.0046, 0.0028, daylight) + goldenWeight * 0.0008;
      scene.fog.density = baseDensity * preset.fogDensityMultiplier;
    }

    this.mistMat.color.copy(_skyHorizon);
    this.mistMat.opacity = (0.08 + goldenWeight * 0.12) * (1 - nightWeight * 0.55);

    this.exposure = THREE.MathUtils.lerp(0.95, 1.08, daylight) + goldenWeight * 0.08;
    scene.environmentIntensity = preset.envMapIntensity * THREE.MathUtils.lerp(0.5, 1.0, daylight);
  }

  dispose(): void {
    this.skyDome.geometry.dispose();
    (this.skyDome.material as THREE.Material).dispose();
    this.mistBand.geometry.dispose();
    this.mistMat.dispose();
  }
}
