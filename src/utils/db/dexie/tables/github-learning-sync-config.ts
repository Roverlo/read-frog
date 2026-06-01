import { Entity } from "dexie"

export default class GithubLearningSyncConfig extends Entity {
  id!: string
  owner!: string
  repo!: string
  branch!: string
  path!: string
  token?: string
  clientId?: string
  lastSyncAt?: Date
  updatedAt!: Date
}
