import * as THREE from 'three';
import type { AssetManager } from '../assets/AssetManager.ts';
import { createKozhikodeTextures, type KozhikodeTexturePack } from '../world/TextureAtlas.ts';

export class MaterialLibrary {
  readonly textures: KozhikodeTexturePack;

  readonly asphaltMat: THREE.MeshStandardMaterial;
  readonly plainAsphaltMat: THREE.MeshStandardMaterial;
  readonly sidewalkMat: THREE.MeshStandardMaterial;
  readonly lateriteMat: THREE.MeshStandardMaterial;
  readonly grassMat: THREE.MeshStandardMaterial;
  readonly sandMat: THREE.MeshStandardMaterial;
  readonly terracottaRoofMat: THREE.MeshStandardMaterial;
  readonly stripeMat: THREE.MeshStandardMaterial;

  readonly seaWaterMat: THREE.MeshPhysicalMaterial;
  readonly tankWaterMat: THREE.MeshPhysicalMaterial;

  readonly shopGlassNightMat: THREE.MeshPhysicalMaterial;
  readonly streetLampBulbMat: THREE.MeshStandardMaterial;
  readonly vehicleHeadlampMat: THREE.MeshStandardMaterial;

  readonly palmTrunkMat: THREE.MeshStandardMaterial;
  readonly palmFrondMat: THREE.MeshStandardMaterial;
  readonly shadeTrunkMat: THREE.MeshStandardMaterial;
  readonly shadeLeafMat: THREE.MeshStandardMaterial;

  // Pooled urban architecture & street infrastructure materials
  readonly facadeWarmMat: THREE.MeshStandardMaterial;
  readonly facadeCreamMat: THREE.MeshStandardMaterial;
  readonly facadeTealMat: THREE.MeshStandardMaterial;
  readonly facadeApartmentMat: THREE.MeshStandardMaterial;
  readonly facadeHospitalMat: THREE.MeshStandardMaterial;
  readonly facadeOfficeMat: THREE.MeshStandardMaterial;

  readonly stuccoCreamMat: THREE.MeshStandardMaterial;
  readonly stuccoWarmMat: THREE.MeshStandardMaterial;
  readonly stuccoMintMat: THREE.MeshStandardMaterial;
  readonly stuccoOchreMat: THREE.MeshStandardMaterial;
  readonly stuccoSlateMat: THREE.MeshStandardMaterial;

  readonly concretePillarMat: THREE.MeshStandardMaterial;
  readonly shutterSteelMat: THREE.MeshStandardMaterial;
  readonly darkIronMat: THREE.MeshStandardMaterial;
  readonly parapetMat: THREE.MeshStandardMaterial;
  readonly teakWoodMat: THREE.MeshStandardMaterial;
  readonly waterTankMat: THREE.MeshStandardMaterial;
  readonly curtainGlassMat: THREE.MeshPhysicalMaterial;
  readonly foliageShrubMat: THREE.MeshStandardMaterial;
  readonly rockLateriteMat: THREE.MeshStandardMaterial;
  readonly utilityPoleMat: THREE.MeshStandardMaterial;
  readonly constructionOrangeMat: THREE.MeshStandardMaterial;
  readonly medicalCrossRedMat: THREE.MeshStandardMaterial;

  private readonly seaTimeUniform = { value: 0 };
  private readonly signMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
  private readonly awningMaterialCache = new Map<number, THREE.MeshStandardMaterial>();

  constructor(assets: AssetManager) {
    this.textures = createKozhikodeTextures(assets);
    this.assetsRef = assets;

    const sandTex = assets.getOrCreateProceduralTexture(
      'kzd_beach_sand',
      256,
      256,
      THREE.SRGBColorSpace,
      (ctx, w, h) => {
        ctx.fillStyle = '#d4b384';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 6000; i++) {
          const x = (i * 83) % w;
          const y = (i * 179) % h;
          const shade = 175 + (i % 55);
          ctx.fillStyle = `rgb(${shade}, ${Math.floor(shade * 0.85)}, ${Math.floor(shade * 0.62)})`;
          ctx.fillRect(x, y, 2, 2);
        }
      },
      20,
      40,
    );

