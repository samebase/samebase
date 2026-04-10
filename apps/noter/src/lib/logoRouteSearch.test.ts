import { describe, expect, it } from 'vite-plus/test'
import {
  DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
  DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
} from '@/components/logoIsometricRenderer'
import { DEFAULT_FACE_COLORS } from '@/components/logoTailwindColors'
import {
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_ROTATION_DEGREES,
  DEFAULT_VOXEL_STATE,
} from '@/components/logoVoxelState'
import {
  buildLogoRouteSearch,
  validateLogoRouteSearch,
} from '@/lib/logoRouteSearch'

describe('logoRouteSearch', () => {
  it('normalizes logo route search into typed values', () => {
    expect(
      validateLogoRouteSearch({
        axis: 'screen-vertical',
        elev: '32.4',
        freeView: '',
        isoSide: '52',
        isoStyle: 'flat',
        leftColor: 'amber-500',
        rightColor: 'emerald-500',
        rot: '721',
        topColor: 'sky-500',
        vox: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({
      axis: 'screen-vertical',
      elev: 32.4,
      freeView: true,
      isoSide: 40,
      isoStyle: 'flat',
      leftColor: 'amber-500',
      rightColor: 'emerald-500',
      rot: 1,
      topColor: 'sky-500',
      vox: DEFAULT_VOXEL_STATE,
    })
  })

  it('drops default logo state when building route search', () => {
    expect(
      buildLogoRouteSearch({
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        faceColors: DEFAULT_FACE_COLORS,
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        rotationAxisMode: 'cube-y',
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        viewSnapEnabled: true,
        voxelState: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({})
  })

  it('drops malformed logo route search values instead of throwing', () => {
    expect(
      validateLogoRouteSearch({
        axis: 'diagonal',
        elev: { nope: true },
        freeView: 'false',
        isoSide: Number.NaN,
        isoStyle: 'wireframe',
        leftColor: '   ',
        rightColor: 4,
        rot: 'not-a-number',
        topColor: null,
        vox: 'bad-voxel-state',
      }),
    ).toEqual({})
  })
})
