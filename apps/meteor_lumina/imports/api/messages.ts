import { Mongo } from "meteor/mongo";

export interface Message {
  _id?: string;
  userId: string; // Reference to users collection
  body: string;
  createdAt?: Date;
}

export const MessagesCollection = new Mongo.Collection<Message>("messages");