    this.asphaltMat = new THREE.MeshStandardMaterial({
      map: this.textures.asphaltMap,
      bumpMap: this.textures.asphaltBump,
      bumpScale: 0.045,
      roughness: 0.66,
      metalness: 0.06,
    });

    this.plainAsphaltMat = new THREE.MeshStandardMaterial({
      color: 0x252a34,
      bumpMap: this.textures.asphaltBump,
      bumpScale: 0.045,
      roughness: 0.7,
      metalness: 0.05,
    });

    this.sidewalkMat = new THREE.MeshStandardMaterial({
      map: this.textures.sidewalkMap,
      roughness: 0.84,
      metalness: 0.02,
    });

    this.lateriteMat = new THREE.MeshStandardMaterial({
      map: this.textures.lateriteMap,
      bumpMap: this.textures.lateriteBump,
      bumpScale: 0.07,
      roughness: 0.88,
      metalness: 0.02,
    });

    this.grassMat = new THREE.MeshStandardMaterial({
      map: this.textures.grassMap,
      roughness: 0.92,
    });

    this.sandMat = new THREE.MeshStandardMaterial({
      map: sandTex,
      roughness: 0.94,
    });

    this.terracottaRoofMat = new THREE.MeshStandardMaterial({
      map: this.textures.terracottaRoofMap,
      roughness: 0.74,
    });

