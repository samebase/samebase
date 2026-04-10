import { describe, expect, it } from 'vite-plus/test'
import {
  DAYTONA_PROVISIONING_MODE_LIVE_DEBUG,
  DAYTONA_PROVISIONING_MODE_SNAPSHOT_BACKED,
  findLatestActiveDaytonaSnapshotRecord,
  resolveDaytonaProvisioningMode,
} from './provisioning'

describe('daytonaProvisioning', () => {
  it('defaults to snapshot-backed mode', () => {
    expect(resolveDaytonaProvisioningMode()).toBe(
      DAYTONA_PROVISIONING_MODE_SNAPSHOT_BACKED,
    )
    expect(resolveDaytonaProvisioningMode(null)).toBe(
      DAYTONA_PROVISIONING_MODE_SNAPSHOT_BACKED,
    )
  })

  it('preserves explicit live-debug mode', () => {
    expect(
      resolveDaytonaProvisioningMode(DAYTONA_PROVISIONING_MODE_LIVE_DEBUG),
    ).toBe(DAYTONA_PROVISIONING_MODE_LIVE_DEBUG)
  })

  it('selects the newest active snapshot with a name', () => {
    expect(
      findLatestActiveDaytonaSnapshotRecord([
        {
          status: 'failed',
          snapshotName: 'noter-main-a',
          commitSha: 'aaaaaaa',
          createdAt: 1,
        },
        {
          status: 'active',
          snapshotName: '',
          commitSha: 'bbbbbbb',
          createdAt: 2,
        },
        {
          status: 'active',
          snapshotName: 'noter-main-c',
          commitSha: 'ccccccc',
          createdAt: 3,
        },
        {
          status: 'active',
          snapshotName: 'noter-main-d',
          commitSha: 'ddddddd',
          createdAt: 4,
        },
      ]),
    ).toEqual({
      status: 'active',
      snapshotName: 'noter-main-d',
      commitSha: 'ddddddd',
      createdAt: 4,
    })
  })

  it('returns null when there is no usable active snapshot', () => {
    expect(
      findLatestActiveDaytonaSnapshotRecord([
        {
          status: 'queued',
          snapshotName: 'noter-main-a',
          commitSha: 'aaaaaaa',
          createdAt: 1,
        },
        {
          status: 'active',
          snapshotName: undefined,
          commitSha: 'bbbbbbb',
          createdAt: 2,
        },
      ]),
    ).toBeNull()
  })
})
