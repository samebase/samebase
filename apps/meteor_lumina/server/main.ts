import { Meteor } from 'meteor/meteor'
import { Link, LinksCollection } from '/imports/api/links'
import { Accounts } from 'meteor/accounts-base'
import { ServiceConfiguration } from 'meteor/service-configuration'
import './github'
import '/imports/api/users'
import '/imports/api/messages'
import '/imports/api/fileStaging'
import '/imports/api/collaborative'
import '/imports/api/folderExpansion'
import '/imports/api/vaults'

async function insertLink({ title, url }: Pick<Link, 'title' | 'url'>) {
  await LinksCollection.insertAsync({ title, url, createdAt: new Date() })
}

const SEED_USERNAME = 'meteorite'
const SEED_PASSWORD = 'password'

Meteor.startup(async () => {
  // Configure GitHub OAuth
  await ServiceConfiguration.configurations.upsertAsync(
    { service: 'github' },
    {
      $set: {
        clientId: process.env.GITHUB_CLIENT_ID || Meteor.settings.github?.clientId,
        secret: process.env.GITHUB_CLIENT_SECRET || Meteor.settings.github?.clientSecret,
      },
    },
  )

  // Create a user if one doesn't exist
  if (!(await Accounts.findUserByUsername(SEED_USERNAME))) {
    await Accounts.createUser({
      username: SEED_USERNAME,
      password: SEED_PASSWORD,
    })
  }

  // If the Links collection is empty, add some data.
  if ((await LinksCollection.find().countAsync()) === 0) {
    await insertLink({
      title: 'Do the Tutorial',
      url: 'https://react-tutorial.meteor.com/simple-todos/01-creating-app.html',
    })

    await insertLink({
      title: 'Follow the Guide',
      url: 'https://guide.meteor.com',
    })

    await insertLink({
      title: 'Read the Docs',
      url: 'https://docs.meteor.com',
    })

    await insertLink({
      title: 'Discussions',
      url: 'https://forums.meteor.com',
    })
  }

  // We publish the entire Links collection to all clients.
  // In order to be fetched in real-time to the clients
  Meteor.publish('links', function () {
    return LinksCollection.find()
  })
})
