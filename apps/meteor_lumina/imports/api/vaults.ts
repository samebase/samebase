import { Mongo } from "meteor/mongo";

export interface Vault {
  _id?: string;
  userId: string; // Reference to users collection
  ghRepoId: string;
  ghRepoOwner: string;
  ghRepoName: string;
  createdAt?: Date;
}

export const VaultsCollection = new Mongo.Collection<Vault>("vaults");


