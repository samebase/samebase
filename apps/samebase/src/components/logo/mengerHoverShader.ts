import { type MengerHoverStageTopology } from "@samebase/logo-model/menger-hover";
import * as THREE from "three";

const TEXTURE_CHANNEL_COUNT = 4;

export type MengerHoverTexture = {
  data: Float32Array;
  size: number;
  texture: THREE.DataTexture;
};

function createFloatTexture(texelCount: number): MengerHoverTexture {
  const size = Math.max(1, Math.ceil(Math.sqrt(texelCount)));
  const data = new Float32Array(size * size * TEXTURE_CHANNEL_COUNT);
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
  texture.internalFormat = "RGBA32F";
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return { data, size, texture };
}

export function createMengerHoverStateTexture(channelCount: number): MengerHoverTexture {
  return createFloatTexture(channelCount);
}

export function createMengerHoverCoverGeometry(
  geometry: THREE.BoxGeometry,
  stage: MengerHoverStageTopology,
): THREE.BoxGeometry {
  const coverGeometry = geometry.clone();
  coverGeometry.setAttribute(
    "hoverBlockerLinkCount",
    new THREE.InstancedBufferAttribute(Float32Array.from(stage.moveBlockerLinkCounts), 1),
  );
  coverGeometry.setAttribute(
    "hoverBlockerLinkOffset",
    new THREE.InstancedBufferAttribute(Float32Array.from(stage.moveBlockerLinkOffsets), 1),
  );
  coverGeometry.setAttribute(
    "hoverChannelStateIndex",
    new THREE.InstancedBufferAttribute(Float32Array.from(stage.moveChannelStateIndices), 1),
  );
  coverGeometry.setAttribute(
    "hoverHoleAxis",
    new THREE.InstancedBufferAttribute(Float32Array.from(stage.moveHoleAxes), 1),
  );

  return coverGeometry;
}

export function createMengerHoverBlockerLinkTexture(
  stage: MengerHoverStageTopology,
): MengerHoverTexture {
  const result = createFloatTexture(stage.blockerLinks.length);
  stage.blockerLinks.forEach((link, linkIndex) => {
    const offset = linkIndex * TEXTURE_CHANNEL_COUNT;
    result.data[offset] = link.channelStateIndex * 3 + link.axis;
    result.data[offset + 1] = link.minimumA;
    result.data[offset + 2] = link.minimumB;
    result.data[offset + 3] = link.size;
  });
  result.texture.needsUpdate = true;

  return result;
}

const COVER_VERTEX_SHADER = `
attribute float hoverBlockerLinkCount;
attribute float hoverBlockerLinkOffset;
attribute float hoverChannelStateIndex;
attribute float hoverHoleAxis;
uniform float hoverCoverKind;
uniform sampler2D hoverStateTexture;
uniform float hoverStateTextureSize;
uniform float hoverWorldSize;
varying float vHoverBlockerLinkCount;
varying float vHoverBlockerLinkOffset;
varying vec3 vHoverSpongePosition;

vec4 readHoverState(float index) {
  float x = mod(index, hoverStateTextureSize);
  float y = floor(index / hoverStateTextureSize);
  vec2 uv = (vec2(x, y) + 0.5) / hoverStateTextureSize;
  return texture2D(hoverStateTexture, uv);
}

void main() {
  vec4 state = readHoverState(hoverChannelStateIndex);
  float openness = state.r;
  float weight = hoverCoverKind < 0.5 ? state.a : 1.0 - state.a;
  float signValue = hoverCoverKind < 0.5 ? state.g : state.b;
  float slide = openness <= 0.0 ? 0.0 : pow(openness, weight);
  float signedSlide = signValue * slide;
  float tangentAxis;
  if (hoverCoverKind < 0.5) {
    tangentAxis = hoverHoleAxis < 0.5 ? 1.0 : 0.0;
  } else {
    tangentAxis = hoverHoleAxis > 1.5 ? 1.0 : 2.0;
  }

  vec3 transformed = position;
  float scaleValue = max(0.0, 1.0 - abs(signedSlide));
  if (tangentAxis < 0.5) {
    transformed.x = transformed.x * scaleValue + signedSlide * 0.5;
  } else if (tangentAxis < 1.5) {
    transformed.y = transformed.y * scaleValue + signedSlide * 0.5;
  } else {
    transformed.z = transformed.z * scaleValue + signedSlide * 0.5;
  }

  vec4 spongePosition = instanceMatrix * vec4(transformed, 1.0);
  vHoverSpongePosition = spongePosition.xyz / hoverWorldSize + 0.5;
  vHoverBlockerLinkCount = hoverBlockerLinkCount;
  vHoverBlockerLinkOffset = hoverBlockerLinkOffset;
  gl_Position = projectionMatrix * modelViewMatrix * spongePosition;
}
`;

