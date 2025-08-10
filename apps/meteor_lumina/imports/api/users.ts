import { Mongo } from "meteor/mongo";

export interface User {
  _id?: string;
  name?: string;
  image?: string;
  email?: string;
  emailVerificationTime?: number;
  phone?: string;
  phoneVerificationTime?: number;
  isAnonymous?: boolean;

  // GitHub integration
  githubUsername: string;
  githubAccessToken?: string;
  githubRefreshToken?: string;
  githubExpiresAt?: number;
}

export const UsersCollection = new Mongo.Collection<User>("users");

// Create indexes
if (Meteor.isServer) {
  UsersCollection.createIndex({ email: 1 });
  UsersCollection.createIndex({ phone: 1 });
}


