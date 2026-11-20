import * as THREE from 'three';
import type { AssetManager } from '../assets/AssetManager.ts';

export interface KozhikodeTexturePack {
  asphaltMap: THREE.CanvasTexture;
  asphaltBump: THREE.CanvasTexture;
  sidewalkMap: THREE.CanvasTexture;
  lateriteMap: THREE.CanvasTexture;
  lateriteBump: THREE.CanvasTexture;
  terracottaRoofMap: THREE.CanvasTexture;
  shopFacadeWarm: THREE.CanvasTexture;
  shopFacadeCream: THREE.CanvasTexture;
  shopFacadeTeal: THREE.CanvasTexture;
  apartmentFacade: THREE.CanvasTexture;
  hospitalFacade: THREE.CanvasTexture;
  officeCurtainFacade: THREE.CanvasTexture;
  grassMap: THREE.CanvasTexture;
  waterNormalMap: THREE.CanvasTexture;
  createSignTexture: (key: string, malayalam: string, english: string, bg: string, fg: string) => THREE.CanvasTexture;
  createRoadSignTexture: (
    key: string,
    routeBadge: string,
    destinationsEn: string[],
    destinationsMl: string,
    bgHex: string,
  ) => THREE.CanvasTexture;
}

export function createKozhikodeTextures(assets: AssetManager): KozhikodeTexturePack {
  const asphaltMap = assets.getOrCreateProceduralTexture(
    'kzd_asphalt_albedo',
    512,
    512,
    THREE.SRGBColorSpace,
    (ctx, w, h) => {
      ctx.fillStyle = '#242933';
      ctx.fillRect(0, 0, w, h);

      // Subtle tire wear lanes
      const laneGrad = ctx.createLinearGradient(0, 0, w, 0);
      laneGrad.addColorStop(0, 'rgba(15, 18, 24, 0.25)');
      laneGrad.addColorStop(0.25, 'rgba(48, 55, 68, 0.2)');
      laneGrad.addColorStop(0.5, 'rgba(18, 22, 28, 0.25)');
      laneGrad.addColorStop(0.75, 'rgba(48, 55, 68, 0.2)');
      laneGrad.addColorStop(1, 'rgba(15, 18, 24, 0.25)');
      ctx.fillStyle = laneGrad;
      ctx.fillRect(0, 0, w, h);

      // Mineral aggregate speckle
      for (let i = 0; i < 6500; i++) {
        const x = (i * 73) % w;
        const y = ((i * 197) + Math.floor(i / 3) * 19) % h;
        const v = 32 + (i % 34);
        ctx.fillStyle = `rgb(${v}, ${v + 3}, ${v + 7})`;
        ctx.fillRect(x, y, 2, 2);
      }

      // White outer shoulder lines
      ctx.fillStyle = 'rgba(241, 245, 249, 0.85)';
      ctx.fillRect(16, 0, 8, h);
      ctx.fillRect(w - 24, 0, 8, h);

      // Dashed center median line (amber-white Kerala highway style)
      ctx.fillStyle = 'rgba(245, 180, 40, 0.9)';
      for (let y = 16; y < h; y += 64) {
        ctx.fillRect(w / 2 - 4, y, 8, 36);
      }
    },
    1,
    10,
  );

  const asphaltBump = assets.getOrCreateProceduralTexture(
    'kzd_asphalt_bump',
    256,
    256,
    THREE.NoColorSpace,
    (ctx, w, h) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 4000; i++) {
        const x = (i * 53) % w;
        const y = (i * 131) % h;
        const g = 90 + (i % 80);
        ctx.fillStyle = `rgb(${g},${g},${g})`;
        ctx.fillRect(x, y, 2, 2);
      }
    },
    4,
    24,
  );

  const sidewalkMap = assets.getOrCreateProceduralTexture(
    'kzd_sidewalk_interlock',
    256,
    256,
    THREE.SRGBColorSpace,
    (ctx, w, h) => {
      ctx.fillStyle = '#7c766e';
      ctx.fillRect(0, 0, w, h);
      const tileW = 32;
      const tileH = 16;
      for (let row = 0; row < h / tileH; row++) {
        const offset = (row % 2) * (tileW / 2);
        for (let col = -1; col < w / tileW + 1; col++) {
          const isTerracotta = (row + col) % 4 === 0;
          ctx.fillStyle = isTerracotta ? '#9c5b48' : ((row + col) % 2 === 0 ? '#9e978e' : '#8d867d');
          ctx.fillRect(col * tileW + offset + 1, row * tileH + 1, tileW - 2, tileH - 2);
        }
      }
    },
    16,
    16,
  );

  const lateriteMap = assets.getOrCreateProceduralTexture(
    'kzd_laterite_stone',
    256,
    256,
    THREE.SRGBColorSpace,
    (ctx, w, h) => {
      ctx.fillStyle = '#5c2818';
      ctx.fillRect(0, 0, w, h);
      const bh = 32;
      const bw = 64;
      for (let row = 0; row < h / bh; row++) {
        const ox = (row % 2) * (bw / 2);
        for (let col = -1; col < w / bw + 1; col++) {
          const r = 132 + ((row * 17 + col * 31) % 26);
          const g = 56 + ((row * 11 + col * 19) % 18);
          const b = 34 + ((row * 7 + col * 13) % 12);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(col * bw + ox + 2, row * bh + 2, bw - 4, bh - 4);
          // Porous laterite pitting
          ctx.fillStyle = 'rgba(42, 16, 10, 0.35)';
          for (let p = 0; p < 12; p++) {
            const px = col * bw + ox + 6 + ((p * 19 + row * 7) % (bw - 12));
            const py = row * bh + 6 + ((p * 13 + col * 11) % (bh - 12));
            ctx.fillRect(px, py, 3, 2);
          }
        }
      }
    },
    6,
    2,
  );

  const lateriteBump = assets.getOrCreateProceduralTexture(
    'kzd_laterite_bump',
    256,
    256,
    THREE.NoColorSpace,
    (ctx, w, h) => {
      ctx.fillStyle = '#909090';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#303030';
      ctx.lineWidth = 4;
      for (let y = 0; y < h; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    },
    6,
    2,
  );

  const terracottaRoofMap = assets.getOrCreateProceduralTexture(
    'kzd_mangalore_tiles',
    256,
    256,
    THREE.SRGBColorSpace,
    (ctx, w, h) => {
      ctx.fillStyle = '#8b321d';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 24) {
        for (let x = 0; x < w; x += 16) {
          const shade = ((x + y) % 3) * 10;
          ctx.fillStyle = `rgb(${155 - shade}, ${58 - Math.floor(shade / 2)}, ${34})`;
          ctx.fillRect(x + 1, y + 1, 14, 21);
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.fillRect(x, y + 21, 16, 3);
        }
      }
    },
    4,
    3,
  );

  const buildFacadeTexture = (
    key: string,
    wallHex: string,
    trimHex: string,
    cols = 3,
    coolGlass = false,
  ): THREE.CanvasTexture =>
    assets.getOrCreateProceduralTexture(
      key,
      512,
      512,
      THREE.SRGBColorSpace,
      (ctx, w, h) => {
        ctx.fillStyle = wallHex;
        ctx.fillRect(0, 0, w, h);

        // Subtle humid monsoon plaster weathering near base and cornices
        const weather = ctx.createLinearGradient(0, 0, 0, h);
        weather.addColorStop(0, 'rgba(30, 25, 20, 0.16)');
        weather.addColorStop(0.2, 'rgba(0, 0, 0, 0)');
        weather.addColorStop(0.85, 'rgba(0, 0, 0, 0)');
        weather.addColorStop(1, 'rgba(28, 24, 20, 0.28)');
        ctx.fillStyle = weather;
        ctx.fillRect(0, 0, w, h);

        // Floor cornice bands
        ctx.fillStyle = trimHex;
        ctx.fillRect(0, 0, w, 16);
        ctx.fillRect(0, h * 0.48, w, 14);
        ctx.fillRect(0, h - 14, w, 14);

        const winW = cols >= 4 ? 64 : 86;
        const winH = 128;
        const stepX = Math.floor((w - 56) / cols);
        for (let floor = 0; floor < 2; floor++) {
          const wy = floor === 0 ? 52 : 285;
          for (let c = 0; c < cols; c++) {
            const wx = 34 + c * stepX;
            ctx.fillStyle = '#334155';
            ctx.fillRect(wx - 6, wy - 6, winW + 12, winH + 12);
            const glassGrad = ctx.createLinearGradient(wx, wy, wx, wy + winH);
            if (coolGlass) {
              glassGrad.addColorStop(0, '#0f3d5e');
              glassGrad.addColorStop(0.65, '#38bdf8');
              glassGrad.addColorStop(1, '#1e3a5f');
            } else {
              glassGrad.addColorStop(0, '#1e3a5f');
              glassGrad.addColorStop(0.6, '#2b4c6f');
              glassGrad.addColorStop(1, floor === 1 ? '#b47a3c' : '#1e293b');
            }
            ctx.fillStyle = glassGrad;
            ctx.fillRect(wx, wy, winW, winH);
            ctx.fillStyle = '#e2e8f0';
            ctx.fillRect(wx + winW / 2 - 2, wy, 4, winH);
            ctx.fillRect(wx, wy + winH * 0.52, winW, 4);
            ctx.fillStyle = trimHex;
            ctx.fillRect(wx - 10, wy - 14, winW + 20, 10);
          }
        }
      },
      1,
      1,
    );

  const shopFacadeWarm = buildFacadeTexture('kzd_facade_warm', '#eadbc8', '#b45309');
  const shopFacadeCream = buildFacadeTexture('kzd_facade_cream', '#f1ece1', '#7c2d12');
  const shopFacadeTeal = buildFacadeTexture('kzd_facade_teal', '#d9e5e2', '#0f766e');
  const apartmentFacade = buildFacadeTexture('kzd_facade_apartment', '#e5e0d5', '#475569', 4, false);
  const hospitalFacade = buildFacadeTexture('kzd_facade_hospital', '#f1f5f9', '#0f766e', 4, true);
  const officeCurtainFacade = buildFacadeTexture('kzd_facade_office', '#cbd5e1', '#1e293b', 4, true);

  const grassMap = assets.getOrCreateProceduralTexture(
    'kzd_park_grass',
    256,
    256,
    THREE.SRGBColorSpace,
    (ctx, w, h) => {
      ctx.fillStyle = '#2d5a27';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 4500; i++) {
        const x = (i * 67) % w;
        const y = (i * 149) % h;
        const g = 75 + (i % 45);
        ctx.fillStyle = `rgb(${Math.floor(g * 0.45)}, ${g + 15}, ${Math.floor(g * 0.35)})`;
        ctx.fillRect(x, y, 2, 3);
      }
    },
    10,
    10,
  );

  const waterNormalMap = assets.getOrCreateProceduralTexture(
    'kzd_water_ripples',
    256,
    256,
    THREE.NoColorSpace,
    (ctx, w, h) => {
      ctx.fillStyle = '#8080ff';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < w; x += 4) {
          const wave = Math.sin((x / w) * Math.PI * 8) * Math.cos((y / h) * Math.PI * 8);
          const nx = Math.floor(128 + wave * 36);
          const ny = Math.floor(128 + Math.sin((y / h) * Math.PI * 10) * 28);
          ctx.fillStyle = `rgb(${nx}, ${ny}, 240)`;
          ctx.fillRect(x, y, 4, 4);
        }
      }
    },
    8,
    6,
  );

  const createSignTexture = (
    key: string,
    malayalam: string,
    english: string,
    bg: string,
    fg: string,
  ): THREE.CanvasTexture =>
    assets.getOrCreateProceduralTexture(
      key,
      512,
      128,
      THREE.SRGBColorSpace,
      (ctx, w, h) => {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = fg;
        ctx.lineWidth = 4;
        ctx.strokeRect(6, 6, w - 12, h - 12);

        ctx.fillStyle = fg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 34px "Noto Sans Malayalam", "Plus Jakarta Sans", sans-serif';
        ctx.fillText(malayalam, w / 2, h * 0.38);

        ctx.font = 'bold 22px "Barlow Condensed", "Plus Jakarta Sans", sans-serif';
        ctx.fillText(english.toUpperCase(), w / 2, h * 0.74);
      },
      1,
      1,
    );

  const createRoadSignTexture = (
    key: string,
    routeBadge: string,
    destinationsEn: string[],
    destinationsMl: string,
    bgHex: string,
  ): THREE.CanvasTexture =>
    assets.getOrCreateProceduralTexture(
      key,
      512,
      256,
      THREE.SRGBColorSpace,
      (ctx, w, h) => {
        ctx.fillStyle = bgHex;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 8;
        ctx.strokeRect(8, 8, w - 16, h - 16);

        // Route shield badge top-left
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(26, 26, 118, 44);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 24px "Barlow Condensed", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(routeBadge, 85, 48);

        // Malayalam header right
        ctx.fillStyle = '#fef3c7';
        ctx.textAlign = 'left';
        ctx.font = 'bold 26px "Noto Sans Malayalam", sans-serif';
        ctx.fillText(destinationsMl, 160, 48);

        // Directional lines
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 30px "Barlow Condensed", "Plus Jakarta Sans", sans-serif';
        destinationsEn.slice(0, 2).forEach((line, idx) => {
          ctx.fillText(line.toUpperCase(), 30, 122 + idx * 58);
        });
      },
      1,
      1,
    );

  return {
    asphaltMap,
    asphaltBump,
    sidewalkMap,
    lateriteMap,
    lateriteBump,
    terracottaRoofMap,
    shopFacadeWarm,
    shopFacadeCream,
    shopFacadeTeal,
    apartmentFacade,
    hospitalFacade,
    officeCurtainFacade,
    grassMap,
    waterNormalMap,
    createSignTexture,
    createRoadSignTexture,
  };
}
