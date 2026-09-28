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
  const coverKinds = [0, 1, 2, 3] as const;
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

const APERTURE_BOUNDS_SHADER = `
vec4 readHoverApertureBounds(
  vec4 state,
  float cellMinimumA,
  float cellMinimumB,
  float cellSize
) {
  float openness = state.r;
  float widthA = openness <= 0.0 ? 0.0 : pow(openness, state.a);
  float widthB = openness <= 0.0 ? 0.0 : pow(openness, 1.0 - state.a);
  float minimumA = cellMinimumA + state.g * cellSize * (1.0 - widthA);
  float minimumB = cellMinimumB + state.b * cellSize * (1.0 - widthB);
  return vec4(
    minimumA,
    minimumA + cellSize * widthA,
    minimumB,
    minimumB + cellSize * widthB
  );
}
`;

const SURFACE_VERTEX_SHADER = `
uniform float hoverWorldSize;
varying vec3 vHoverSpongePosition;

void main() {
  vec4 spongePosition = instanceMatrix * vec4(position, 1.0);
  vHoverSpongePosition = spongePosition.xyz / hoverWorldSize + 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * spongePosition;
  // A shell fragment is the nearest valid surface until its local opening discards it.
  gl_Position.z = -gl_Position.w;
}
`;

function createSurfaceFragmentShader(
  stages: readonly { channelStateOffset: number; gridSize: number }[],
): string {
  let apertureChecks = "";
  for (const stage of stages) {
    const faceGridSize = stage.gridSize / 3;
    apertureChecks += `
  {
    float faceGridSize = ${faceGridSize.toFixed(1)};
    float faceCellSize = 1.0 / faceGridSize;
    float holeSize = faceCellSize / 3.0;
    float coordinateA = min(floor(clamp(pointA, 0.0, 1.0) * faceGridSize), faceGridSize - 1.0);
    float coordinateB = min(floor(clamp(pointB, 0.0, 1.0) * faceGridSize), faceGridSize - 1.0);
    float channelStateIndex =
      ${stage.channelStateOffset.toFixed(1)} +
      hoverFaceAxis * faceGridSize * faceGridSize +
      coordinateA * faceGridSize +
      coordinateB;
    vec4 state = readHoverState(channelStateIndex);
    if (state.r > 0.0) {
      vec4 apertureBounds = readHoverApertureBounds(
        state,
        (coordinateA + 1.0 / 3.0) * faceCellSize,
        (coordinateB + 1.0 / 3.0) * faceCellSize,
        holeSize
      );
      if (
        pointA >= apertureBounds.x &&
        pointA <= apertureBounds.y &&
        pointB >= apertureBounds.z &&
        pointB <= apertureBounds.w
      ) {
        discard;
      }
    }
  }
`;
  }

  return `
uniform float hoverFaceAxis;
uniform vec3 hoverColor;
uniform sampler2D hoverStateTexture;
uniform float hoverStateTextureSize;
varying vec3 vHoverSpongePosition;

${APERTURE_BOUNDS_SHADER}

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

void main() {
  float tangentAxisA = hoverFaceAxis < 0.5 ? 1.0 : 0.0;
  float tangentAxisB = hoverFaceAxis > 1.5 ? 1.0 : 2.0;
  float pointA = readAxis(vHoverSpongePosition, tangentAxisA);
  float pointB = readAxis(vHoverSpongePosition, tangentAxisB);
  if (
    pointA >= 1.0 / 3.0 &&
    pointA <= 2.0 / 3.0 &&
    pointB >= 1.0 / 3.0 &&
    pointB <= 2.0 / 3.0
  ) {
    discard;
  }
${apertureChecks}
  gl_FragColor = vec4(hoverColor, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
}

export type MengerHoverFaceMaterialState = {
  colorUniforms: {
    left: THREE.IUniform<THREE.Color>;
    right: THREE.IUniform<THREE.Color>;
    top: THREE.IUniform<THREE.Color>;
  };
  materials: THREE.ShaderMaterial[];
};

export function createMengerHoverSurfaceMaterials({
  leftColor,
  rightColor,
  stages,
  stateTexture,
  topColor,
  worldSize,
}: {
  leftColor: THREE.ColorRepresentation;
  rightColor: THREE.ColorRepresentation;
  stages: readonly { channelStateOffset: number; gridSize: number }[];
  stateTexture: MengerHoverTexture;
  topColor: THREE.ColorRepresentation;
  worldSize: number;
}): MengerHoverFaceMaterialState {
  const fragmentShader = createSurfaceFragmentShader(stages);
  const createMaterial = (color: THREE.IUniform<THREE.Color>, faceAxis: number) =>
    new THREE.ShaderMaterial({
      depthFunc: THREE.LessEqualDepth,
      depthWrite: true,
      fragmentShader,
      uniforms: {
        hoverColor: color,
        hoverFaceAxis: { value: faceAxis },
        hoverStateTexture: { value: stateTexture.texture },
        hoverStateTextureSize: { value: stateTexture.size },
        hoverWorldSize: { value: worldSize },
      },
      vertexShader: SURFACE_VERTEX_SHADER,
    });
  const colorUniforms = {
    left: { value: new THREE.Color(leftColor) },
    right: { value: new THREE.Color(rightColor) },
    top: { value: new THREE.Color(topColor) },
  };
  const rightMaterial = createMaterial(colorUniforms.right, 0);
  const topMaterial = createMaterial(colorUniforms.top, 1);
  const leftMaterial = createMaterial(colorUniforms.left, 2);

  return {
    colorUniforms,
    materials: [rightMaterial, rightMaterial, topMaterial, topMaterial, leftMaterial, leftMaterial],
  };
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
varying vec4 vHoverCoverBounds;
varying vec3 vHoverTransformedPosition;
varying vec3 vHoverSpongePosition;

${APERTURE_BOUNDS_SHADER}

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

void writeInterval(
  inout vec3 value,
  vec3 source,
  float axis,
  float minimum,
  float maximum
) {
  float component =
    readAxis(source, axis) * (maximum - minimum) +
    (minimum + maximum) * 0.5;
  writeAxis(value, axis, component);
}

void main() {
  vec4 state = readHoverState(hoverChannelStateIndex);
  vec4 apertureBounds = readHoverApertureBounds(state, -0.5, -0.5, 1.0);
  float minimumA = apertureBounds.x;
  float maximumA = apertureBounds.y;
  float minimumB = apertureBounds.z;
  float maximumB = apertureBounds.w;
  float tangentAxisA = hoverHoleAxis < 0.5 ? 1.0 : 0.0;
  float tangentAxisB = hoverHoleAxis > 1.5 ? 1.0 : 2.0;

  vec3 transformed = position;
  // These four slabs exactly tile the cell outside the aperture. The fragment
  // shader's internal-wall rules depend on this order.
  if (hoverCoverKind < 0.5) {
    writeInterval(transformed, position, tangentAxisA, -0.5, minimumA);
  } else if (hoverCoverKind < 1.5) {
    writeInterval(transformed, position, tangentAxisA, maximumA, 0.5);
  } else if (hoverCoverKind < 2.5) {
    writeInterval(transformed, position, tangentAxisA, minimumA, maximumA);
    writeInterval(transformed, position, tangentAxisB, -0.5, minimumB);
  } else {
    writeInterval(transformed, position, tangentAxisA, minimumA, maximumA);
    writeInterval(transformed, position, tangentAxisB, maximumB, 0.5);
  }

  vec4 spongePosition = instanceMatrix * vec4(transformed, 1.0);
  vHoverBlockerLink = vec2(hoverBlockerLinkCount, hoverBlockerLinkOffset);
  vHoverCover = vec4(hoverCoverKind, hoverFaceAxis, hoverFaceSign, hoverHoleAxis);
  vHoverCoverBounds = vec4(minimumA, maximumA, minimumB, maximumB);
  vHoverTransformedPosition = transformed;
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
varying vec4 vHoverCoverBounds;
varying vec3 vHoverTransformedPosition;
varying vec3 vHoverSpongePosition;

${APERTURE_BOUNDS_SHADER}

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
  float coverKind = vHoverCover.x;
  float faceAxis = vHoverCover.y;
  float faceSign = vHoverCover.z;
  float holeAxis = vHoverCover.w;
  float minimumA = vHoverCoverBounds.x;
  float maximumA = vHoverCoverBounds.y;
  float minimumB = vHoverCoverBounds.z;
  float maximumB = vHoverCoverBounds.w;
  float tangentAxisA = holeAxis < 0.5 ? 1.0 : 0.0;
  float tangentAxisB = holeAxis > 1.5 ? 1.0 : 2.0;
  if (coverKind < 0.5) {
    if (minimumA <= -0.5) {
      discard;
    }
    bool isApertureWall =
      abs(faceAxis - tangentAxisA) < 0.5 &&
      faceSign > 0.5;
    float pointB = readAxis(vHoverTransformedPosition, tangentAxisB);
    bool coveredByBSlab = pointB <= minimumB || pointB >= maximumB;
    if (isApertureWall && coveredByBSlab) {
      discard;
    }
  } else if (coverKind < 1.5) {
    if (maximumA >= 0.5) {
      discard;
    }
    bool isApertureWall =
      abs(faceAxis - tangentAxisA) < 0.5 &&
      faceSign < -0.5;
    float pointB = readAxis(vHoverTransformedPosition, tangentAxisB);
    bool coveredByBSlab = pointB <= minimumB || pointB >= maximumB;
    if (isApertureWall && coveredByBSlab) {
      discard;
    }
  } else if (coverKind < 2.5) {
    if (maximumA <= minimumA || minimumB <= -0.5) {
      discard;
    }
    if (abs(faceAxis - tangentAxisA) < 0.5) {
      discard;
    }
  } else {
    if (maximumA <= minimumA || maximumB >= 0.5) {
      discard;
    }
    if (abs(faceAxis - tangentAxisA) < 0.5) {
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
        vec4 apertureBounds = readHoverApertureBounds(state, link.g, link.b, link.a);
        float minimumA = apertureBounds.x;
        float maximumA = apertureBounds.y;
        float minimumB = apertureBounds.z;
        float maximumB = apertureBounds.w;
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
}): MengerHoverFaceMaterialState {
  const createMaterial = (color: THREE.IUniform<THREE.Color>) =>
    new THREE.ShaderMaterial({
      fragmentShader: createCoverFragmentShader(maximumBlockerLinksPerMove),
      uniforms: {
        hoverBlockerLinkTexture: { value: blockerLinkTexture.texture },
        hoverBlockerLinkTextureSize: { value: blockerLinkTexture.size },
        hoverColor: color,
        hoverStateTexture: { value: stateTexture.texture },
        hoverStateTextureSize: { value: stateTexture.size },
        hoverWorldSize: { value: worldSize },
      },
      vertexShader: COVER_VERTEX_SHADER,
    });
  const colorUniforms = {
    left: { value: new THREE.Color(leftColor) },
    right: { value: new THREE.Color(rightColor) },
    top: { value: new THREE.Color(topColor) },
  };
  const rightMaterial = createMaterial(colorUniforms.right);
  const topMaterial = createMaterial(colorUniforms.top);
  const leftMaterial = createMaterial(colorUniforms.left);

  return {
    colorUniforms,
    materials: [rightMaterial, rightMaterial, topMaterial, topMaterial, leftMaterial, leftMaterial],
  };
}