    this.stripeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.68,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    // Arabian Sea PBR water extended via onBeforeCompile for realistic swell displacement
    this.seaWaterMat = new THREE.MeshPhysicalMaterial({
      color: 0x0b636e,
      normalMap: this.textures.waterNormalMap,
      normalScale: new THREE.Vector2(0.52, 0.52),
      roughness: 0.14,
      metalness: 0.18,
      clearcoat: 0.92,
      clearcoatRoughness: 0.09,
    });
    this.seaWaterMat.onBeforeCompile = (shader) => {
      shader.uniforms.uWaveTime = this.seaTimeUniform;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uWaveTime;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float swellA = sin(transformed.z * 0.09 + uWaveTime * 1.45) * 0.18;
           float swellB = cos(transformed.x * 0.11 - uWaveTime * 1.1) * 0.12;
           transformed.y += swellA + swellB;`,
        );
    };
    this.seaWaterMat.customProgramCacheKey = () => 'kzd_arabian_sea_v2';

    this.tankWaterMat = new THREE.MeshPhysicalMaterial({
      color: 0x0d746b,
      normalMap: this.textures.waterNormalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.12,
      metalness: 0.15,
      clearcoat: 0.95,
      clearcoatRoughness: 0.08,
    });

    this.shopGlassNightMat = new THREE.MeshPhysicalMaterial({
      color: 0xfef3c7,
      emissive: 0xd97706,
      emissiveIntensity: 0.45,
      roughness: 0.12,
      clearcoat: 0.9,
    });

    this.streetLampBulbMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xffb84d,
      emissiveIntensity: 1.4,
    });

    this.vehicleHeadlampMat = new THREE.MeshStandardMaterial({
      color: 0xfef9c3,
      emissive: 0xfde047,
      emissiveIntensity: 0.85,
    });

    this.palmTrunkMat = new THREE.MeshStandardMaterial({
      color: 0x7c5840,
      roughness: 0.92,
      metalness: 0.02,
    });

    this.palmFrondMat = new THREE.MeshStandardMaterial({
      color: 0x2e6f32,
      roughness: 0.65,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });

    this.shadeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4636, roughness: 0.94 });
    this.shadeLeafMat = new THREE.MeshStandardMaterial({ color: 0x245c2a, roughness: 0.8 });

    // Pooled Building & Street Furniture Materials
    this.facadeWarmMat = new THREE.MeshStandardMaterial({ map: this.textures.shopFacadeWarm, roughness: 0.78, metalness: 0.04 });
    this.facadeCreamMat = new THREE.MeshStandardMaterial({ map: this.textures.shopFacadeCream, roughness: 0.78, metalness: 0.04 });
    this.facadeTealMat = new THREE.MeshStandardMaterial({ map: this.textures.shopFacadeTeal, roughness: 0.78, metalness: 0.04 });
    this.facadeApartmentMat = new THREE.MeshStandardMaterial({ map: this.textures.apartmentFacade, roughness: 0.8, metalness: 0.04 });
    this.facadeHospitalMat = new THREE.MeshStandardMaterial({ map: this.textures.hospitalFacade, roughness: 0.68, metalness: 0.08 });
    this.facadeOfficeMat = new THREE.MeshStandardMaterial({ map: this.textures.officeCurtainFacade, roughness: 0.35, metalness: 0.25 });

    this.stuccoCreamMat = new THREE.MeshStandardMaterial({ color: 0xf5ebd8, roughness: 0.8 });
    this.stuccoWarmMat = new THREE.MeshStandardMaterial({ color: 0xebd4ba, roughness: 0.82 });
    this.stuccoMintMat = new THREE.MeshStandardMaterial({ color: 0xdbe7e0, roughness: 0.82 });
    this.stuccoOchreMat = new THREE.MeshStandardMaterial({ color: 0xd9a86c, roughness: 0.82 });
    this.stuccoSlateMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.78 });

    this.concretePillarMat = new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.84 });
    this.shutterSteelMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.52, metalness: 0.55 });
    this.darkIronMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.42, metalness: 0.75 });
    this.parapetMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85 });
    this.teakWoodMat = new THREE.MeshStandardMaterial({ color: 0x5c3317, roughness: 0.68 });
    this.waterTankMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.55 });
    this.curtainGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      roughness: 0.14,
      metalness: 0.28,
      clearcoat: 0.9,
    });
    this.foliageShrubMat = new THREE.MeshStandardMaterial({ color: 0x2f7a32, roughness: 0.76, side: THREE.DoubleSide });
    this.rockLateriteMat = new THREE.MeshStandardMaterial({ color: 0x6b3a2b, roughness: 0.94 });
    this.utilityPoleMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.78, metalness: 0.2 });
    this.constructionOrangeMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.65 });
    this.medicalCrossRedMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0x991b1b,
      emissiveIntensity: 0.35,
      roughness: 0.4,
    });

    // Register shared materials in AssetManager for clean lifecycle disposal
    assets.registerMaterial('kzd_asphalt', this.asphaltMat);
    assets.registerMaterial('kzd_plain_asphalt', this.plainAsphaltMat);
    assets.registerMaterial('kzd_sidewalk', this.sidewalkMat);
    assets.registerMaterial('kzd_laterite', this.lateriteMat);
    assets.registerMaterial('kzd_grass', this.grassMat);
    assets.registerMaterial('kzd_sand', this.sandMat);
    assets.registerMaterial('kzd_roof_tile', this.terracottaRoofMat);
    assets.registerMaterial('kzd_stripe', this.stripeMat);
    assets.registerMaterial('kzd_sea_water', this.seaWaterMat);
    assets.registerMaterial('kzd_tank_water', this.tankWaterMat);
    assets.registerMaterial('kzd_shop_glass', this.shopGlassNightMat);
    assets.registerMaterial('kzd_lamp_bulb', this.streetLampBulbMat);
    assets.registerMaterial('kzd_vehicle_lamp', this.vehicleHeadlampMat);
    assets.registerMaterial('kzd_palm_trunk', this.palmTrunkMat);
    assets.registerMaterial('kzd_palm_frond', this.palmFrondMat);
    assets.registerMaterial('kzd_shade_trunk', this.shadeTrunkMat);
    assets.registerMaterial('kzd_shade_leaf', this.shadeLeafMat);
    assets.registerMaterial('kzd_facade_warm', this.facadeWarmMat);
    assets.registerMaterial('kzd_facade_cream', this.facadeCreamMat);
    assets.registerMaterial('kzd_facade_teal', this.facadeTealMat);
    assets.registerMaterial('kzd_facade_apartment', this.facadeApartmentMat);
    assets.registerMaterial('kzd_facade_hospital', this.facadeHospitalMat);
    assets.registerMaterial('kzd_facade_office', this.facadeOfficeMat);
    assets.registerMaterial('kzd_stucco_cream', this.stuccoCreamMat);
    assets.registerMaterial('kzd_stucco_warm', this.stuccoWarmMat);
    assets.registerMaterial('kzd_stucco_mint', this.stuccoMintMat);
    assets.registerMaterial('kzd_stucco_ochre', this.stuccoOchreMat);
    assets.registerMaterial('kzd_stucco_slate', this.stuccoSlateMat);
    assets.registerMaterial('kzd_pillar_concrete', this.concretePillarMat);
    assets.registerMaterial('kzd_shutter_steel', this.shutterSteelMat);
    assets.registerMaterial('kzd_dark_iron', this.darkIronMat);
    assets.registerMaterial('kzd_parapet', this.parapetMat);
    assets.registerMaterial('kzd_teak_wood', this.teakWoodMat);
    assets.registerMaterial('kzd_water_tank', this.waterTankMat);
    assets.registerMaterial('kzd_curtain_glass', this.curtainGlassMat);
    assets.registerMaterial('kzd_foliage_shrub', this.foliageShrubMat);
    assets.registerMaterial('kzd_rock_laterite', this.rockLateriteMat);
    assets.registerMaterial('kzd_utility_pole', this.utilityPoleMat);
    assets.registerMaterial('kzd_construction_orange', this.constructionOrangeMat);
    assets.registerMaterial('kzd_medical_cross', this.medicalCrossRedMat);
  }

  private readonly assetsRef: AssetManager;

  getAwningMaterial(colorHex: number): THREE.MeshStandardMaterial {
    let mat = this.awningMaterialCache.get(colorHex);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.72,
        side: THREE.DoubleSide,
      });
      this.awningMaterialCache.set(colorHex, mat);
      this.assetsRef.registerMaterial(`kzd_awning_${colorHex.toString(16)}`, mat);
    }
    return mat;
  }

  getSignMaterial(
    key: string,
    malayalam: string,
    english: string,
    bg: string,
    fg: string,
  ): THREE.MeshStandardMaterial {
    const cacheKey = `${key}_${bg}_${fg}`;
    let mat = this.signMaterialCache.get(cacheKey);
    if (!mat) {
      const tex = this.textures.createSignTexture(key, malayalam, english, bg, fg);
      mat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.3,
        roughness: 0.36,
      });
      this.signMaterialCache.set(cacheKey, mat);
      this.assetsRef.registerMaterial(`kzd_sign_mat_${cacheKey}`, mat);
    }
    return mat;
  }

  getRoadSignMaterial(
    key: string,
    routeBadge: string,
    destinationsEn: string[],
    destinationsMl: string,
    bgHex: string,
  ): THREE.MeshStandardMaterial {
    const cacheKey = `road_${key}`;
    let mat = this.signMaterialCache.get(cacheKey);
    if (!mat) {
      const tex = this.textures.createRoadSignTexture(
        key,
        routeBadge,
        destinationsEn,
        destinationsMl,
        bgHex,
      );
      mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.38,
        metalness: 0.12,
      });
      this.signMaterialCache.set(cacheKey, mat);
      this.assetsRef.registerMaterial(`kzd_road_sign_${key}`, mat);
    }
    return mat;
  }

  update(dt: number, nightGlowFactor: number, waterDetailHigh: boolean): void {
    this.seaTimeUniform.value += dt;
    this.textures.waterNormalMap.offset.x = (this.textures.waterNormalMap.offset.x + dt * 0.028) % 1;
    this.textures.waterNormalMap.offset.y = (this.textures.waterNormalMap.offset.y + dt * 0.016) % 1;

    this.shopGlassNightMat.emissiveIntensity = 0.28 + nightGlowFactor * 1.15;
    this.streetLampBulbMat.emissiveIntensity = 0.45 + nightGlowFactor * 2.2;
    this.vehicleHeadlampMat.emissiveIntensity = 0.45 + nightGlowFactor * 1.75;

    const coat = waterDetailHigh ? 0.94 : 0.2;
    if (Math.abs(this.seaWaterMat.clearcoat - coat) > 0.05) {
      this.seaWaterMat.clearcoat = coat;
      this.tankWaterMat.clearcoat = coat;
    }
  }
}
