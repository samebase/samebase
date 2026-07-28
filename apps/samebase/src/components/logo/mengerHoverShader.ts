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
): THREE.BufferGeometry {
  const boxIndex = geometry.getIndex();
  const boxPosition = geometry.getAttribute("position");
  if (!boxIndex) {
    throw new Error("Menger hover covers need indexed box geometry.");
  }
  const coverKinds = [0, 1] as const;
  const vertexCount = boxIndex.count * coverKinds.length;
  const positions = new Float32Array(vertexCount * 3);
  const faceAxes = new Float32Array(vertexCount);
  const faceSigns = new Float32Array(vertexCount);
  const kinds = new Float32Array(vertexCount);
  const coverGeometry = new THREE.BufferGeometry();
  let vertexOffset = 0;
  for (const group of geometry.groups) {
    const materialIndex = group.materialIndex;
    if (materialIndex === undefined) {
      throw new Error("Every Menger cover face must have a material index.");
    }
    const faceAxis = Math.floor(materialIndex / 2);
    const faceSign = materialIndex % 2 === 0 ? 1 : -1;
    const groupStart = vertexOffset;
    for (const coverKind of coverKinds) {
      for (let groupIndex = group.start; groupIndex < group.start + group.count; groupIndex += 1) {
        const boxVertexIndex = boxIndex.getX(groupIndex);
        const vectorOffset = vertexOffset * 3;
        positions[vectorOffset] = boxPosition.getX(boxVertexIndex);
        positions[vectorOffset + 1] = boxPosition.getY(boxVertexIndex);
        positions[vectorOffset + 2] = boxPosition.getZ(boxVertexIndex);
        faceAxes[vertexOffset] = faceAxis;
        faceSigns[vertexOffset] = faceSign;
        kinds[vertexOffset] = coverKind;
        vertexOffset += 1;
      }
    }
    coverGeometry.addGroup(groupStart, vertexOffset - groupStart, materialIndex);
  }
  coverGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  coverGeometry.setAttribute("hoverCoverKind", new THREE.BufferAttribute(kinds, 1));
  coverGeometry.setAttribute("hoverFaceAxis", new THREE.BufferAttribute(faceAxes, 1));
  coverGeometry.setAttribute("hoverFaceSign", new THREE.BufferAttribute(faceSigns, 1));
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
attribute float hoverCoverKind;
attribute float hoverFaceAxis;
attribute float hoverFaceSign;
attribute float hoverHoleAxis;
uniform sampler2D hoverStateTexture;
uniform float hoverStateTextureSize;
uniform float hoverWorldSize;
varying vec2 vHoverBlockerLink;
varying vec4 vHoverCover;
varying vec4 vHoverCoverState;
varying vec3 vHoverOriginalPosition;
varying vec3 vHoverSpongePosition;

vec4 readHoverState(float index) {
  float roundedIndex = floor(index + 0.5);
  float y = floor((roundedIndex + 0.5) / hoverStateTextureSize);
  float x = roundedIndex - y * hoverStateTextureSize;
  vec2 uv = (vec2(x, y) + 0.5) / hoverStateTextureSize;
  return texture2D(hoverStateTexture, uv);
}

float readAxis(vec3 value, float axis) {
  if (axis < 0.5) {
    return value.x;
  }
  if (axis < 1.5) {
    return value.y;
  }
  return value.z;
}

void writeAxis(inout vec3 value, float axis, float component) {
  if (axis < 0.5) {
    value.x = component;
  } else if (axis < 1.5) {
    value.y = component;
  } else {
    value.z = component;
  }
}

void main() {
  vec4 state = readHoverState(hoverChannelStateIndex);
  float openness = state.r;
  float slideA = openness <= 0.0 ? 0.0 : pow(openness, state.a);
  float slideB = openness <= 0.0 ? 0.0 : pow(openness, 1.0 - state.a);
  float tangentAxisA = hoverHoleAxis < 0.5 ? 1.0 : 0.0;
  float tangentAxisB = hoverHoleAxis > 1.5 ? 1.0 : 2.0;

  vec3 transformed = position;
  // Piece A owns the first-axis slab. Piece B owns its vacated gap
  // except for the second-axis aperture, so their volumes never overlap.
  if (hoverCoverKind < 0.5) {
    writeAxis(
      transformed,
      tangentAxisA,
      readAxis(position, tangentAxisA) * (1.0 - slideA) + state.g * slideA * 0.5
    );
  } else {
    writeAxis(
      transformed,
      tangentAxisA,
      readAxis(position, tangentAxisA) * slideA - state.g * (1.0 - slideA) * 0.5
    );
    writeAxis(
      transformed,
      tangentAxisB,
      readAxis(position, tangentAxisB) * (1.0 - slideB) + state.b * slideB * 0.5
    );
  }

  vec4 spongePosition = instanceMatrix * vec4(transformed, 1.0);
  vHoverBlockerLink = vec2(hoverBlockerLinkCount, hoverBlockerLinkOffset);
  vHoverCover = vec4(hoverCoverKind, hoverFaceAxis, hoverFaceSign, hoverHoleAxis);
  vHoverCoverState = vec4(state.g, state.b, slideA, slideB);
  vHoverOriginalPosition = position;
  vHoverSpongePosition = spongePosition.xyz / hoverWorldSize + 0.5;
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
varying vec2 vHoverBlockerLink;
varying vec4 vHoverCover;
varying vec4 vHoverCoverState;
varying vec3 vHoverOriginalPosition;
varying vec3 vHoverSpongePosition;

vec4 readTextureValue(sampler2D sourceTexture, float textureSize, float index) {
  float roundedIndex = floor(index + 0.5);
  float y = floor((roundedIndex + 0.5) / textureSize);
  float x = roundedIndex - y * textureSize;
  vec2 uv = (vec2(x, y) + 0.5) / textureSize;
  return texture2D(sourceTexture, uv);
}

float readAxis(vec3 value, float axis) {
  if (axis < 0.5) {
    return value.x;
  }
  if (axis < 1.5) {
    return value.y;
  }
  return value.z;
}

void main() {
  // Remove collapsed pieces and the shared partition wall. The submitted
  // boxes then rasterize only the boundary of one L-shaped cover solid.
  float coverKind = vHoverCover.x;
  float faceAxis = vHoverCover.y;
  float faceSign = vHoverCover.z;
  float holeAxis = vHoverCover.w;
  float signA = vHoverCoverState.x;
  float signB = vHoverCoverState.y;
  float slideA = vHoverCoverState.z;
  float slideB = vHoverCoverState.w;
  float tangentAxisA = holeAxis < 0.5 ? 1.0 : 0.0;
  float tangentAxisB = holeAxis > 1.5 ? 1.0 : 2.0;
  if (coverKind < 0.5) {
    if (slideA >= 1.0) {
      discard;
    }
    bool isApertureWall =
      abs(faceAxis - tangentAxisA) < 0.5 &&
      faceSign * signA < -0.5;
    bool coveredBySecondPiece =
      signB * readAxis(vHoverOriginalPosition, tangentAxisB) >=
      slideB - 0.5;
    if (isApertureWall && coveredBySecondPiece) {
      discard;
    }
  } else {
    if (slideA <= 0.0 || slideB >= 1.0) {
      discard;
    }
    bool isSharedWall =
      abs(faceAxis - tangentAxisA) < 0.5 &&
      faceSign * signA > 0.5;
    if (isSharedWall) {
      discard;
    }
  }

  for (int linkIndex = 0; linkIndex < ${loopLimit}; linkIndex += 1) {
    if (float(linkIndex) < vHoverBlockerLink.x) {
      vec4 link = readTextureValue(
        hoverBlockerLinkTexture,
        hoverBlockerLinkTextureSize,
        vHoverBlockerLink.y + float(linkIndex)
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
  leftColor,
  maximumBlockerLinksPerMove,
  rightColor,
  stateTexture,
  topColor,
  worldSize,
}: {
  blockerLinkTexture: MengerHoverTexture;
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
