'use client'

import React, { FormEvent, useState } from 'react'
import { Button } from '/imports/components/ui/button'
import { Input } from '/imports/components/ui/input'
import { MessageList } from '/imports/ui/Chat/MessageList'
import { Message } from '/imports/ui/Chat/Message'
import { useTracker } from 'meteor/react-meteor-data'
import { Meteor } from 'meteor/meteor'

export function Chat({ viewer }: { viewer: string }) {
  const [newMessageText, setNewMessageText] = useState('')

  const messages = useTracker(() => {
    return Meteor.callAsync('listMessages')
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newMessageText.trim()) return

    try {
      await Meteor.callAsync('sendMessage', newMessageText)
      setNewMessageText('')
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }

  return (
    <>
      <MessageList messages={messages}>
        {messages?.map(message => (
          <Message
            key={message._id}
            author={message.userId}
            authorName={message.author}
            viewer={viewer}
          >
            {message.body}
          </Message>
        ))}
      </MessageList>
      <div className="border-t">
        <form onSubmit={handleSubmit} className="container flex gap-2 py-4">
          <Input
            value={newMessageText}
            onChange={event => setNewMessageText(event.target.value)}
            placeholder="Write a message…"
          />
          <Button type="submit" disabled={newMessageText === ''}>
            Send
          </Button>
        </form>
      </div>
    </>
  )
}
