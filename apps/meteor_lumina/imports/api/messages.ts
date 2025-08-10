import { Mongo } from 'meteor/mongo'
import { Meteor } from 'meteor/meteor'

export interface Message {
  _id?: string
  userId: string // Reference to users collection
  body: string
  createdAt?: Date
}

export const MessagesCollection = new Mongo.Collection<Message>('messages')

// Message management methods
Meteor.methods({
  async listMessages() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    // Grab the most recent messages
    const messages = await MessagesCollection.find(
      {},
      {
        sort: { createdAt: -1 },
        limit: 100,
      },
    ).fetchAsync()

    // Add the author's name to each message
    const messagesWithAuthors = await Promise.all(
      messages.map(async message => {
        const user = await Meteor.users.findOneAsync(message.userId)
        // @ts-expect-error TODO: add typings file
        const name = user?.profile?.name || user?.services?.github?.username || user?.username
        return { ...message, author: name || 'Unknown' }
      }),
    )

    return messagesWithAuthors
  },

  async sendMessage(body: string) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in')
    }

    // Send a new message
    const messageId = await MessagesCollection.insertAsync({
      body,
      userId: this.userId,
      createdAt: new Date(),
    })

    return messageId
  },
})
