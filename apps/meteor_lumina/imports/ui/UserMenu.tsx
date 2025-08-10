import React from 'react'
import { ThemeToggle } from '/imports/ui/ThemeToggle'
import { Button } from '/imports/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '/imports/components/ui/dropdown-menu'
import { Meteor } from 'meteor/meteor'
import { PersonIcon } from '@radix-ui/react-icons'
import { ReactNode } from 'react'
import { clsx } from 'clsx'

export function UserMenu({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center gap-2 text-sm font-medium', className)}>
      {children}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon" className="rounded-full">
            <PersonIcon className="h-5 w-5" />
            <span className="sr-only">Toggle user menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{children}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center gap-2 py-0 font-normal">
            Theme
            <ThemeToggle />
          </DropdownMenuLabel>
          <SignOutButton />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function SignOutButton() {
  const handleSignOut = () => {
    Meteor.logout()
  }
  return <DropdownMenuItem onClick={handleSignOut}>Sign out</DropdownMenuItem>
}