function createCoverFragmentShader(maximumBlockerLinksPerMove: number): string {
  const loopLimit = Math.max(1, maximumBlockerLinksPerMove);
  return `
uniform sampler2D hoverBlockerLinkTexture;
uniform float hoverBlockerLinkTextureSize;
uniform vec3 hoverColor;
uniform sampler2D hoverStateTexture;
uniform float hoverStateTextureSize;
varying float vHoverBlockerLinkCount;
varying float vHoverBlockerLinkOffset;
varying vec3 vHoverSpongePosition;

vec4 readTextureValue(sampler2D sourceTexture, float textureSize, float index) {
  float x = mod(index, textureSize);
  float y = floor(index / textureSize);
  vec2 uv = (vec2(x, y) + 0.5) / textureSize;
  return texture2D(sourceTexture, uv);
}

void main() {
  for (int linkIndex = 0; linkIndex < ${loopLimit}; linkIndex += 1) {
    if (float(linkIndex) < vHoverBlockerLinkCount) {
      vec4 link = readTextureValue(
        hoverBlockerLinkTexture,
        hoverBlockerLinkTextureSize,
        vHoverBlockerLinkOffset + float(linkIndex)
      );
      float packedChannelAndAxis = link.r;
      float rayAxis = mod(packedChannelAndAxis, 3.0);
      float channelStateIndex = floor(packedChannelAndAxis / 3.0);
      vec4 state = readTextureValue(
        hoverStateTexture,
        hoverStateTextureSize,
        channelStateIndex
      );
      float openness = state.r;
      if (openness > 0.0) {
        float slideA = pow(openness, state.a);
        float slideB = pow(openness, 1.0 - state.a);
        float maximumA = link.g + link.a;
        float maximumB = link.b + link.a;
        float minimumA = state.g > 0.0 ? link.g : maximumA - link.a * slideA;
        float minimumB = state.b > 0.0 ? link.b : maximumB - link.a * slideB;
        maximumA = state.g > 0.0 ? link.g + link.a * slideA : maximumA;
        maximumB = state.b > 0.0 ? link.b + link.a * slideB : maximumB;
        float pointA;
        float pointB;
        if (rayAxis < 0.5) {
          pointA = vHoverSpongePosition.y;
          pointB = vHoverSpongePosition.z;
        } else if (rayAxis < 1.5) {
          pointA = vHoverSpongePosition.x;
          pointB = vHoverSpongePosition.z;
        } else {
          pointA = vHoverSpongePosition.x;
          pointB = vHoverSpongePosition.y;
        }
        if (
          pointA >= minimumA &&
          pointA <= maximumA &&
          pointB >= minimumB &&
          pointB <= maximumB
        ) {
          discard;
        }
      }
    }
  }

  gl_FragColor = vec4(hoverColor, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
}

export function createMengerHoverCoverMaterials({
  blockerLinkTexture,
  coverKind,
  leftColor,
  maximumBlockerLinksPerMove,
  rightColor,
  stateTexture,
  topColor,
  worldSize,
}: {
  blockerLinkTexture: MengerHoverTexture;
  coverKind: 0 | 1;
  leftColor: THREE.ColorRepresentation;
  maximumBlockerLinksPerMove: number;
  rightColor: THREE.ColorRepresentation;
  stateTexture: MengerHoverTexture;
  topColor: THREE.ColorRepresentation;
  worldSize: number;
}): THREE.ShaderMaterial[] {
  const createMaterial = (color: THREE.ColorRepresentation) =>
    new THREE.ShaderMaterial({
      fragmentShader: createCoverFragmentShader(maximumBlockerLinksPerMove),
      uniforms: {
        hoverBlockerLinkTexture: { value: blockerLinkTexture.texture },
        hoverBlockerLinkTextureSize: { value: blockerLinkTexture.size },
        hoverColor: { value: new THREE.Color(color) },
        hoverCoverKind: { value: coverKind },
        hoverStateTexture: { value: stateTexture.texture },
        hoverStateTextureSize: { value: stateTexture.size },
        hoverWorldSize: { value: worldSize },
      },
      vertexShader: COVER_VERTEX_SHADER,
    });
  const rightMaterial = createMaterial(rightColor);
  const topMaterial = createMaterial(topColor);
  const leftMaterial = createMaterial(leftColor);

  return [rightMaterial, rightMaterial, topMaterial, topMaterial, leftMaterial, leftMaterial];
}
