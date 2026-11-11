// Trechos de GLSL compartilhados: ruído, madeira procedural e relevo por derivadas.
export const NOISE = /* glsl */`
float tbHash(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float tbNoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(tbHash(i), tbHash(i + vec3(1,0,0)), f.x), mix(tbHash(i + vec3(0,1,0)), tbHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(tbHash(i + vec3(0,0,1)), tbHash(i + vec3(1,0,1)), f.x), mix(tbHash(i + vec3(0,1,1)), tbHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float tbFbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * tbNoise(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
// madeira com o tronco paralelo ao eixo X: anéis viram faixas nas faces compridas e arcos nas pontas
vec3 tbWood(vec3 p, vec3 seed, vec2 ringC, float ringF, vec3 colA, vec3 colB, out float h, out float rough){
  vec3 q = p + seed;
  float warp = tbFbm(q * vec3(0.10, 0.32, 0.32)) * 1.1;
  float r = length(p.yz - ringC) + warp + 0.3 * sin(p.x * 0.31 + seed.x);
  float ring = fract(r * ringF);
  float late = smoothstep(0.50, 0.88, ring) * (1.0 - smoothstep(0.90, 1.0, ring));
  float fiber = tbNoise(vec3(p.x * 0.55, p.y * 34.0, p.z * 34.0) + seed);
  float fiber2 = tbNoise(vec3(p.x * 0.18, p.y * 9.0, p.z * 9.0) + seed * 1.7);
  float pores = smoothstep(0.78, 0.97, tbNoise(vec3(p.x * 1.6, p.y * 64.0, p.z * 64.0) + seed * 3.1));
  vec3 col = mix(colA, colB, clamp(late * 0.8 + fiber * 0.14 + fiber2 * 0.12, 0.0, 1.0));
  col *= 1.0 - pores * 0.16;
  col *= 0.9 + 0.2 * tbFbm(q * vec3(0.05, 0.25, 0.25));
  h = late * 0.7 + fiber * 0.35 + pores * 0.5;
  rough = 0.58 + late * 0.1 - fiber * 0.06 + pores * 0.08;
  return col;
}
`;

export const BUMP = /* glsl */`
{
  vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
  float hx = dFdx(wH), hy = dFdy(wH);
  vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (hx * r1 + hy * r2);
  normal = normalize(abs(det) * normal - grad * uBump);
}
`;

